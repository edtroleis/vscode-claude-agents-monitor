# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
