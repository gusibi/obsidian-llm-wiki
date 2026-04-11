import { App, TFile } from "obsidian";
import { TodoTarget } from "./settings";

const INBOX_PATH = "Agent Inbox.md";

export interface TodoAppendOptions {
  target?: TodoTarget;
  currentFilePath?: string | null;
  sourceNote?: string;
  sessionId?: string | null;
}

export class TodoSync {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  async appendTodos(todos: string[], options: TodoAppendOptions = {}): Promise<void> {
    if (todos.length === 0) return;

    const target = options.target || "inbox";
    const file = await this.resolveTargetFile(target, options.currentFilePath || undefined);
    const existing = await this.app.vault.read(file);

    const timestamp = new Date().toLocaleString();
    const header = `\n\n## Claude TODOs (${timestamp})`;
    const sourceLine = options.sourceNote ? `\nSource: ${options.sourceNote}` : "";
    const sessionLink = options.sessionId
      ? `\nResume: [Continue](obsidian://claude-acp?session=${encodeURIComponent(options.sessionId)})`
      : "";
    const todoLines = todos.map((todo) => `- [ ] ${todo}`).join("\n");

    const nextContent = `${existing}${header}${sourceLine}${sessionLink}\n${todoLines}`;
    await this.app.vault.modify(file, nextContent);
  }

  extractTodos(text: string): string[] {
    const todos: string[] = [];

    const checkboxMatches = text.match(/^- \[ \] (.+)$/gm) || [];
    for (const line of checkboxMatches) {
      const item = line.replace(/^- \[ \] /, "").trim();
      if (item) todos.push(item);
    }

    const todoLines = text.match(/^TODO:?\s*(.+)$/gim) || [];
    for (const line of todoLines) {
      const item = line.replace(/^TODO:?\s*/i, "").trim();
      if (item) todos.push(item);
    }

    return Array.from(new Set(todos));
  }

  private async ensureInboxFile(): Promise<TFile> {
    const existing = this.app.vault.getAbstractFileByPath(INBOX_PATH);
    if (existing instanceof TFile) {
      return existing;
    }

    return await this.app.vault.create(INBOX_PATH, "# Agent Inbox\n");
  }

  private async resolveTargetFile(target: TodoTarget, currentFilePath?: string): Promise<TFile> {
    if (target === "current" && currentFilePath) {
      const current = this.app.vault.getAbstractFileByPath(currentFilePath);
      if (current instanceof TFile) {
        return current;
      }
    }

    return await this.ensureInboxFile();
  }
}
