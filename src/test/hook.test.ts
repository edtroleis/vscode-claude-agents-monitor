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
