// Pure, dependency-free logic shared by the extension and covered by unit tests.
// Keeping this free of the `vscode` module makes it runnable under plain Node in CI.

export interface RunningEntry {
  id: string;
  agent: string;
  description?: string;
  project?: string;
  startedAt: string;
}

export interface RecentEntry extends RunningEntry {
  endedAt: string;
  status: 'completed' | 'error';
}

export interface StatusFile {
  running: RunningEntry[];
  recent: RecentEntry[];
}

export interface AgentFrontmatter {
  name?: string;
  description?: string;
}

/**
 * Extracts `name` and `description` from a Claude subagent markdown file's YAML frontmatter.
 * Tolerant by design: returns an empty object when there is no frontmatter.
 */
export function parseAgentFrontmatter(text: string): AgentFrontmatter {
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) {
    return {};
  }
  const block = fm[1];
  const out: AgentFrontmatter = {};
  const nameM = block.match(/^name:\s*(.+)$/m);
  const descM = block.match(/^description:\s*(.+)$/m);
  if (nameM) {
    out.name = nameM[1].trim().replace(/^["']|["']$/g, '');
  }
  if (descM) {
    out.description = descM[1].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

/**
 * Coerces arbitrary parsed JSON into a well-formed StatusFile, dropping malformed entries.
 * Never throws — used on untrusted on-disk content.
 */
export function normalizeStatus(parsed: unknown): StatusFile {
  const obj = (parsed ?? {}) as Record<string, unknown>;
  const running = Array.isArray(obj.running) ? (obj.running as RunningEntry[]).filter(isRunning) : [];
  const recent = Array.isArray(obj.recent) ? (obj.recent as RecentEntry[]).filter(isRecent) : [];
  return { running, recent };
}

function isRunning(e: unknown): e is RunningEntry {
  const r = e as RunningEntry;
  return !!r && typeof r.id === 'string' && typeof r.agent === 'string' && typeof r.startedAt === 'string';
}

function isRecent(e: unknown): e is RecentEntry {
  const r = e as RecentEntry;
  return isRunning(e) && typeof r.endedAt === 'string';
}

/** Formats an elapsed interval as a compact human string (e.g. "5s", "2m10s"). */
export function humanElapsed(fromIso: string, toIso?: string): string {
  const from = Date.parse(fromIso);
  const to = toIso ? Date.parse(toIso) : Date.now();
  if (Number.isNaN(from) || Number.isNaN(to)) {
    return '';
  }
  const secs = Math.max(0, Math.round((to - from) / 1000));
  if (secs < 60) {
    return `${secs}s`;
  }
  const mins = Math.floor(secs / 60);
  return `${mins}m${secs % 60}s`;
}
