import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { humanElapsed, normalizeStatus, parseAgentFrontmatter, StatusFile } from './lib';

interface AgentDef {
  name: string;
  description: string;
  file: string;
}

// ---------- Configurable paths ----------

function expandHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

function agentsDir(): string {
  const cfg = vscode.workspace.getConfiguration('claudeAgentsMonitor').get<string>('agentsDir');
  return cfg && cfg.trim() ? expandHome(cfg) : path.join(os.homedir(), '.claude', 'agents');
}

function statusFilePath(): string {
  const cfg = vscode.workspace.getConfiguration('claudeAgentsMonitor').get<string>('statusFile');
  return cfg && cfg.trim() ? expandHome(cfg) : path.join(os.homedir(), '.claude', 'agent-status.json');
}

// ---------- Data reading ----------

function readAgents(): AgentDef[] {
  const dir = agentsDir();
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
  const agents: AgentDef[] = [];
  for (const f of files) {
    const full = path.join(dir, f);
    let fm = { name: f.replace(/\.md$/, ''), description: '' };
    try {
      const parsed = parseAgentFrontmatter(fs.readFileSync(full, 'utf8'));
      fm = { name: parsed.name ?? fm.name, description: parsed.description ?? '' };
    } catch {
      /* ignore unreadable file */
    }
    agents.push({ name: fm.name, description: fm.description, file: full });
  }
  agents.sort((a, b) => a.name.localeCompare(b.name));
  return agents;
}

function readStatus(): StatusFile {
  try {
    return normalizeStatus(JSON.parse(fs.readFileSync(statusFilePath(), 'utf8')));
  } catch {
    return { running: [], recent: [] };
  }
}

// ---------- Tree items ----------

class TreeNode extends vscode.TreeItem {
  constructor(
    label: string,
    collapsible: vscode.TreeItemCollapsibleState,
    public children?: TreeNode[],
  ) {
    super(label, collapsible);
  }
}

function emptyNode(label: string): TreeNode {
  const n = new TreeNode(label, vscode.TreeItemCollapsibleState.None);
  n.iconPath = new vscode.ThemeIcon('dash');
  return n;
}

class AgentsProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChange = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  refresh(): void {
    this._onDidChange.fire();
  }

  getTreeItem(el: TreeNode): vscode.TreeItem {
    return el;
  }

  getChildren(el?: TreeNode): TreeNode[] {
    return el ? el.children ?? [] : this.buildRoot();
  }

  private buildRoot(): TreeNode[] {
    const status = readStatus();
    const agents = readAgents();

    const runningNodes = status.running.map((r) => {
      const node = new TreeNode(r.agent, vscode.TreeItemCollapsibleState.None);
      node.iconPath = new vscode.ThemeIcon('loading~spin');
      node.description = [humanElapsed(r.startedAt), r.project].filter(Boolean).join(' · ');
      node.tooltip = r.description ?? '';
      return node;
    });
    const runningGroup = new TreeNode(
      `Running now (${status.running.length})`,
      vscode.TreeItemCollapsibleState.Expanded,
      runningNodes.length ? runningNodes : [emptyNode('no agents running')],
    );
    runningGroup.iconPath = new vscode.ThemeIcon('pulse');

    const recentNodes = status.recent
      .slice(-10)
      .reverse()
      .map((r) => {
        const node = new TreeNode(r.agent, vscode.TreeItemCollapsibleState.None);
        node.iconPath = new vscode.ThemeIcon(r.status === 'error' ? 'error' : 'check');
        node.description = [humanElapsed(r.startedAt, r.endedAt), r.project].filter(Boolean).join(' · ');
        node.tooltip = r.description ?? '';
        return node;
      });
    const recentGroup = new TreeNode(
      `Recent (${recentNodes.length})`,
      vscode.TreeItemCollapsibleState.Collapsed,
      recentNodes.length ? recentNodes : [emptyNode('no recent runs')],
    );
    recentGroup.iconPath = new vscode.ThemeIcon('history');

    const agentNodes = agents.map((a) => {
      const node = new TreeNode(a.name, vscode.TreeItemCollapsibleState.None);
      node.iconPath = new vscode.ThemeIcon('hubot');
      node.description = a.description;
      node.tooltip = a.description;
      node.command = { command: 'claudeAgentsMonitor.openAgentFile', title: 'Open', arguments: [a.file] };
      return node;
    });
    const agentsGroup = new TreeNode(
      `Available agents (${agentNodes.length})`,
      vscode.TreeItemCollapsibleState.Collapsed,
      agentNodes.length ? agentNodes : [emptyNode('no agents in ~/.claude/agents')],
    );
    agentsGroup.iconPath = new vscode.ThemeIcon('list-tree');

    return [runningGroup, recentGroup, agentsGroup];
  }
}

// ---------- Activation ----------

export function activate(context: vscode.ExtensionContext): void {
  const provider = new AgentsProvider();
  context.subscriptions.push(vscode.window.registerTreeDataProvider('claudeAgentsMonitor', provider));

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'workbench.view.extension.claudeAgents';
  context.subscriptions.push(statusBar);

  const updateStatusBar = (): void => {
    const n = readStatus().running.length;
    statusBar.text = n > 0 ? `$(loading~spin) ${n} agent${n > 1 ? 's' : ''}` : '$(hubot) agents';
    statusBar.tooltip = 'Claude agents running now';
    statusBar.show();
  };

  const refreshAll = (): void => {
    provider.refresh();
    updateStatusBar();
  };
  refreshAll();

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeAgentsMonitor.refresh', refreshAll),
    vscode.commands.registerCommand('claudeAgentsMonitor.openAgentFile', (file?: string) => {
      if (file) {
        void vscode.window.showTextDocument(vscode.Uri.file(file));
      }
    }),
  );

  // Watch the status file and agents dir (parent dir catches atomic create/replace).
  let timer: NodeJS.Timeout | undefined;
  const debounced = (): void => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(refreshAll, 200);
  };
  for (const target of [statusFilePath(), agentsDir()]) {
    try {
      const dir = fs.statSync(target).isDirectory() ? target : path.dirname(target);
      const watcher = fs.watch(dir, { persistent: false }, debounced);
      context.subscriptions.push({ dispose: () => watcher.close() });
    } catch {
      /* target not present yet; picked up on manual refresh */
    }
  }

  // Light poll so the elapsed timers of running agents keep ticking.
  const poll = setInterval(refreshAll, 2000);
  context.subscriptions.push({ dispose: () => clearInterval(poll) });
}

export function deactivate(): void {
  /* nothing beyond disposables */
}
