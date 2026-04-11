import { App, TFile, TFolder } from "obsidian";
import { ClaudeACPSettings } from "./settings";

export interface WikiStatus {
  initialized: boolean;
  rootPath: string;
  hasClaudeMd: boolean;
  hasWikiDir: boolean;
  hasIndexMd: boolean;
  hasLogMd: boolean;
  hasLegacyDir: boolean;
  rawSubdirs: string[];
  wikiSubdirs: string[];
  pageCount: number;
  rawCount: number;
}

export class WikiDetector {
  private app: App;
  private settingsProvider: () => ClaudeACPSettings;

  constructor(app: App, settingsProvider: () => ClaudeACPSettings) {
    this.app = app;
    this.settingsProvider = settingsProvider;
  }

  getRootPath(): string {
    const configured = this.settingsProvider().wikiRootPath.trim();
    return configured || "";
  }

  private resolve(relativePath: string): string {
    const root = this.getRootPath();
    if (!root) {
      return relativePath;
    }
    return `${root}/${relativePath}`;
  }

  private fileExists(path: string): boolean {
    return this.app.vault.getAbstractFileByPath(path) instanceof TFile;
  }

  private folderExists(path: string): boolean {
    return this.app.vault.getAbstractFileByPath(path) instanceof TFolder;
  }

  private listSubdirs(parentPath: string): string[] {
    const parent = this.app.vault.getAbstractFileByPath(parentPath);
    if (!(parent instanceof TFolder)) {
      return [];
    }
    return parent.children
      .filter((child) => child instanceof TFolder)
      .map((child) => child.name)
      .sort();
  }

  private countMarkdownFiles(folderPath: string): number {
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) {
      return 0;
    }
    let count = 0;
    const walk = (f: TFolder) => {
      for (const child of f.children) {
        if (child instanceof TFile && child.extension === "md") {
          count++;
        } else if (child instanceof TFolder) {
          walk(child);
        }
      }
    };
    walk(folder);
    return count;
  }

  private countAllFiles(folderPath: string): number {
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) {
      return 0;
    }
    let count = 0;
    const walk = (f: TFolder) => {
      for (const child of f.children) {
        if (child instanceof TFile) {
          count++;
        } else if (child instanceof TFolder) {
          walk(child);
        }
      }
    };
    walk(folder);
    return count;
  }

  private normalizeSourceName(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const wikiLinkMatch = trimmed.match(/\[\[([^|\]]+)/);
    const rawTarget = wikiLinkMatch ? wikiLinkMatch[1] : trimmed;
    const basename = rawTarget.split("/").pop()?.replace(/\.md$/i, "").trim();
    return basename ? basename.toLowerCase() : null;
  }

  detect(): WikiStatus {
    const claudeMdPath = this.resolve("CLAUDE.md");
    const wikiDirPath = this.resolve("wiki");
    const indexMdPath = this.resolve("index.md");
    const logMdPath = this.resolve("log.md");
    const legacyDirPath = this.resolve("legacy");
    const rawDirPath = this.resolve("raw");

    const hasClaudeMd = this.fileExists(claudeMdPath);
    const hasWikiDir = this.folderExists(wikiDirPath);
    const hasIndexMd = this.fileExists(indexMdPath);
    const hasLogMd = this.fileExists(logMdPath);
    const hasLegacyDir = this.folderExists(legacyDirPath);

    const rawSubdirs = this.listSubdirs(rawDirPath);
    const wikiSubdirs = this.listSubdirs(wikiDirPath);
    const pageCount = this.countMarkdownFiles(wikiDirPath);
    const rawCount = this.countMarkdownFiles(rawDirPath);

    return {
      initialized: hasClaudeMd && hasWikiDir,
      rootPath: this.getRootPath(),
      hasClaudeMd,
      hasWikiDir,
      hasIndexMd,
      hasLogMd,
      hasLegacyDir,
      rawSubdirs,
      wikiSubdirs,
      pageCount,
      rawCount,
    };
  }

  async getClaudeMdContent(): Promise<string | null> {
    const path = this.resolve("CLAUDE.md");
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return null;
    }
    return this.app.vault.cachedRead(file);
  }

  async getIndexContent(): Promise<string | null> {
    const path = this.resolve("index.md");
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return null;
    }
    return this.app.vault.cachedRead(file);
  }

  async getLegacyFileList(): Promise<string[]> {
    const legacyPath = this.resolve("legacy");
    const folder = this.app.vault.getAbstractFileByPath(legacyPath);
    if (!(folder instanceof TFolder)) {
      return [];
    }
    const files: string[] = [];
    const walk = (f: TFolder) => {
      for (const child of f.children) {
        if (child instanceof TFile) {
          files.push(child.path);
        } else if (child instanceof TFolder) {
          walk(child);
        }
      }
    };
    walk(folder);
    return files.sort();
  }

  listRawFiles(): string[] {
    const rawPath = this.resolve("raw");
    const folder = this.app.vault.getAbstractFileByPath(rawPath);
    if (!(folder instanceof TFolder)) {
      return [];
    }
    const files: string[] = [];
    const walk = (f: TFolder) => {
      for (const child of f.children) {
        if (child instanceof TFile && child.extension === "md") {
          files.push(child.path);
        } else if (child instanceof TFolder) {
          walk(child);
        }
      }
    };
    walk(folder);
    return files.sort();
  }

  /**
   * Returns basenames (no extension) of raw sources that already have
   * a wiki summary, by reading `sources` frontmatter from wiki/summaries/.
   */
  getIngestedSourceNames(): Set<string> {
    const summariesPath = this.resolve("wiki/summaries");
    const folder = this.app.vault.getAbstractFileByPath(summariesPath);
    if (!(folder instanceof TFolder)) {
      return new Set();
    }

    const ingested = new Set<string>();
    for (const child of folder.children) {
      if (!(child instanceof TFile) || child.extension !== "md") continue;
      const cache = this.app.metadataCache.getFileCache(child);
      const sources = cache?.frontmatter?.sources;
      if (!Array.isArray(sources)) continue;
      for (const src of sources) {
        const normalized = this.normalizeSourceName(String(src));
        if (normalized) ingested.add(normalized);
      }
    }
    return ingested;
  }
}
