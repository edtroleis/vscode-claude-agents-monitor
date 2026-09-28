# Contributing

Thanks for your interest in improving Claude Agents Monitor.

## Development setup

```bash
git clone https://github.com/edtroleis/vscode-claude-agents-monitor.git
cd vscode-claude-agents-monitor
npm install
```

Common tasks:

| Command | Purpose |
| --- | --- |
| `npm run compile` | Type-check and build to `out/`. |
| `npm run watch` | Rebuild on change. |
| `npm run lint` | Run ESLint over `src/`. |
| `npm test` | Compile, lint, then run the Mocha unit tests. |
| `npm run package` | Build the `.vsix` with `vsce`. |

Press **F5** in VS Code to launch the Extension Development Host.

## Project layout

- `src/lib.ts` — pure, dependency-free logic (parsing, status normalization, formatting). Unit tested.
- `src/extension.ts` — VS Code integration (tree view, status bar, file watching).
- `hooks/agent-status-hook.js` — standalone Claude Code hook; pure transitions are exported and unit tested.
- `src/test/**` — Mocha unit tests.

## Guidelines

- Keep `lib.ts` free of the `vscode` module so it stays testable under plain Node.
- Add or update tests for behavior changes; `npm test` must pass.
- Run `npm run lint` before opening a PR.
- Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.
- Update `CHANGELOG.md` under an "Unreleased" section for user-facing changes.

## Releasing

1. Bump `version` in `package.json` (SemVer) and update `CHANGELOG.md`.
2. Tag `vX.Y.Z` and push — CI builds and validates the package.
3. Publish with `vsce publish` (or via the release workflow).
