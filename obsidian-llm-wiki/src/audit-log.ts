import { App, TFile } from "obsidian";

const AUDIT_ROOT = ".obsidian/claude/audit";

export interface AuditEntry {
  timestamp: string;
  sessionId?: string | null;
  action: "file_write" | "terminal_execute";
  path?: string;
  command?: string;
  status: "applied" | "rejected" | "failed";
  diff?: string;
  reason?: string;
  hashBefore?: string;
  hashAfter?: string;
  output?: string;
}

export async function appendAuditEntry(app: App, entry: AuditEntry): Promise<void> {
  await ensureAuditFolder(app);
  const date = entry.timestamp.slice(0, 10);
  const filePath = `${AUDIT_ROOT}/${date}.log`;
  const line = JSON.stringify(entry);

  const file = app.vault.getAbstractFileByPath(filePath);
  if (file instanceof TFile) {
    const existing = await app.vault.read(file);
    await app.vault.modify(file, `${existing}${line}\n`);
    return;
  }

  const adapter = app.vault.adapter as { write?: (path: string, data: string) => Promise<void> };
  if (adapter?.write) {
    await adapter.write(filePath, `${line}\n`);
  } else {
    await app.vault.create(filePath, `${line}\n`);
  }
}

async function ensureAuditFolder(app: App): Promise<void> {
  const existing = app.vault.getAbstractFileByPath(AUDIT_ROOT);
  if (existing) {
    return;
  }

  const parent = app.vault.getAbstractFileByPath(".obsidian/claude");
  if (!parent) {
    await app.vault.createFolder(".obsidian/claude");
  }
  await app.vault.createFolder(AUDIT_ROOT);
}
