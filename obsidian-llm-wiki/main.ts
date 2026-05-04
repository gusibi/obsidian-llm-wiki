import {
  App,
  Editor,
  Modal,
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
  TextAreaComponent,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import { ClaudeCodeConnection } from "./src/claude-connection";
import { CursorAgentConnection } from "./src/cursor-connection";
import { GeminiConnection } from "./src/gemini-connection";
import { ACPConnection } from "./src/agent-connection";
import { ChatView, CHAT_VIEW_TYPE } from "./src/chat-view";
import {
  ClaudeACPSettings,
  DEFAULT_SETTINGS,
  TerminalPolicy,
  TodoTarget,
  ACPProvider,
} from "./src/settings";
import { WikiDetector } from "./src/wiki-detector";

export default class ClaudeACPPlugin extends Plugin {
  settings!: ClaudeACPSettings;
  private claudeConnection: ACPConnection | null = null;
  private wikiDetector!: WikiDetector;
  private fileMonitorReady = false;

  async onload() {
    await this.loadSettings();
    this.wikiDetector = new WikiDetector(this.app, () => this.settings);

    this.addSettingTab(new ClaudeACPSettingTab(this.app, this));
    this.initializeACPClient();
    this.registerViews();
    this.addCommands();
    this.registerObsidianProtocolHandler("claude-acp", (params) =>
      this.handleProtocol(params),
    );
    this.setupDefaultHotkeys();
    this.setupFileMonitoring();
  }

  onunload() {
    this.cleanupACPClient();
  }

  async loadSettings() {
    const loaded = (await this.loadData()) || {};
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...loaded,
      enabledFeatures: {
        ...DEFAULT_SETTINGS.enabledFeatures,
        ...(loaded.enabledFeatures || {}),
      },
    };
  }

  async saveSettings(options?: { refreshConnection?: boolean }) {
    await this.saveData(this.settings);
    if (options?.refreshConnection === false) {
      return;
    }
    await this.refreshACPClient();
  }

  private getProviderLabel(): string {
    return this.settings.agentProvider === "cursor"
      ? "Cursor Agent"
      : this.settings.agentProvider === "gemini"
      ? "Gemini Agent"
      : "Claude Code";
  }

  private createConnection(): ACPConnection {
    if (this.settings.agentProvider === "cursor") {
      return new CursorAgentConnection(this.app, () => this.settings);
    }
    if (this.settings.agentProvider === "gemini") {
      return new GeminiConnection(
        this.app,
        this.settings.geminiApiKey,
        this.settings.geminiAgentPath,
        () => this.settings,
      );
    }

    return new ClaudeCodeConnection(
      this.app,
      this.settings.anthropicApiKey,
      this.settings.claudeCodePath,
      () => this.settings,
    );
  }

  private async initializeACPClient() {
    if (
      (this.settings.agentProvider === "claude" &&
        !this.settings.anthropicApiKey &&
        !this.settings.claudeCodePath) ||
      (this.settings.agentProvider === "gemini" &&
        !this.settings.geminiApiKey &&
        !this.settings.geminiAgentPath)
    ) {
      new Notice(
        `Please set either API key or agent path in settings for ${this.getProviderLabel()}`,
      );
      this.updateViewConnections();
      return;
    }

    try {
      this.claudeConnection = this.createConnection();

      const connected = await this.claudeConnection.connect();
      if (connected) {
        new Notice(`Successfully connected to ${this.getProviderLabel()}`);
      } else {
        new Notice(
          `Failed to connect to ${this.getProviderLabel()}. Please check your settings.`,
        );
      }
      this.updateViewConnections();
    } catch (error: any) {
      console.error("LLM Wiki: Initialization error:", error);
      new Notice("Failed to initialize claude-code-acp: " + error.message);
      this.updateViewConnections();
    }
  }

  private cleanupACPClient() {
    if (this.claudeConnection) {
      this.claudeConnection.disconnect();
      this.claudeConnection = null;
    }
  }

  private async refreshACPClient() {
    this.cleanupACPClient();
    await this.initializeACPClient();
  }

  private updateViewConnections() {
    this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE).forEach((leaf) => {
      const view = leaf.view as ChatView;
      view.updateConnection(this.claudeConnection ?? undefined);
    });
  }

  public async setAgentProvider(provider: ACPProvider) {
    if (this.settings.agentProvider === provider) {
      return;
    }
    this.settings.agentProvider = provider;
    await this.saveSettings();
  }

  private registerViews() {
    this.registerView(
      CHAT_VIEW_TYPE,
      (leaf) =>
        new ChatView(
          leaf,
          this.claudeConnection!,
          () => this.settings,
          async (provider) => {
            await this.setAgentProvider(provider);
          },
          this.wikiDetector,
        ),
    );

    this.addRibbonIcon(
      "library",
      "Open LLM Wiki",
      (evt: MouseEvent) => {
        this.activateView(CHAT_VIEW_TYPE);
      },
    );
  }

  private async activateView(viewType: string) {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(viewType);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getLeftLeaf(false);
      await leaf?.setViewState({ type: viewType, active: true });
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  private async handleProtocol(params: Record<string, string>) {
    const sessionId = params.session;
    if (!sessionId) {
      return;
    }

    await this.activateView(CHAT_VIEW_TYPE);
    const chatView = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]
      ?.view as unknown as ChatView;
    if (chatView) {
      await chatView.openSessionById(sessionId);
    }
  }

  private async editFileWithAI(file: any) {
    try {
      new Notice(`AI editing: ${file.basename}`);

      const content = await this.app.vault.read(file);
      const instruction = await this.showEditDialog(file.basename);

      if (instruction) {
        const result = await this.claudeConnection!.editFile(
          file.path,
          instruction,
        );

        new Notice("Edit completed successfully");

        const chatView = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]
          ?.view as unknown as ChatView;
        if (chatView) {
          chatView.setConnectionStatus(true);
          chatView.addChatMessage("Claude", result, "assistant");
        }
      }
    } catch (error: any) {
      new Notice("Failed to edit file: " + error.message);
    }
  }

  private async showEditDialog(fileName: string): Promise<string> {
    return new Promise((resolve) => {
      const modal = new Modal(this.app);
      modal.setTitle(`AI Edit: ${fileName}`);

      const content = modal.contentEl.createEl("div", { cls: "edit-dialog" });

      content.createEl("p", {
        text: "What would you like Claude to do with this file?",
      });

      const instructionArea = new TextAreaComponent(content);
      instructionArea.inputEl.placeholder =
        'e.g., "Improve the structure and fix typos"...';
      instructionArea.inputEl.rows = 4;

      const buttonContainer = content.createEl("div", {
        cls: "dialog-buttons",
      });

      const okButton = buttonContainer.createEl("button", {
        text: "Edit",
        cls: "mod-cta",
      });
      okButton.onclick = () => {
        resolve(instructionArea.getValue());
        modal.close();
      };

      const cancelButton = buttonContainer.createEl("button", {
        text: "Cancel",
      });
      cancelButton.onclick = () => {
        resolve("");
        modal.close();
      };

      modal.open();
    });
  }

  /**
   * Show confirm dialog
   */
  private async showConfirmDialog(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new Modal(this.app);
      modal.setTitle(title);

      const content = modal.contentEl.createEl("div");
      content.createEl("p", { text: message });

      const buttonContainer = content.createEl("div", {
        cls: "dialog-buttons",
      });

      const okButton = buttonContainer.createEl("button", {
        text: "Yes",
        cls: "mod-cta",
      });
      okButton.onclick = () => {
        resolve(true);
        modal.close();
      };

      const cancelButton = buttonContainer.createEl("button", {
        text: "No",
      });
      cancelButton.onclick = () => {
        resolve(false);
        modal.close();
      };

      modal.open();
    });
  }

  /**
   * Show message modal
   */
  private showMessageModal(title: string, message: string) {
    const modal = new Modal(this.app);
    modal.setTitle(title);

    const content = modal.contentEl.createEl("div");
    content.style.whiteSpace = "pre-wrap";
    content.style.fontFamily = "monospace";
    content.style.fontSize = "14px";
    content.style.lineHeight = "1.6";
    content.textContent = message;

    const closeButton = content.createEl("button", {
      text: "Close",
      cls: "mod-cta",
      attr: { style: "margin-top: 20px;" },
    });
    closeButton.onclick = () => modal.close();

    modal.open();
  }

  private setupFileMonitoring() {
    this.app.workspace.onLayoutReady(() => {
      this.fileMonitorReady = true;
    });

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        this.notifyFileChange(file, "modified");
      }),
    );

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        this.notifyFileChange(file, "created");
      }),
    );

    // 添加文件菜单事件
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile && file.extension === "md") {
          menu.addItem((item) => {
            item
              .setTitle("🏷️ Generate Tags")
              .setIcon("tag")
              .onClick(async () => {
                if (!this.claudeConnection || !this.claudeConnection.isConnected()) {
                  new Notice(`Please connect to ${this.getProviderLabel()} first`);
                  return;
                }

                try {
                  new Notice("🔄 Generating tags...");
                  const content = await this.app.vault.read(file);
                  const tags = await this.claudeConnection.analyzeTags(file.path, content);

                  if (tags.length === 0) {
                    new Notice("No tags generated");
                    return;
                  }

                  const message = `Generated tags:\n${tags.map(tag => `• ${tag}`).join("\n")}\n\nApply these tags?`;
                  const shouldApply = await this.showConfirmDialog("Apply Tags?", message);

                  if (shouldApply) {
                    const { VaultFileSystemAdapter } = await import("./src/vault-adapter");
                    const vaultAdapter = new VaultFileSystemAdapter(this.app);
                    await vaultAdapter.updateFileTags(file.path, tags);
                    new Notice(`✅ ${tags.length} tags applied`);
                  }
                } catch (error: any) {
                  new Notice(`❌ Tag generation failed: ${error.message}`);
                }
              });
          });

          menu.addItem((item) => {
            item
              .setTitle("🔍 Audit Tags")
              .setIcon("search")
              .onClick(async () => {
                if (!this.claudeConnection || !this.claudeConnection.isConnected()) {
                  new Notice(`Please connect to ${this.getProviderLabel()} first`);
                  return;
                }

                try {
                  new Notice("🔍 Auditing tags...");
                  const { VaultFileSystemAdapter } = await import("./src/vault-adapter");
                  const { TagManager } = await import("./src/utils/tag-manager");
                  const { TagAuditor } = await import("./src/utils/tag-auditor");

                  const vaultAdapter = new VaultFileSystemAdapter(this.app);
                  const tagManager = new TagManager(vaultAdapter);
                  const tagAuditor = new TagAuditor(this.claudeConnection, tagManager, vaultAdapter, () => this.settings);

                  const content = await vaultAdapter.readFile(file.path);
                  const currentTags = await vaultAdapter.getFileTags(file.path);
                  const auditResult = await tagAuditor.auditFileTags(file.path, content, currentTags);

                  let message = `📊 Tag Audit Result:\nScore: ${auditResult.overallScore}/100\n\n`;

                  if (auditResult.issues.length > 0) {
                    message += `Issues (${auditResult.issues.length}):\n`;
                    auditResult.issues.forEach(issue => {
                      const emoji = issue.type === "error" ? "❌" : issue.type === "warning" ? "⚠️" : "💡";
                      message += `${emoji} ${issue.tag ? `${issue.tag}: ` : ""}${issue.message}\n`;
                      if (issue.fix) message += `   → ${issue.fix}\n`;
                    });

                    const shouldOptimize = await this.showConfirmDialog(
                      "Optimize Tags?",
                      `${auditResult.issues.length} issues found. Auto-optimize?`
                    );

                    if (shouldOptimize) {
                      const optimizationResult = await tagAuditor.autoOptimizeTags(currentTags, auditResult);
                      await vaultAdapter.updateFileTags(file.path, optimizationResult.optimizedTags);
                      new Notice(`✅ Tags optimized! ${optimizationResult.changes.length} changes`);
                    }
                  } else {
                    message += "✅ Tags look perfect!";
                    new Notice("✅ Tags look great!");
                  }

                  this.showMessageModal("Tag Audit Result", message);
                } catch (error: any) {
                  new Notice(`❌ Tag audit failed: ${error.message}`);
                }
              });
          });
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.notifyFileChange(file, "deleted");
      }),
    );
  }

  private notifyFileChange(file: any, changeType: string) {
    if (changeType === "created" && !this.fileMonitorReady) {
      return;
    }

    if (typeof file?.path === "string" && file.path.startsWith(".obsidian/")) {
      return;
    }

    if (this.claudeConnection?.isConnected()) {
      console.log(`File ${changeType}:`, file.path);
    }
  }

  async testConnection() {
    new Notice(`Testing ${this.getProviderLabel()} connection...`);

    try {
      if (!this.claudeConnection) {
        this.claudeConnection = this.createConnection();
      }

      const connected = await this.claudeConnection.connect();

      if (connected) {
        new Notice(
          `✅ Connection successful! ${this.getProviderLabel()} is ready.`,
        );

        const chatView = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]
          ?.view as unknown as ChatView;
        if (chatView) {
          chatView.setConnectionStatus(true);
        }
      } else {
        new Notice("❌ Connection failed. Please check your settings:");
        if (this.settings.agentProvider === "cursor") {
          new Notice("• Cursor Agent executable path");
          new Notice("• Cursor CLI login (cursor-agent login)");
        } else if (this.settings.agentProvider === "gemini") {
          new Notice("• Gemini Agent executable path");
          new Notice("• API key (if required)");
        } else {
          new Notice("• Claude Code executable path");
          new Notice("• API key (if required)");
        }
        new Notice("• Network connection");
        new Notice("• Permissions");
      }
    } catch (error: any) {
      console.error("Connection test error:", error);
      new Notice(`❌ Connection test failed: ${error.message}`);
    }
  }

  private setupDefaultHotkeys() {}

  private addCommands() {
    this.addCommand({
      id: "open-claude-chat",
      name: "Open LLM Wiki Chat",
      callback: () => {
        this.activateView(CHAT_VIEW_TYPE);
      },
    });

    this.addCommand({
      id: "open-wiki-panel",
      name: "Open Wiki Panel",
      callback: () => {
        this.activateView(CHAT_VIEW_TYPE);
      },
    });

    this.addCommand({
      id: "ai-edit-current-file",
      name: "AI Edit Current File",
      editorCallback: (editor, view) => {
        if (!this.claudeConnection || !this.claudeConnection.isConnected()) {
          new Notice(`Please connect to ${this.getProviderLabel()} first`);
          return;
        }

        const file = view.file;
        if (file) {
          this.editFileWithAI(file);
        } else {
          new Notice("No file currently active");
        }
      },
    });

    this.addCommand({
      id: "quick-chat-about-current-note",
      name: "Quick Chat About Current Note",
      editorCallback: (editor, view) => {
        if (!this.claudeConnection || !this.claudeConnection.isConnected()) {
          new Notice(`Please connect to ${this.getProviderLabel()} first`);
          return;
        }

        this.activateView(CHAT_VIEW_TYPE);

        const file = view.file;
        if (file) {
          setTimeout(() => {
            const chatView = this.app.workspace.getLeavesOfType(
              CHAT_VIEW_TYPE,
            )[0]?.view as unknown as ChatView;
            if (chatView) {
              const inputArea = (chatView as any).inputArea;
              if (inputArea) {
                inputArea.setValue(
                  `Help me improve this note: "${file.basename}"`,
                );
              }
            }
          }, 100);
        } else {
          new Notice("No file currently active");
        }
      },
    });

    this.addCommand({
      id: "send-selection-to-claude-chat",
      name: "Send Selection to Chat",
      editorCallback: (editor, view) => {
        if (!this.claudeConnection || !this.claudeConnection.isConnected()) {
          new Notice(`Please connect to ${this.getProviderLabel()} first`);
          return;
        }

        const selection = editor.getSelection();
        if (!selection.trim()) {
          new Notice("No selection to send");
          return;
        }

        const file = view.file;
        const from = editor.getCursor("from");
        const to = editor.getCursor("to");
        const startLine = (from?.line ?? 0) + 1;
        const endLine = (to?.line ?? startLine - 1) + 1;
        const rangeLabel =
          startLine === endLine
            ? `line ${startLine}`
            : `lines ${startLine}-${endLine}`;
        const fileLabel = file?.path ? ` (${file.path})` : "";
        const payload = `Selected ${rangeLabel}${fileLabel}:\n\`\`\`\n${selection}\n\`\`\``;

        this.activateView(CHAT_VIEW_TYPE);
        setTimeout(() => {
          const chatView = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]
            ?.view as unknown as ChatView;
          if (chatView) {
            chatView.appendToInput(payload);
          }
        }, 100);
      },
    });

    // ==================== 标签系统命令 ====================
    this.addCommand({
      id: "audit-current-file-tags",
      name: "Audit Current File Tags",
      editorCallback: async (editor, view) => {
        if (!this.claudeConnection || !this.claudeConnection.isConnected()) {
          new Notice(`Please connect to ${this.getProviderLabel()} first`);
          return;
        }

        const file = view.file;
        if (!file) {
          new Notice("No file currently active");
          return;
        }

        try {
          new Notice("🔍 Auditing tags...");
          const { VaultFileSystemAdapter } = await import("./src/vault-adapter");
          const { TagManager } = await import("./src/utils/tag-manager");
          const { TagAuditor } = await import("./src/utils/tag-auditor");

          const vaultAdapter = new VaultFileSystemAdapter(this.app);
          const tagManager = new TagManager(vaultAdapter);
          const tagAuditor = new TagAuditor(this.claudeConnection, tagManager, vaultAdapter, () => this.settings);

          const content = await vaultAdapter.readFile(file.path);
          const currentTags = await vaultAdapter.getFileTags(file.path);
          const auditResult = await tagAuditor.auditFileTags(file.path, content, currentTags);

          let message = `📊 Tag Audit Result for "${file.basename}":\n`;
          message += `Score: ${auditResult.overallScore}/100\n`;

          if (auditResult.issues.length > 0) {
            message += `\nIssues found (${auditResult.issues.length}):\n`;
            auditResult.issues.forEach(issue => {
              const emoji = issue.type === "error" ? "❌" : issue.type === "warning" ? "⚠️" : "💡";
              message += `${emoji} ${issue.tag ? `${issue.tag}: ` : ""}${issue.message}\n`;
              if (issue.fix) {
                message += `   → Fix: ${issue.fix}\n`;
              }
            });
          }

          if (auditResult.suggestions.length > 0) {
            message += `\nSuggestions:\n`;
            auditResult.suggestions.forEach(suggestion => {
              message += `• ${suggestion}\n`;
            });
          }

          if (auditResult.issues.length > 0) {
            const shouldOptimize = await this.showConfirmDialog(
              "Optimize Tags?",
              `${auditResult.issues.length} issues found. Would you like to auto-optimize these tags?`
            );

            if (shouldOptimize) {
              const optimizationResult = await tagAuditor.autoOptimizeTags(currentTags, auditResult);
              await vaultAdapter.updateFileTags(file.path, optimizationResult.optimizedTags);
              new Notice(`✅ Tags optimized! ${optimizationResult.changes.length} changes applied`);
            }
          } else {
            new Notice("✅ Tags look great!");
          }

          this.showMessageModal("Tag Audit Result", message);

        } catch (error: any) {
          console.error("Tag audit failed:", error);
          new Notice(`❌ Tag audit failed: ${error.message}`);
        }
      },
    });

    this.addCommand({
      id: "audit-all-wiki-tags",
      name: "Audit All Wiki Tags",
      callback: async () => {
        if (!this.claudeConnection || !this.claudeConnection.isConnected()) {
          new Notice(`Please connect to ${this.getProviderLabel()} first`);
          return;
        }

        try {
          new Notice("🔍 Auditing all wiki tags...");
          const { VaultFileSystemAdapter } = await import("./src/vault-adapter");
          const { TagManager } = await import("./src/utils/tag-manager");
          const { TagAuditor } = await import("./src/utils/tag-auditor");

          const vaultAdapter = new VaultFileSystemAdapter(this.app);
          const tagManager = new TagManager(vaultAdapter);
          const tagAuditor = new TagAuditor(this.claudeConnection, tagManager, vaultAdapter, () => this.settings);

          await tagManager.learnFromExistingTags();
          const auditReport = await tagAuditor.auditAllTags();

          let message = `📊 Global Tag Audit Report:\n`;
          message += `Health Score: ${auditReport.healthScore}/100\n`;
          message += `Total files: ${auditReport.totalFiles}\n`;
          message += `Total tags: ${auditReport.totalTags}\n`;
          message += `Unique tags: ${auditReport.uniqueTags}\n\n`;

          const issues = auditReport.issues;
          const totalIssues =
            issues.duplicateTags.length +
            issues.similarTags.length +
            issues.flatTags.length +
            issues.rarelyUsedTags.length +
            issues.overusedTags.length;

          if (totalIssues > 0) {
            message += `⚠️ Issues found:\n`;
            if (issues.duplicateTags.length > 0) message += `- Duplicate tags: ${issues.duplicateTags.length}\n`;
            if (issues.similarTags.length > 0) message += `- Similar tag groups: ${issues.similarTags.length}\n`;
            if (issues.flatTags.length > 0) message += `- Flat tags (non-hierarchical): ${issues.flatTags.length}\n`;
            if (issues.rarelyUsedTags.length > 0) message += `- Rarely used tags: ${issues.rarelyUsedTags.length}\n`;
            if (issues.overusedTags.length > 0) message += `- Overused tags: ${issues.overusedTags.length}\n`;

            message += `\nOptimization suggestions:\n`;
            auditReport.optimizationSuggestions.forEach(suggestion => {
              const impact = suggestion.impact === "high" ? "🔴 High impact" : suggestion.impact === "medium" ? "🟡 Medium impact" : "🟢 Low impact";
              const effort = suggestion.effort === "high" ? "⚡ High effort" : suggestion.effort === "medium" ? "⚡ Medium effort" : "⚡ Low effort";
              message += `• ${suggestion.description} (${impact}, ${effort})\n`;
            });

            if (issues.flatTags.length > 0) {
              const shouldMigrate = await this.showConfirmDialog(
                "Migrate Flat Tags?",
                `Found ${issues.flatTags.length} flat tags. Would you like to convert them to hierarchical format?`
              );

              if (shouldMigrate) {
                const { TagMigrator } = await import("./src/utils/tag-migrator");
                const migrator = new TagMigrator(tagManager, tagAuditor, vaultAdapter);

                const preview = await migrator.generatePreviewReport();
                const proceed = await this.showConfirmDialog(
                  "Confirm Migration",
                  `Migration will update ${preview.stats.convertedToHierarchical} tags in ${preview.updatedFiles} files. Proceed?`
                );

                if (proceed) {
                  const result = await migrator.migrate();
                  if (result.success) {
                    new Notice(`✅ Migration completed! ${result.updatedFiles} files updated`);
                  } else {
                    new Notice(`❌ Migration failed with ${result.errors.length} errors`);
                  }
                }
              }
            }
          } else {
            message += "✅ All tags look great!";
            new Notice("✅ Tag audit completed, no issues found!");
          }

          this.showMessageModal("Global Tag Audit Report", message);

        } catch (error: any) {
          console.error("Global tag audit failed:", error);
          new Notice(`❌ Global tag audit failed: ${error.message}`);
        }
      },
    });

    this.addCommand({
      id: "generate-tags-for-current-file",
      name: "Generate Tags for Current File",
      editorCallback: async (editor, view) => {
        if (!this.claudeConnection || !this.claudeConnection.isConnected()) {
          new Notice(`Please connect to ${this.getProviderLabel()} first`);
          return;
        }

        const file = view.file;
        if (!file) {
          new Notice("No file currently active");
          return;
        }

        try {
          new Notice("🔄 Generating tags...");
          const content = await this.app.vault.read(file);
          const tags = await this.claudeConnection.analyzeTags(file.path, content);

          if (tags.length === 0) {
            new Notice("No tags generated");
            return;
          }

          const message = `Generated tags:\n${tags.map(tag => `• ${tag}`).join("\n")}\n\nWould you like to apply these tags?`;
          const shouldApply = await this.showConfirmDialog("Apply Generated Tags?", message);

          if (shouldApply) {
            const { VaultFileSystemAdapter } = await import("./src/vault-adapter");
            const vaultAdapter = new VaultFileSystemAdapter(this.app);
            await vaultAdapter.updateFileTags(file.path, tags);
            new Notice(`✅ ${tags.length} tags applied successfully`);
          }

        } catch (error: any) {
          console.error("Tag generation failed:", error);
          new Notice(`❌ Tag generation failed: ${error.message}`);
        }
      },
    });
  }
}

