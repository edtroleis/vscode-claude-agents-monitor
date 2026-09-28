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

## Releases

Releases are automatic. On every push to `main`, the **Release** workflow runs
CI and then, if the version in `package.json` is not on the Marketplace yet,
publishes it, tags it `v<version>`, and creates a GitHub release with the
`.vsix` and that version's `CHANGELOG.md` section. A version that is already
published is skipped.

To cut a release, in a pull request bump `version` in `package.json`
(`npm version patch|minor|major --no-git-tag-version`) and add a `CHANGELOG.md`
entry. CI blocks the PR if the version is already published. Merging to `main`
does the rest.

### Setup (once)

The **Release** workflow publishes from the `marketplace` environment. Give it
credentials in one of two ways.

#### Option A: Microsoft Entra ID (recommended)

GitHub Actions signs in to Azure with OIDC and gets a short-lived token; no
secret is stored.

This project shares the `edtroleis` publisher with other extensions, so the
existing managed identity (`vscode-wsl-distro-manager-publisher` in resource
group `vscode-publish`) is already a Contributor member of the publisher. You
only need to let **this** repository's environment sign in as it and copy the
IDs:

1. Add a federated credential for this repo's `marketplace` environment. This
   repo uses GitHub's **immutable** OIDC subject (owner and repo numeric IDs),
   so the subject must match exactly:

   ```bash
   az identity federated-credential create \
     --name github-marketplace-claude-agents \
     --identity-name vscode-wsl-distro-manager-publisher \
     --resource-group vscode-publish \
     --issuer https://token.actions.githubusercontent.com \
     --subject 'repo:edtroleis@31828901/vscode-claude-agents-monitor@1393738788:environment:marketplace' \
     --audiences api://AzureADTokenExchange
   ```

   Confirm the exact subject any time with
   `gh api repos/edtroleis/vscode-claude-agents-monitor/actions/oidc/customization/sub`
   (append `:environment:marketplace` to its `sub_claim_prefix`).

2. Store the identity's IDs as variables of the environment (not secrets):

   ```bash
   gh variable set AZURE_CLIENT_ID --env marketplace --repo edtroleis/vscode-claude-agents-monitor --body <clientId>
   gh variable set AZURE_TENANT_ID --env marketplace --repo edtroleis/vscode-claude-agents-monitor --body <tenantId>
   ```

If you are bootstrapping a brand-new publisher instead, create the managed
identity, add the federated credential above, then run the workflow once to read
the *Marketplace member ID* notice and add that ID as a **Contributor** at
<https://marketplace.visualstudio.com/manage/publishers/edtroleis> (Members).

#### Option B: Azure DevOps token

Create a Personal Access Token for your Azure DevOps **organization** with the
scope **Marketplace > Manage**, then store it as an environment secret
(global tokens stop working on 2026-12-01):

```bash
gh secret set VSCE_PAT --env marketplace --repo edtroleis/vscode-claude-agents-monitor
```

With both options set, the workflow uses Entra ID.
