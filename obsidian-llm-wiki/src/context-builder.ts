import { App, TFile } from "obsidian";

export type ContextType = "note" | "tag" | "search" | "folder";

export interface ContextItem {
  type: ContextType;
  label: string;
  detail?: string;
  content: string;
  sourcePaths: string[];
  tokenEstimate: number;
  enabled?: boolean;
  isSummary?: boolean;
}

interface ContextBuildResult {
  contextText: string;
  items: ContextItem[];
  tokenEstimate: number;
}

const DEFAULT_MAX_TOKENS = 1200;
const MAX_CONTEXT_ITEMS = 6;
const MAX_CONTENT_CHARS = 2000;

export class ContextBuilder {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  async build(message: string, maxTokens: number = DEFAULT_MAX_TOKENS): Promise<ContextBuildResult> {
    if (!message.includes("@")) {
      return { contextText: "", items: [], tokenEstimate: 0 };
    }

    const mentions = this.parseMentions(message);
    const items: ContextItem[] = [];
    let remainingTokens = maxTokens;

    for (const search of mentions.searches) {
      if (items.length >= MAX_CONTEXT_ITEMS) break;
      const item = await this.buildSearchContext(search, remainingTokens);
      if (item) {
        items.push(item);
        remainingTokens -= item.tokenEstimate;
      }
    }

    for (const tag of mentions.tags) {
      if (items.length >= MAX_CONTEXT_ITEMS) break;
      const item = await this.buildTagContext(tag, remainingTokens);
      if (item) {
        items.push(item);
        remainingTokens -= item.tokenEstimate;
      }
    }

    for (const folder of mentions.folders) {
      if (items.length >= MAX_CONTEXT_ITEMS) break;
      const item = await this.buildFolderContext(folder, remainingTokens);
      if (item) {
        items.push(item);
        remainingTokens -= item.tokenEstimate;
      }
    }

    for (const note of mentions.notes) {
      if (items.length >= MAX_CONTEXT_ITEMS) break;
      const item = await this.buildNoteContext(note, remainingTokens);
      if (item) {
        items.push(item);
        remainingTokens -= item.tokenEstimate;
      }
    }

    const contextText = items
      .map((item) => {
        const label = item.detail ? `${item.label} (${item.detail})` : item.label;
        return `### ${label}\n${item.content}`;
      })
      .join("\n\n");

    const tokenEstimate = items.reduce((sum, item) => sum + item.tokenEstimate, 0);

    return { contextText, items, tokenEstimate };
  }

