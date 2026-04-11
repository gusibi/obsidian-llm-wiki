import { App, TFile, TFolder, Vault } from "obsidian";

export class VaultFileSystemAdapter {
  private app: App;
  private vault: Vault;

  constructor(app: App) {
    this.app = app;
    this.vault = app.vault;
  }

  async readFile(path: string): Promise<string> {
    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      throw new Error(`File not found: ${path}`);
    }
    return await this.vault.read(file);
  }

  async writeFile(path: string, content: string): Promise<void> {
    console.log("Claude ACP Vault: ===== writeFile START =====");
    console.log("Claude ACP Vault: path:", path);
    console.log("Claude ACP Vault: content length:", content.length);
    console.log(
      "Claude ACP Vault: content preview (first 100 chars):",
      content.substring(0, 100),
    );

    const existingFile = this.vault.getAbstractFileByPath(path);
    console.log("Claude ACP Vault: existingFile:", existingFile);
    console.log(
      "Claude ACP Vault: existingFile type:",
      existingFile?.constructor.name,
    );

    try {
      if (existingFile instanceof TFile) {
        console.log("Claude ACP Vault: Modifying existing file");
        await this.vault.modify(existingFile, content);
        console.log("Claude ACP Vault: File modified successfully");
      } else {
        console.log("Claude ACP Vault: Creating new file");
        await this.vault.create(path, content);
        // console.log('Claude ACP Vault: File created successfully');
      }
      console.log("Claude ACP Vault: ===== writeFile END (SUCCESS) =====");
    } catch (error) {
      console.error("Claude ACP Vault: ===== writeFile ERROR =====");
      console.error("Claude ACP Vault: Error:", error);
      if (error instanceof Error) {
        console.error("Claude ACP Vault: Error message:", error.message);
        console.error("Claude ACP Vault: Error stack:", error.stack);
      }
      console.error("Claude ACP Vault: Error string:", String(error));
      console.error("Claude ACP Vault: =========================");
      throw error;
    }
  }

  async deleteFile(path: string): Promise<void> {
    const file = this.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.vault.trash(file, false);
    }
  }

  fileExists(path: string): boolean {
    const file = this.vault.getAbstractFileByPath(path);
    return file instanceof TFile;
  }

  directoryExists(path: string): boolean {
    const folder = this.vault.getAbstractFileByPath(path);
    return folder instanceof TFolder;
  }

  listFiles(path: string = "/"): string[] {
    const folder =
      path === "/"
        ? this.vault.getRoot()
        : this.vault.getAbstractFileByPath(path);

    if (!(folder instanceof TFolder)) {
      return [];
    }

    const files: string[] = [];

    function traverseFolder(currentFolder: TFolder, currentPath: string) {
      for (const child of currentFolder.children) {
        const childPath =
          currentPath === "/" ? child.name : `${currentPath}/${child.name}`;

        if (child instanceof TFile && child.path.endsWith(".md")) {
          files.push(childPath);
        } else if (child instanceof TFolder) {
          traverseFolder(child, childPath);
        }
      }
    }

    traverseFolder(folder, path === "/" ? "" : path);
    return files;
  }

  getFileInfo(
    path: string,
  ): { size: number; mtime: number; ctime: number } | null {
    const file = this.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      return {
        size: file.stat.size,
        mtime: file.stat.mtime,
        ctime: file.stat.ctime,
      };
    }
    return null;
  }

  async createDirectory(path: string): Promise<void> {
    if (this.directoryExists(path)) {
      return;
    }

    await this.vault.createFolder(path);
  }

  getVaultPath(): string {
    // getBasePath is not available in DataAdapter type
    // Return empty string or use alternative method
    return "";
  }

  resolvePath(relativePath: string): string {
    const basePath = this.getVaultPath();
    return `${basePath}/${relativePath}`.replace(/\/+/g, "/");
  }

  getRelativePath(absolutePath: string): string {
    const basePath = this.getVaultPath();
    if (absolutePath.startsWith(basePath)) {
      return absolutePath.substring(basePath.length).replace(/^\//, "");
    }
    return absolutePath;
  }

  async searchFiles(query: string): Promise<string[]> {
    const allFiles = this.vault.getMarkdownFiles();
    const queryLower = query.toLowerCase();

    return allFiles
      .filter((file) => {
        const filename = file.basename.toLowerCase();
        const path = file.path.toLowerCase();
        return filename.includes(queryLower) || path.includes(queryLower);
      })
      .map((file) => file.path);
  }

  async getFileTags(path: string): Promise<string[]> {
    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return [];
    }

    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) {
      return [];
    }

    const tags: string[] = [];

    if (cache.tags) {
      for (const tag of cache.tags) {
        tags.push(tag.tag);
      }
    }

    if (cache.frontmatter?.tags) {
      const frontmatterTags = cache.frontmatter.tags;
      if (Array.isArray(frontmatterTags)) {
        tags.push(
          ...frontmatterTags.map((tag: string) =>
            tag.startsWith("#") ? tag : `#${tag}`,
          ),
        );
      } else if (typeof frontmatterTags === "string") {
        tags.push(
          frontmatterTags.startsWith("#")
            ? frontmatterTags
            : `#${frontmatterTags}`,
        );
      }
    }

    return [...new Set(tags)];
  }

  async updateFileTags(path: string, tags: string[]): Promise<void> {
    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      throw new Error(`File not found: ${path}`);
    }

    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter.tags = tags.map((tag) =>
        tag.startsWith("#") ? tag.substring(1) : tag,
      );
    });
  }
}
