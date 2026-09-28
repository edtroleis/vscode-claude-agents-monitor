# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.3] - 2026-09-28

### Fixed

- Background subagents showed as completed ~1s after launch and never appeared in
  **Running now**: `PostToolUse` fires when the launch returns, not when the subagent finishes.
  The hook now uses `SubagentStart` / `SubagentStop` (new `launch`, `start`, `stop` phases),
  pairing runs by `agent_id` so parallel agents of the same type are tracked correctly.

### Added

- Pending launches expire after 10 minutes and runs with no stop event are closed as errors
  after 6 hours, so stale entries never stay in **Running now**.

### Changed

- Documented hook wiring now matches the `Agent` tool (`Task` kept as an alias). The legacy
  `pre`/`post` phases remain supported.

## [0.0.2] - 2026-09-28

### Added

- Screenshot of the sidebar view in the README / Marketplace listing.

## [0.0.1] - 2026-09-28

### Added

- Dedicated **Claude Agents** view in the activity bar with three groups:
  - **Running now** — subagents currently executing, with an elapsed timer.
  - **Recent** — the last completed/failed runs.
  - **Available agents** — every subagent defined in `~/.claude/agents`, click to open.
- Status bar item showing the count of running agents.
- Live updates via file watching (status file + agents dir) plus a light poll for timers.
- Companion Claude Code hook (`hooks/agent-status-hook.js`) that records subagent
  start/stop into `~/.claude/agent-status.json`.
- Settings: `claudeAgentsMonitor.agentsDir` and `claudeAgentsMonitor.statusFile`.

[0.0.2]: https://github.com/edtroleis/vscode-claude-agents-monitor/releases/tag/v0.0.2
[0.0.1]: https://github.com/edtroleis/vscode-claude-agents-monitor/releases/tag/v0.0.1
