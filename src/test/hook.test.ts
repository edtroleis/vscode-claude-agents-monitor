import * as assert from 'assert';
import * as path from 'path';

// The hook is plain CommonJS JS shipped as-is; require it and exercise the pure transitions.
const hook = require(path.join(__dirname, '..', '..', 'hooks', 'agent-status-hook.js'));

interface Entry {
  id: string;
  agent: string;
  startedAt: string;
  endedAt?: string;
  status?: string;
}
interface Status {
  running: Entry[];
  recent: Entry[];
}

const empty = (): Status => ({ running: [], recent: [] });

describe('agent-status-hook: applyPre', () => {
  it('adds a running entry without mutating the input', () => {
    const before = empty();
    const after: Status = hook.applyPre(before, {
      session: 's1',
      agent: 'code-reviewer',
      description: 'x',
      project: 'proj',
      now: 1000,
    });
    assert.strictEqual(before.running.length, 0, 'input must not be mutated');
    assert.strictEqual(after.running.length, 1);
    assert.strictEqual(after.running[0].agent, 'code-reviewer');
    assert.ok(after.running[0].id.startsWith('s1:code-reviewer:'));
  });
});

describe('agent-status-hook: applyPost', () => {
  it('moves the matching running entry into recent as completed', () => {
    const started: Status = hook.applyPre(empty(), { session: 's1', agent: 'debugger', now: 1000 });
    const done: Status = hook.applyPost(started, { session: 's1', agent: 'debugger', now: 2000, isError: false });
    assert.strictEqual(done.running.length, 0);
    assert.strictEqual(done.recent.length, 1);
    assert.strictEqual(done.recent[0].status, 'completed');
    assert.strictEqual(done.recent[0].endedAt, new Date(2000).toISOString());
  });

  it('marks errors', () => {
    const started: Status = hook.applyPre(empty(), { session: 's1', agent: 'debugger', now: 1000 });
    const done: Status = hook.applyPost(started, { session: 's1', agent: 'debugger', now: 2000, isError: true });
    assert.strictEqual(done.recent[0].status, 'error');
  });

  it('still records a recent entry when no matching start exists', () => {
    const done: Status = hook.applyPost(empty(), { session: 's9', agent: 'orphan', now: 2000, isError: false });
    assert.strictEqual(done.recent.length, 1);
    assert.strictEqual(done.recent[0].agent, 'orphan');
  });

  it('caps recent history at MAX_RECENT', () => {
    let s: Status = empty();
    for (let i = 0; i < hook.MAX_RECENT + 5; i++) {
      s = hook.applyPost(s, { session: 's', agent: `a${i}`, now: i, isError: false });
    }
    assert.strictEqual(s.recent.length, hook.MAX_RECENT);
    // Oldest entries are dropped; the newest survive.
    assert.strictEqual(s.recent[s.recent.length - 1].agent, `a${hook.MAX_RECENT + 4}`);
  });

  it('pairs the oldest running entry of the same agent', () => {
    let s: Status = hook.applyPre(empty(), { session: 's1', agent: 'dup', now: 100 });
    s = hook.applyPre(s, { session: 's1', agent: 'dup', now: 200 });
    s = hook.applyPost(s, { session: 's1', agent: 'dup', now: 300, isError: false });
    assert.strictEqual(s.running.length, 1);
    assert.strictEqual(s.recent.length, 1);
    // The remaining running one is the newer (now: 200).
    assert.ok(s.running[0].id.endsWith(':200'));
  });
});

interface Pending {
  session: string;
  agent: string;
  description: string;
  at: number;
}
interface FullStatus extends Status {
  pending: Pending[];
}
const emptyFull = (): FullStatus => ({ running: [], recent: [], pending: [] });

