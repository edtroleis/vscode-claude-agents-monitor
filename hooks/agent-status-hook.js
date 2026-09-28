#!/usr/bin/env node
/*
 * Claude Code hook that records subagent executions in ~/.claude/agent-status.json,
 * consumed by the Claude Agents Monitor extension.
 *
 * Recommended wiring (~/.claude/settings.json), accurate for background subagents too:
 *   PreToolUse    matcher "Agent|Task"  -> node <this file> launch   (remembers the description)
 *   SubagentStart                       -> node <this file> start    (moves to "running")
 *   SubagentStop                        -> node <this file> stop     (moves to "recent")
 *
 * Legacy wiring (still supported, wrong for background subagents because PostToolUse
 * fires as soon as the launch returns):
 *   PreToolUse  matcher "Task" -> node <this file> pre
 *   PostToolUse matcher "Task" -> node <this file> post
 *
 * Golden rule: never throw / exit != 0. A hook that fails must not stall Claude Code.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const STATUS_FILE = path.join(os.homedir(), '.claude', 'agent-status.json');
const MAX_RECENT = 20;
// A launch never followed by SubagentStart (denied, cancelled) is dropped after this.
const PENDING_TTL_MS = 10 * 60 * 1000;
// A running entry never followed by SubagentStop (crash, killed session) is dropped after this.
const RUNNING_TTL_MS = 6 * 60 * 60 * 1000;

// ---------- Pure transitions (exported for unit tests) ----------

function clone(status) {
  return {
    running: status.running.slice(),
    recent: status.recent.slice(),
    pending: (status.pending || []).slice(),
  };
}

function newEntry(event) {
  return {
    id: event.agentId ? `${event.session}:${event.agentId}` : `${event.session}:${event.agent}:${event.now}`,
    agent: event.agent,
    description: event.description || '',
    project: event.project || '',
    startedAt: new Date(event.now).toISOString(),
  };
}

function finish(entry, event) {
  return {
    ...entry,
    endedAt: new Date(event.now).toISOString(),
    status: event.isError ? 'error' : 'completed',
  };
}

/** Drops pending launches and running entries that outlived their TTL. */
function prune(status, now) {
  const next = clone(status);
  next.pending = next.pending.filter((p) => now - p.at < PENDING_TTL_MS);
  const stale = next.running.filter((r) => now - Date.parse(r.startedAt) >= RUNNING_TTL_MS);
  next.running = next.running.filter((r) => now - Date.parse(r.startedAt) < RUNNING_TTL_MS);
  for (const r of stale) {
    next.recent.push({ ...r, endedAt: new Date(now).toISOString(), status: 'error' });
  }
  next.recent = next.recent.slice(-MAX_RECENT);
  return next;
}

/** PreToolUse on the Agent tool: remember the launch so SubagentStart can pick its description. */
function applyLaunch(status, event) {
  const next = clone(status);
  next.pending.push({
    session: event.session,
    agent: event.agent,
    description: event.description || '',
    at: event.now,
  });
  return next;
}

/** SubagentStart: the subagent is really running now. */
function applyStart(status, event) {
  const next = clone(status);
  const idx = next.pending.findIndex((p) => p.session === event.session && p.agent === event.agent);
  const launch = idx >= 0 ? next.pending.splice(idx, 1)[0] : null;
  next.running.push(newEntry({ ...event, description: event.description || (launch && launch.description) }));
  return next;
}

/** SubagentStop: the subagent finished. Pairs by agent id, falling back to the oldest same-type entry. */
function applyStop(status, event) {
  const next = clone(status);
  let idx = event.agentId ? next.running.findIndex((r) => r.id === `${event.session}:${event.agentId}`) : -1;
  if (idx < 0) {
    idx = next.running.findIndex((r) => r.agent === event.agent && r.id.startsWith(event.session + ':'));
  }
  const entry = idx >= 0 ? next.running.splice(idx, 1)[0] : newEntry(event);
  next.recent.push(finish(entry, event));
  next.recent = next.recent.slice(-MAX_RECENT);
  return next;
}

/** Legacy PreToolUse: marks running immediately. */
function applyPre(status, event) {
  const next = clone(status);
  next.running.push(newEntry({ ...event, agentId: undefined }));
  return next;
}

/** Legacy PostToolUse: moves the oldest matching running entry into `recent`. */
function applyPost(status, event) {
  return applyStop(status, { ...event, agentId: undefined });
}

const TRANSITIONS = {
  launch: applyLaunch,
  start: applyStart,
  stop: applyStop,
  pre: applyPre,
  post: applyPost,
};

/** Maps the hook's stdin JSON to an event. Tolerant to both tool and Subagent* payloads. */
function toEvent(input, now) {
  const toolInput = input.tool_input || {};
  const response = input.tool_response || {};
  return {
    session: input.session_id || 'unknown',
    agentId: input.agent_id || undefined,
    agent: input.agent_type || toolInput.subagent_type || 'general-purpose',
    description: toolInput.description || input.description || '',
    project: path.basename(input.cwd || process.cwd() || '') || '',
    now,
    isError: response.is_error === true || response.error != null || input.is_error === true,
  };
}

// ---------- I/O (side effects) ----------

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function loadStatus() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
    return {
      running: Array.isArray(parsed.running) ? parsed.running : [],
      recent: Array.isArray(parsed.recent) ? parsed.recent : [],
      pending: Array.isArray(parsed.pending) ? parsed.pending : [],
    };
  } catch {
    return { running: [], recent: [], pending: [] };
  }
}

function saveStatus(status) {
  try {
    fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
    const tmp = `${STATUS_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(status, null, 2));
    fs.renameSync(tmp, STATUS_FILE); // atomic swap
  } catch {
    /* intentionally silent */
  }
}

function main() {
  const phase = TRANSITIONS[process.argv[2]] ? process.argv[2] : 'pre';
  let input = {};
  try {
    input = JSON.parse(readStdin() || '{}');
  } catch {
    input = {};
  }
  const now = Date.now();
  const event = toEvent(input, now);
  const next = TRANSITIONS[phase](prune(loadStatus(), now), event);
  saveStatus(next);
}

module.exports = {
  applyLaunch,
  applyStart,
  applyStop,
  applyPre,
  applyPost,
  prune,
  toEvent,
  STATUS_FILE,
  MAX_RECENT,
  PENDING_TTL_MS,
  RUNNING_TTL_MS,
};

if (require.main === module) {
  try {
    main();
  } catch {
    /* never propagate */
  }
  process.exit(0);
}
