import { App, TFile, TFolder } from "obsidian";

export type StoredMessageRole = "user" | "assistant" | "error" | "system";

export interface StoredMessage {
  role: StoredMessageRole;
  content: string;
  timestamp: string;
}

export interface SessionRecord {
  id: string;
  messages: StoredMessage[];
  title?: string;
  createdAt: string;
  updatedAt: string;
  remoteSessionByProvider?: Record<string, string>;
}

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

const SESSION_ROOT = ".obsidian/claude";
const SESSION_FOLDER = `${SESSION_ROOT}/sessions`;
const CURRENT_POINTER_FILE = `${SESSION_ROOT}/current-session.json`;
const LEGACY_SESSION_FILE = `${SESSION_FOLDER}/current.json`;

export class SessionStore {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  async loadSession(sessionId?: string): Promise<SessionRecord | null> {
    let resolvedId = sessionId || (await this.getCurrentSessionId());
    if (!resolvedId) {
      resolvedId = await this.migrateLegacySession();
    }
    if (!resolvedId) {
      return null;
    }
    return this.loadSessionById(resolvedId);
  }

  async listSessions(): Promise<SessionSummary[]> {
    await this.ensureSessionFolder();
    const sessionFiles = await this.listSessionFiles();
    const summaries: SessionSummary[] = [];
    for (const path of sessionFiles) {
      const name = path.split("/").pop() || "";
      if (!name.startsWith("session-") || !name.endsWith(".json")) continue;

      const raw = await this.readSessionFile(path);
      if (!raw) continue;
      try {
        const session = JSON.parse(raw) as SessionRecord;
        summaries.push({
          id: session.id,
          title: session.title || "Untitled session",
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        });
      } catch {
        continue;
      }
    }

    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createSession(title?: string): Promise<SessionRecord> {
    await this.ensureSessionFolder();
    const now = new Date().toISOString();
    const reusable = await this.findReusableEmptySession();
    if (reusable) {
      if (title?.trim()) {
        reusable.title = title.trim();
        reusable.updatedAt = now;
        await this.writeSession(reusable);
      }
      await this.setCurrentSessionId(reusable.id);
      return reusable;
    }
    const session: SessionRecord = {
      id: this.generateSessionId(),
      messages: [],
      title: title?.trim() || "New session",
      createdAt: now,
      updatedAt: now,
    };

    await this.writeSession(session);
    await this.setCurrentSessionId(session.id);
    return session;
  }

  async forkSession(sourceSessionId?: string): Promise<SessionRecord | null> {
    const source = await this.loadSession(sourceSessionId);
    if (!source) {
      return null;
    }
    const now = new Date().toISOString();
    const session: SessionRecord = {
      id: this.generateSessionId(),
      messages: [...source.messages],
      title: `Fork of ${source.title || "session"}`,
      createdAt: now,
      updatedAt: now,
    };

    await this.writeSession(session);
    await this.setCurrentSessionId(session.id);
    return session;
  }

  async appendMessage(message: StoredMessage, sessionId?: string): Promise<void> {
    await this.ensureSessionFolder();
    const activeId = sessionId || (await this.getCurrentSessionId());
    const session = (activeId && (await this.loadSessionById(activeId))) || (await this.createSession());

    session.messages.push(message);
    session.updatedAt = new Date().toISOString();
    if (!session.title && message.role === "user") {
      session.title = this.deriveTitle(message.content);
    }
    if (session.title === "New session" && message.role === "user") {
      session.title = this.deriveTitle(message.content);
    }

    await this.writeSession(session);
    await this.setCurrentSessionId(session.id);
  }

  async setRemoteSessionId(
    sessionId: string,
    provider: string,
    remoteSessionId: string,
  ): Promise<void> {
    await this.ensureSessionFolder();
    const session = await this.loadSessionById(sessionId);
    if (!session) {
      return;
    }
    const nextMap = {
      ...(session.remoteSessionByProvider || {}),
      [provider]: remoteSessionId,
    };
    session.remoteSessionByProvider = nextMap;
    session.updatedAt = new Date().toISOString();
    await this.writeSession(session);
  }

  async getRemoteSessionId(
    sessionId: string,
    provider: string,
  ): Promise<string | null> {
    const session = await this.loadSessionById(sessionId);
    if (!session) {
      return null;
    }
    return session.remoteSessionByProvider?.[provider] || null;
  }

  async clearSession(sessionId?: string): Promise<void> {
    const activeId = sessionId || (await this.getCurrentSessionId());
    if (!activeId) {
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(this.sessionFilePath(activeId));
    if (file instanceof TFile) {
      await this.app.vault.delete(file, false);
    }
  }

  async setCurrentSessionId(sessionId: string): Promise<void> {
    await this.ensureSessionFolder();
    const content = JSON.stringify({ sessionId }, null, 2);
    const file = this.app.vault.getAbstractFileByPath(CURRENT_POINTER_FILE);
    if (file instanceof TFile) {
      await this.app.vault.modify(file, content);
    } else {
      await this.safeCreateFile(CURRENT_POINTER_FILE, content);
    }
  }

  async getCurrentSessionId(): Promise<string | null> {
    const file = this.app.vault.getAbstractFileByPath(CURRENT_POINTER_FILE);
    if (!(file instanceof TFile)) {
      return null;
    }
    const raw = await this.app.vault.read(file);
    try {
      const parsed = JSON.parse(raw) as { sessionId?: string };
      return parsed.sessionId || null;
    } catch {
      return null;
    }
  }

  private async loadSessionById(sessionId: string): Promise<SessionRecord | null> {
    const path = this.sessionFilePath(sessionId);
    const raw = await this.readSessionFile(path);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionRecord;
    } catch {
      return null;
    }
  }

  private async writeSession(session: SessionRecord): Promise<void> {
    const path = this.sessionFilePath(session.id);
    const file = this.app.vault.getAbstractFileByPath(path);
    const content = JSON.stringify(session, null, 2);

    if (file instanceof TFile) {
      await this.app.vault.modify(file, content);
    } else {
      const adapter = this.app.vault.adapter as { write?: (path: string, data: string) => Promise<void> };
      if (adapter?.write) {
        await adapter.write(path, content);
      } else {
        await this.safeCreateFile(path, content);
      }
    }
  }

  private async ensureSessionFolder(): Promise<void> {
    const rootFolder = this.app.vault.getAbstractFileByPath(SESSION_ROOT);
    if (!(rootFolder instanceof TFolder)) {
      await this.safeCreateFolder(SESSION_ROOT);
    }

    const sessionFolder = this.app.vault.getAbstractFileByPath(SESSION_FOLDER);
    if (!(sessionFolder instanceof TFolder)) {
      await this.safeCreateFolder(SESSION_FOLDER);
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private sessionFilePath(sessionId: string): string {
    return `${SESSION_FOLDER}/session-${sessionId}.json`;
  }

  private deriveTitle(text: string): string {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!cleaned) {
      return "New session";
    }
    return cleaned.length > 60 ? `${cleaned.slice(0, 57)}...` : cleaned;
  }

  private async safeCreateFolder(path: string): Promise<void> {
    try {
      await this.app.vault.createFolder(path);
    } catch (error) {
      const message = this.getErrorMessage(error);
      if (message.includes("already exists") || message.includes("eexist")) {
        return;
      }
      throw error;
    }
  }

  private async listSessionFiles(): Promise<string[]> {
    const folder = this.app.vault.getAbstractFileByPath(SESSION_FOLDER);
    if (folder instanceof TFolder) {
      return folder.children
        .filter((child): child is TFile => child instanceof TFile)
        .map((child) => child.path);
    }

    const adapter = this.app.vault.adapter as { list?: (path: string) => Promise<{ files: string[] }> };
    if (adapter?.list) {
      try {
        const listing = await adapter.list(SESSION_FOLDER);
        return listing?.files || [];
      } catch {
        return [];
      }
    }

    return [];
  }

  private async readSessionFile(path: string): Promise<string | null> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      return await this.app.vault.read(file);
    }

    const adapter = this.app.vault.adapter as { read?: (path: string) => Promise<string> };
    if (adapter?.read) {
      try {
        return await adapter.read(path);
      } catch {
        return null;
      }
    }

    return null;
  }

