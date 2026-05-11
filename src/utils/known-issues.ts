import fs from 'fs';
import path from 'path';
import type { ToolCallRecord } from './stream-parser.js';

const DATA_DIR = path.resolve('data', 'known-issues');

export interface KnownIssue {
  errorMessage: string;
  toolName: string;
  occurrences: number;
  lastSeen: string;
}

interface IssueFile {
  issues: KnownIssue[];
}

function filePath(promptName: string): string {
  return path.join(DATA_DIR, `${promptName}.json`);
}

export function loadKnownIssues(promptName: string): KnownIssue[] {
  const fp = filePath(promptName);
  if (!fs.existsSync(fp)) return [];
  try {
    const raw = fs.readFileSync(fp, 'utf-8');
    return (JSON.parse(raw) as IssueFile).issues ?? [];
  } catch {
    return [];
  }
}

export function persistKnownIssues(promptName: string, toolCalls: ToolCallRecord[]): void {
  const failedCalls = toolCalls.filter(tc => tc.isError && tc.output);
  if (failedCalls.length === 0) return;

  const existing = loadKnownIssues(promptName);
  const now = new Date().toISOString();

  for (const tc of failedCalls) {
    // Truncate to avoid bloating the file; keep first 500 chars of error
    const msg = tc.output.slice(0, 500).trim();
    if (!msg) continue;

    const match = existing.find(
      e => e.toolName === tc.name && e.errorMessage === msg,
    );
    if (match) {
      match.occurrences++;
      match.lastSeen = now;
    } else {
      existing.push({ errorMessage: msg, toolName: tc.name, occurrences: 1, lastSeen: now });
    }
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(filePath(promptName), JSON.stringify({ issues: existing }, null, 2), 'utf-8');
}

export function listKnownIssuePrompts(): string[] {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace(/\.json$/, ''));
}

export function formatIssuesAsMarkdown(issues: KnownIssue[]): string {
  if (issues.length === 0) return 'No known issues recorded yet.';
  return issues
    .sort((a, b) => b.occurrences - a.occurrences)
    .map(i => `- **[${i.toolName}]** (seen ${i.occurrences}x, last: ${i.lastSeen.slice(0, 10)})\n  \`${i.errorMessage.replace(/\n/g, ' ')}\``)
    .join('\n');
}