describe('agent-status-hook: launch/start/stop (SubagentStart/SubagentStop)', () => {
  it('launch only records a pending entry, nothing runs yet', () => {
    const s: FullStatus = hook.applyLaunch(emptyFull(), {
      session: 's1', agent: 'docs-writer', description: 'Write README', now: 1000,
    });
    assert.strictEqual(s.running.length, 0);
    assert.strictEqual(s.pending.length, 1);
  });

  it('start moves the launch to running with its description and agent id', () => {
    let s: FullStatus = hook.applyLaunch(emptyFull(), {
      session: 's1', agent: 'docs-writer', description: 'Write README', now: 1000,
    });
    s = hook.applyStart(s, { session: 's1', agentId: 'ag1', agent: 'docs-writer', now: 1500 });
    assert.strictEqual(s.pending.length, 0);
    assert.strictEqual(s.running.length, 1);
    assert.strictEqual(s.running[0].id, 's1:ag1');
    assert.strictEqual((s.running[0] as Entry & { description: string }).description, 'Write README');
  });

  it('background agents stay running until their own stop, in any order', () => {
    let s: FullStatus = emptyFull();
    for (const [id, agent] of [['a', 'general-purpose'], ['b', 'ci-cd-specialist'], ['c', 'docs-writer']]) {
      s = hook.applyLaunch(s, { session: 's1', agent, description: agent, now: 1000 });
      s = hook.applyStart(s, { session: 's1', agentId: id, agent, now: 1100 });
    }
    // The launch tool calls returning (legacy PostToolUse) must not matter anymore: only stops count.
    s = hook.applyStop(s, { session: 's1', agentId: 'c', agent: 'docs-writer', now: 70_000, isError: false });
    assert.deepStrictEqual(s.running.map((r) => r.id), ['s1:a', 's1:b']);
    s = hook.applyStop(s, { session: 's1', agentId: 'b', agent: 'ci-cd-specialist', now: 190_000, isError: false });
    s = hook.applyStop(s, { session: 's1', agentId: 'a', agent: 'general-purpose', now: 400_000, isError: false });
    assert.strictEqual(s.running.length, 0);
    assert.deepStrictEqual(s.recent.map((r) => r.agent), ['docs-writer', 'ci-cd-specialist', 'general-purpose']);
    assert.strictEqual(s.recent[2].endedAt, new Date(400_000).toISOString());
  });

  it('two agents of the same type are paired by agent id, not by type', () => {
    let s: FullStatus = emptyFull();
    s = hook.applyStart(s, { session: 's1', agentId: 'x1', agent: 'general-purpose', now: 100 });
    s = hook.applyStart(s, { session: 's1', agentId: 'x2', agent: 'general-purpose', now: 200 });
    s = hook.applyStop(s, { session: 's1', agentId: 'x2', agent: 'general-purpose', now: 300, isError: false });
    assert.deepStrictEqual(s.running.map((r) => r.id), ['s1:x1']);
  });

  it('prune drops stale pending launches and closes running entries that never stopped', () => {
    let s: FullStatus = hook.applyLaunch(emptyFull(), { session: 's1', agent: 'a', now: 0 });
    s = hook.applyStart(s, { session: 's1', agentId: 'r1', agent: 'b', now: 0 });
    s = hook.prune(s, hook.RUNNING_TTL_MS + 1);
    assert.strictEqual(s.pending.length, 0);
    assert.strictEqual(s.running.length, 0);
    assert.strictEqual(s.recent[0].status, 'error');
  });

  it('toEvent reads SubagentStart/Stop payloads and Agent tool payloads', () => {
    const fromSubagent = hook.toEvent({ session_id: 's', agent_id: 'id1', agent_type: 'debugger', cwd: '/x/proj' }, 5);
    assert.strictEqual(fromSubagent.agentId, 'id1');
    assert.strictEqual(fromSubagent.agent, 'debugger');
    assert.strictEqual(fromSubagent.project, 'proj');
    const fromTool = hook.toEvent({ session_id: 's', tool_input: { subagent_type: 'docs-writer', description: 'd' } }, 5);
    assert.strictEqual(fromTool.agent, 'docs-writer');
    assert.strictEqual(fromTool.description, 'd');
  });
});