  private parseMentions(message: string) {
    const searches = this.collectMatches(message, /@search\("([^"]+)"\)/g);
    const tags = this.collectMatches(message, /@tag\((#[^)]+)\)/g);
    const folders = this.collectMatches(message, /@folder\(([^)]+)\)/g);

    let stripped = message
      .replace(/@search\("[^"]+"\)/g, "")
      .replace(/@tag\(#[^)]+\)/g, "")
      .replace(/@folder\([^)]+\)/g, "");

    const noteMentions: { name: string; anchor?: string }[] = [];
    const notePattern = /@([^\s@]+)(#[^\s@]+)?/g;

    let match: RegExpExecArray | null;
    while ((match = notePattern.exec(stripped)) !== null) {
      const rawName = this.cleanupMention(match[1]);
      const anchor = match[2] ? this.cleanupMention(match[2]) : undefined;
      if (!rawName) continue;
      if (rawName.toLowerCase() === "search" || rawName.toLowerCase() === "tag" || rawName.toLowerCase() === "folder") {
        continue;
      }
      noteMentions.push({ name: rawName, anchor });
    }

    return {
      searches: this.dedupe(searches),
      tags: this.dedupe(tags),
      folders: this.dedupe(folders),
      notes: noteMentions,
    };
  }

  private collectMatches(text: string, pattern: RegExp): string[] {
    const matches: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      matches.push(match[1].trim());
    }
    return matches;
  }

  private dedupe(items: string[]): string[] {
    return Array.from(new Set(items));
  }

  private cleanupMention(value: string): string {
    return value.replace(/[\s,.;:!?)]+$/g, "").trim();
  }

  private async buildNoteContext(note: { name: string; anchor?: string }, tokenBudget: number): Promise<ContextItem | null> {
    const file = this.findNoteFile(note.name);
    if (!file) {
      return null;
    }

    const content = await this.app.vault.cachedRead(file);
    let excerpt = content;
    let detail: string | undefined;

    if (note.anchor) {
      if (note.anchor.startsWith("#^")) {
        const blockId = note.anchor.replace("#^", "");
        const block = this.extractBlock(content, blockId);
        if (block) {
          excerpt = block;
          detail = `Block ${blockId}`;
        }
      } else if (note.anchor.startsWith("#")) {
        const heading = note.anchor.replace("#", "");
        const section = this.extractHeading(content, heading);
        if (section) {
          excerpt = section;
          detail = `Heading ${heading}`;
        }
      }
    }

    const trimmed = this.trimContent(excerpt);
    const fitted = this.fitToTokenBudget(trimmed, tokenBudget);
    if (!fitted) {
      return null;
    }

    return {
      type: "note",
      label: `Note: ${file.basename}`,
      detail,
      content: fitted.content,
      sourcePaths: [file.path],
      tokenEstimate: fitted.tokenEstimate,
      isSummary: fitted.isSummary,
    };
  }

  private async buildTagContext(tag: string, tokenBudget: number): Promise<ContextItem | null> {
    const files = this.getFilesByTag(tag);
    if (files.length === 0) {
      return null;
    }

    const snippets: string[] = [];
    const sourcePaths: string[] = [];
    for (const file of files.slice(0, 3)) {
      const content = await this.app.vault.cachedRead(file);
      const excerpt = this.trimContent(content);
      snippets.push(`- ${file.basename}\n${excerpt}`);
      sourcePaths.push(file.path);
    }

    const combined = snippets.join("\n\n");
    const fitted = this.fitToTokenBudget(combined, tokenBudget);
    if (!fitted) {
      return null;
    }

    return {
      type: "tag",
      label: `Tag: ${tag}`,
      detail: `${files.length} files`,
      content: fitted.content,
      sourcePaths,
      tokenEstimate: fitted.tokenEstimate,
      isSummary: fitted.isSummary,
    };
  }

  private async buildSearchContext(query: string, tokenBudget: number): Promise<ContextItem | null> {
    const files = this.app.vault.getMarkdownFiles();
    const matches: { file: TFile; snippet: string }[] = [];

    for (const file of files) {
      if (matches.length >= 3) break;
      const content = await this.app.vault.cachedRead(file);
      const snippet = this.extractSnippet(content, query);
      if (snippet) {
        matches.push({ file, snippet });
      }
    }

    if (matches.length === 0) {
      return null;
    }

    const combined = matches
      .map((match) => `- ${match.file.basename}\n${match.snippet}`)
      .join("\n\n");

    const fitted = this.fitToTokenBudget(combined, tokenBudget);
    if (!fitted) {
      return null;
    }

    return {
      type: "search",
      label: `Search: "${query}"`,
      detail: `${matches.length} hits`,
      content: fitted.content,
      sourcePaths: matches.map((m) => m.file.path),
      tokenEstimate: fitted.tokenEstimate,
      isSummary: fitted.isSummary,
    };
  }

  private async buildFolderContext(folderPath: string, tokenBudget: number): Promise<ContextItem | null> {
    const normalized = folderPath.replace(/^[./]+/, "");
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(normalized));

    if (files.length === 0) {
      return null;
    }

    const snippets: string[] = [];
    const sourcePaths: string[] = [];

    for (const file of files.slice(0, 3)) {
      const content = await this.app.vault.cachedRead(file);
      const excerpt = this.trimContent(content);
      snippets.push(`- ${file.basename}\n${excerpt}`);
      sourcePaths.push(file.path);
    }

    const combined = snippets.join("\n\n");
    const fitted = this.fitToTokenBudget(combined, tokenBudget);
    if (!fitted) {
      return null;
    }

    return {
      type: "folder",
      label: `Folder: ${folderPath}`,
      detail: `${files.length} files`,
      content: fitted.content,
      sourcePaths,
      tokenEstimate: fitted.tokenEstimate,
      isSummary: fitted.isSummary,
    };
  }

  private findNoteFile(name: string): TFile | null {
    const files = this.app.vault.getMarkdownFiles();
    const normalized = name.replace(/\.[^/.]+$/, "");

    for (const file of files) {
      if (file.path === name || file.path === `${name}.md`) {
        return file;
      }
      if (file.basename.toLowerCase() === normalized.toLowerCase()) {
        return file;
      }
    }

    return null;
  }

  private extractHeading(content: string, heading: string): string | null {
    const lines = content.split("\n");
    const headingRegex = new RegExp(`^#{1,6}\\s+${this.escapeRegex(heading)}\\s*$`, "i");

    let startIndex = -1;
    let level = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (headingRegex.test(line)) {
        startIndex = i;
        level = line.match(/^#+/)?.[0].length || 1;
        break;
      }
    }

    if (startIndex === -1) {
      return null;
    }

    let endIndex = lines.length;
    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^(#+)\s+/);
      if (match && match[1].length <= level) {
        endIndex = i;
        break;
      }
    }

    return lines.slice(startIndex, endIndex).join("\n");
  }

  private extractBlock(content: string, blockId: string): string | null {
    const lines = content.split("\n");
    for (const line of lines) {
      if (line.includes(`^${blockId}`)) {
        return line;
      }
    }
    return null;
  }

  private extractSnippet(content: string, query: string): string | null {
    const lines = content.split("\n");
    const lowerQuery = query.toLowerCase();

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(lowerQuery)) {
        const start = Math.max(0, i - 1);
        const end = Math.min(lines.length, i + 2);
        return lines.slice(start, end).join("\n");
      }
    }

    return null;
  }