  private async safeCreateFile(path: string, content: string): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
      return;
    }
    try {
      await this.app.vault.create(path, content);
    } catch (error) {
      const message = this.getErrorMessage(error);
      if (message.includes("already exists") || message.includes("eexist")) {
        const existingRetry = this.app.vault.getAbstractFileByPath(path);
        if (existingRetry instanceof TFile) {
          await this.app.vault.modify(existingRetry, content);
          return;
        }
        const adapter = this.app.vault.adapter as { write?: (path: string, data: string) => Promise<void> };
        if (adapter?.write) {
          await adapter.write(path, content);
          return;
        }
      }
      throw error;
    }
  }

  private getErrorMessage(error: unknown): string {
    const raw = (error as { message?: string; code?: string }) || {};
    const message = raw.message ?? String(error);
    const code = raw.code ? ` ${raw.code}` : "";
    return `${message}${code}`.toLowerCase();
  }

  private async findReusableEmptySession(): Promise<SessionRecord | null> {
    const sessions = await this.listSessions();
    if (sessions.length === 0) {
      return null;
    }
    const latest = await this.loadSessionById(sessions[0].id);
    if (!latest) {
      return null;
    }
    return latest.messages.length === 0 ? latest : null;
  }

  private async migrateLegacySession(): Promise<string | null> {
    const legacyFile = this.app.vault.getAbstractFileByPath(LEGACY_SESSION_FILE);
    if (!(legacyFile instanceof TFile)) {
      return null;
    }
    const raw = await this.app.vault.read(legacyFile);
    try {
      const legacy = JSON.parse(raw) as { messages?: StoredMessage[]; updatedAt?: string };
      const now = new Date().toISOString();
      const session: SessionRecord = {
        id: this.generateSessionId(),
        messages: legacy.messages || [],
        title: "Migrated session",
        createdAt: now,
        updatedAt: legacy.updatedAt || now,
      };
      await this.writeSession(session);
      await this.setCurrentSessionId(session.id);
      await this.app.vault.delete(legacyFile, false);
      return session.id;
    } catch {
      return null;
    }
  }
}
