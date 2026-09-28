# Security Policy

## Supported versions

The latest published version receives security fixes.

| Version | Supported |
| ------- | --------- |
| 0.0.x   | ✅        |

## Reporting a vulnerability

Please report suspected vulnerabilities privately via
[GitHub Security Advisories](https://github.com/edtroleis/vscode-claude-agents-monitor/security/advisories/new)
rather than opening a public issue. You can expect an acknowledgement within a few days.

## Threat model & design notes

This extension is intentionally small and local-only:

- **No network access, no telemetry.** It only reads local files under your home directory.
- **Read-only in the extension.** The extension reads `~/.claude/agents/*.md` and
  `~/.claude/agent-status.json`. It never writes to them.
- **Untrusted input is tolerated.** The status file is treated as untrusted: JSON is parsed
  defensively and malformed entries are dropped (`normalizeStatus`), so a corrupted or
  hand-edited file cannot crash the view.
- **The hook fails closed and quiet.** `agent-status-hook.js` never throws and always exits 0,
  so it cannot block or break a Claude Code tool call. It writes the status file atomically
  (temp file + rename) to avoid partial reads.
- **Minimal data recorded.** The hook stores only the subagent type, a short description, the
  project folder name, and timestamps — never prompt contents, file contents, or secrets.

## Hardening recommendations

- Keep the hook command pointed at a path you control.
- Review `~/.claude/settings.json` hooks periodically via the Claude Code `/hooks` menu.