class ClaudeACPSettingTab extends PluginSettingTab {
  plugin: ClaudeACPPlugin;

  constructor(app: App, plugin: ClaudeACPPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "LLM Wiki Settings" });

    new Setting(containerEl)
      .setName("Agent provider")
      .setDesc("Select which ACP adapter to use")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("claude", "Claude Code (claude-code-acp)")
          .addOption("cursor", "Cursor CLI ACP (agent acp)")
          .addOption("gemini", "Gemini Agent (gemini acp)")
          .setValue(this.plugin.settings.agentProvider)
          .onChange(async (value) => {
            await this.plugin.setAgentProvider(value as ACPProvider);
            this.display();
          });
      });

    if (this.plugin.settings.agentProvider === "gemini") {
      containerEl.createEl("h3", { text: "Gemini Agent Configuration" });

      new Setting(containerEl)
        .setName("Gemini API Key")
        .setDesc("Your Gemini API key (optional if using local agent)")
        .addText((text) =>
          text
            .setPlaceholder("AIza...")
            .setValue(this.plugin.settings.geminiApiKey)
            .onChange(async (value) => {
              this.plugin.settings.geminiApiKey = value;
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("Gemini Agent Path")
        .setDesc('Path to gemini agent (e.g., "gemini --acp" if in PATH)')
        .addText((text) =>
          text
            .setPlaceholder("gemini --acp")
            .setValue(this.plugin.settings.geminiAgentPath)
            .onChange(async (value) => {
              this.plugin.settings.geminiAgentPath = value;
              await this.plugin.saveSettings();
            }),
        );
    } else if (this.plugin.settings.agentProvider === "claude") {
      containerEl.createEl("h3", { text: "Claude Code Configuration" });

      new Setting(containerEl)
        .setName("Anthropic API Key")
        .setDesc(
          "Your Anthropic API key (optional if using local claude-code-acp)",
        )
        .addText((text) =>
          text
            .setPlaceholder("sk-ant-...")
            .setValue(this.plugin.settings.anthropicApiKey)
            .onChange(async (value) => {
              this.plugin.settings.anthropicApiKey = value;
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("Claude Code Path")
        .setDesc('Path to claude-code-acp (e.g., "claude-code-acp" if in PATH)')
        .addText((text) =>
          text
            .setPlaceholder("claude-code-acp")
            .setValue(this.plugin.settings.claudeCodePath)
            .onChange(async (value) => {
              this.plugin.settings.claudeCodePath = value;
              await this.plugin.saveSettings();
            }),
        );
    } else {
      containerEl.createEl("h3", { text: "Cursor Agent Configuration" });

      new Setting(containerEl)
        .setName("Cursor Agent Path")
        .setDesc(
          'Path to Cursor CLI ACP command (e.g., "agent acp" if in PATH)',
        )
        .addText((text) =>
          text
            .setPlaceholder("agent acp")
            .setValue(this.plugin.settings.cursorAgentPath)
            .onChange(async (value) => {
              this.plugin.settings.cursorAgentPath = value;
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("Cursor Config File")
        .setDesc("Optional config file for Cursor CLI ACP (--config)")
        .addText((text) =>
          text
            .setPlaceholder("/path/to/config.json")
            .setValue(this.plugin.settings.cursorConfigPath)
            .onChange(async (value) => {
              this.plugin.settings.cursorConfigPath = value;
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("Cursor Log Level")
        .setDesc("Optional log level for Cursor CLI ACP (--log-level)")
        .addText((text) =>
          text
            .setPlaceholder("info")
            .setValue(this.plugin.settings.cursorLogLevel)
            .onChange(async (value) => {
              this.plugin.settings.cursorLogLevel = value;
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("Cursor Session Directory")
        .setDesc(
          "Optional session directory for Cursor CLI ACP (--session-dir)",
        )
        .addText((text) =>
          text
            .setPlaceholder("~/.cursor-sessions")
            .setValue(this.plugin.settings.cursorSessionDir)
            .onChange(async (value) => {
              this.plugin.settings.cursorSessionDir = value;
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("Cursor Timeout (ms)")
        .setDesc(
          "Override cursor-agent timeout in milliseconds (0 = use adapter default)",
        )
        .addText((text) =>
          text
            .setPlaceholder("30000")
            .setValue(String(this.plugin.settings.cursorTimeoutMs))
            .onChange(async (value) => {
              const next = Number.parseInt(value, 10);
              this.plugin.settings.cursorTimeoutMs = Number.isNaN(next)
                ? 0
                : Math.max(0, next);
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("Cursor Additional Args")
        .setDesc("Extra args passed to Cursor CLI ACP (space-separated)")
        .addText((text) =>
          text
            .setPlaceholder("--log-level debug")
            .setValue(this.plugin.settings.cursorAdditionalArgs)
            .onChange(async (value) => {
              this.plugin.settings.cursorAdditionalArgs = value;
              await this.plugin.saveSettings();
            }),
        );
    }

    new Setting(containerEl)
      .setName("Wiki root path")
      .setDesc(
        "Subdirectory within vault to use as wiki root (leave empty for vault root)",
      )
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(this.plugin.settings.wikiRootPath)
          .onChange(async (value) => {
            this.plugin.settings.wikiRootPath = value.trim();
            await this.plugin.saveSettings({ refreshConnection: false });
          }),
      );

    new Setting(containerEl)
      .setName("Context token budget")
      .setDesc("Maximum tokens to include from context items (approximate)")
      .addText((text) =>
        text
          .setPlaceholder("1200")
          .setValue(String(this.plugin.settings.contextTokenBudget))
          .onChange(async (value) => {
            const next = Number.parseInt(value, 10);
            if (!Number.isNaN(next) && next > 0) {
              this.plugin.settings.contextTokenBudget = next;
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("TODO sync target")
      .setDesc("Where to sync agent TODO items")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("inbox", "Agent Inbox.md")
          .addOption("current", "Current note")
          .setValue(this.plugin.settings.todoTarget)
          .onChange(async (value) => {
            this.plugin.settings.todoTarget = value as TodoTarget;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Terminal permission policy")
      .setDesc("How to approve terminal commands requested by the agent")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("prompt", "Always prompt")
          .addOption("allow-safe", "Auto-allow safe commands")
          .addOption("allow-tests", "Auto-allow safe + test/build commands")
          .addOption("allow-all", "Auto-allow all commands")
          .setValue(this.plugin.settings.terminalPolicy)
          .onChange(async (value) => {
            this.plugin.settings.terminalPolicy = value as TerminalPolicy;
            await this.plugin.saveSettings();
          });
      });

    containerEl.createEl("h3", { text: "Tag Merge" });

    new Setting(containerEl)
      .setName("Tag merge analysis prompt")
      .setDesc("Custom prompt for AI-powered tag merge analysis. Use {{TAG_LIST}} as placeholder for the tag list.")
      .addTextArea((text) => {
        text
          .setPlaceholder("Enter your custom prompt...")
          .setValue(this.plugin.settings.tagMergePrompt)
          .onChange(async (value) => {
            this.plugin.settings.tagMergePrompt = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 12;
        text.inputEl.style.width = "100%";
        text.inputEl.style.fontFamily = "monospace";
        text.inputEl.style.fontSize = "12px";
      });

    containerEl.createEl("h3", { text: "Enabled Features" });

    new Setting(containerEl)
      .setName("File Editing")
      .setDesc("Enable AI-powered file editing")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enabledFeatures.fileEditing)
          .onChange(async (value) => {
            this.plugin.settings.enabledFeatures.fileEditing = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Connection Test")
      .setDesc("Test your ACP agent connection")
      .addButton((button) => {
        button
          .setButtonText("Test Connection")
          .setCta()
          .onClick(() => this.plugin.testConnection());
      });
  }
}