  private trimContent(content: string): string {
    if (content.length <= MAX_CONTENT_CHARS) {
      return content;
    }
    return `${content.slice(0, MAX_CONTENT_CHARS)}\n…`;
  }

  private fitToTokenBudget(
    content: string,
    tokenBudget: number,
  ): { content: string; tokenEstimate: number; isSummary: boolean } | null {
    if (tokenBudget <= 0) {
      return null;
    }

    const maxChars = Math.max(40, tokenBudget * 4);
    if (content.length <= maxChars) {
      return {
        content,
        tokenEstimate: this.estimateTokens(content),
        isSummary: false,
      };
    }

    const truncated = content.slice(0, Math.max(0, maxChars - 16)).trimEnd();
    const summary = `${truncated}\n…(truncated)`;
    const tokenEstimate = this.estimateTokens(summary);

    if (tokenEstimate > tokenBudget) {
      return null;
    }

    return {
      content: summary,
      tokenEstimate,
      isSummary: true,
    };
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
  }

  private getFilesByTag(tag: string): TFile[] {
    const normalized = tag.startsWith("#") ? tag : `#${tag}`;
    const files = this.app.vault.getMarkdownFiles();

    return files.filter((file) => {
      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache) return false;

      if (cache.tags?.some((t) => t.tag === normalized)) {
        return true;
      }

      const frontmatterTags = cache.frontmatter?.tags;
      if (!frontmatterTags) return false;

      if (Array.isArray(frontmatterTags)) {
        return frontmatterTags.some((t) => `#${t.replace(/^#/, "")}` === normalized);
      }

      if (typeof frontmatterTags === "string") {
        return `#${frontmatterTags.replace(/^#/, "")}` === normalized;
      }

      return false;
    });
  }
}
