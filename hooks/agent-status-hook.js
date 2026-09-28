#!/usr/bin/env node
/*
 * Claude Code hook that records when a subagent (the "Task" tool) starts and finishes,
 * writing ~/.claude/agent-status.json — consumed by the Claude Agents Monitor extension.
 *
 * Wire up in ~/.claude/settings.json:
 *   PreToolUse  matcher "Task"  -> node <this file> pre
 *   PostToolUse matcher "Task"  -> node <this file> post
 *
 * Golden rule: never throw / exit != 0. A hook that fails must not stall Claude Code.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const STATUS_FILE = path.join(os.homedir(), '.claude', 'agent-status.json');
const MAX_RECENT = 20;

// ---------- Pure transitions (exported for unit tests) ----------

/** Adds a running entry. Returns a new status object; never mutates the input. */
function applyPre(status, event) {
  const running = status.running.slice();
  running.push({
    id: `${event.session}:${event.agent}:${event.now}`,
    agent: event.agent,
    description: event.description || '',
    project: event.project || '',
    startedAt: new Date(event.now).toISOString(),
  });
  return { running, recent: status.recent.slice() };
}

/** Moves the oldest matching running entry into `recent`. Returns a new status object. */
function applyPost(status, event) {
  const running = status.running.slice();
  const idx = running.findIndex((r) => r.agent === event.agent && r.id.startsWith(event.session + ':'));
  const entry =
    idx >= 0
      ? running.splice(idx, 1)[0]
      : {
          id: `${event.session}:${event.agent}:${event.now}`,
          agent: event.agent,
          description: event.description || '',
          project: event.project || '',
          startedAt: new Date(event.now).toISOString(),
        };
  const recent = status.recent.slice();
  recent.push({
    ...entry,
    endedAt: new Date(event.now).toISOString(),
    status: event.isError ? 'error' : 'completed',
  });
  return { running, recent: recent.slice(-MAX_RECENT) };
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
    };
  } catch {
    return { running: [], recent: [] };
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
  const phase = process.argv[2] === 'post' ? 'post' : 'pre';
  let input = {};
  try {
    input = JSON.parse(readStdin() || '{}');
  } catch {
    input = {};
  }

  const toolInput = input.tool_input || {};
  const response = input.tool_response || {};
  const event = {
    session: input.session_id || 'unknown',
    agent: toolInput.subagent_type || 'unknown',
    description: toolInput.description || '',
    project: path.basename(input.cwd || process.cwd() || '') || '',
    now: Date.now(),
    isError: response.is_error === true || response.error != null,
  };

  const status = loadStatus();
  const next = phase === 'pre' ? applyPre(status, event) : applyPost(status, event);
  saveStatus(next);
}

module.exports = { applyPre, applyPost, STATUS_FILE, MAX_RECENT };

if (require.main === module) {
  try {
    main();
  } catch {
    /* never propagate */
  }
  process.exit(0);
}
