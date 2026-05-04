import {
  App,
  ItemView,
  WorkspaceLeaf,
  Notice,
  Modal,
  TFile,
  setIcon,
} from "obsidian";
import { ACPConnection } from "./agent-connection";
import { VaultFileSystemAdapter } from "./vault-adapter";
import { TagManager, TagStats } from "./utils/tag-manager";
import { TagAuditor, GlobalTagAuditReport, AIMergeSuggestion } from "./utils/tag-auditor";
import { TagMigrator } from "./utils/tag-migrator";
import { ClaudeACPSettings } from "./settings";

export const TAG_MANAGER_VIEW_TYPE = "tag-manager-view";

interface TagNode {
  name: string;
  fullPath: string;
  count: number;
  children: Map<string, TagNode>;
  isHierarchical: boolean;
}

export class TagManagerView extends ItemView {
  private connection: ACPConnection | undefined;
  private vaultAdapter: VaultFileSystemAdapter;
  private tagManager: TagManager;
  private container!: HTMLElement;
  private settingsProvider: (() => ClaudeACPSettings) | undefined;
  private mergeSuggestions: AIMergeSuggestion[] = [];

  constructor(
    leaf: WorkspaceLeaf,
    connection?: ACPConnection,
    settingsProvider?: () => ClaudeACPSettings
  ) {
    super(leaf);
    this.connection = connection;
    this.settingsProvider = settingsProvider;
    this.vaultAdapter = new VaultFileSystemAdapter(this.app);
    this.tagManager = new TagManager(this.vaultAdapter);
  }

  getViewType(): string {
    return TAG_MANAGER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Tag Manager";
  }

  getIcon(): string {
    return "tags";
  }

  updateConnection(connection?: ACPConnection) {
    this.connection = connection;
  }

  async onOpen() {
    this.container = this.contentEl;
    this.container.empty();
    this.container.addClass("tag-manager-view");
    this.renderLoading();
    await this.loadAndRender();
  }

  async onClose() {}

  private renderLoading() {
    this.container.empty();
    const loading = this.container.createEl("div", { cls: "tag-manager-loading" });
    loading.createEl("div", { text: "Loading tags...", cls: "tag-manager-loading-text" });
  }

  private async loadAndRender() {
    try {
      await this.tagManager.learnFromExistingTags();
      const stats = this.tagManager.generateStats();
      const allTags = this.tagManager.getAllTags();
      this.render(await stats, allTags);
    } catch (error: any) {
      this.container.empty();
      this.container.createEl("div", {
        text: `Failed to load tags: ${error.message}`,
        cls: "tag-manager-error",
      });
    }
  }

  private render(stats: TagStats, allTags: Map<string, number>) {
    this.container.empty();

    // Header
    const header = this.container.createEl("div", { cls: "tag-manager-header" });
    header.createEl("h3", { text: "Tag Manager", cls: "tag-manager-title" });

    // Stats bar
    const statsBar = this.container.createEl("div", { cls: "tag-manager-stats" });
    this.renderStat(statsBar, "Total", stats.totalTags.toString());
    this.renderStat(statsBar, "Unique", stats.uniqueTags.toString());
    this.renderStat(statsBar, "Hierarchical", stats.hierarchicalTagsCount.toString());
    this.renderStat(statsBar, "Flat", stats.flatTagsCount.toString());

    // Action buttons
    const actions = this.container.createEl("div", { cls: "tag-manager-actions" });
    this.renderActionButton(actions, "refresh", "Refresh", async () => {
      this.renderLoading();
      await this.loadAndRender();
    });
    this.renderActionButton(actions, "search", "Audit All", async () => {
      await this.runGlobalAudit();
    });
    this.renderActionButton(actions, "wand-glyph", "Auto-Fix Flat", async () => {
      await this.runAutoFix();
    });
    this.renderActionButton(actions, "merge-both", "AI Merge", async () => {
      await this.runAIMergeAnalysis();
    });

    // Tag tree
    const treeContainer = this.container.createEl("div", { cls: "tag-manager-tree" });
    const root = this.buildTagTree(allTags);
    this.renderTagTree(treeContainer, root, 0);
  }

  private renderStat(parent: HTMLElement, label: string, value: string) {
    const stat = parent.createEl("div", { cls: "tag-manager-stat" });
    stat.createEl("span", { text: value, cls: "tag-manager-stat-value" });
    stat.createEl("span", { text: label, cls: "tag-manager-stat-label" });
  }

  private renderActionButton(parent: HTMLElement, icon: string, label: string, onClick: () => void) {
    const btn = parent.createEl("button", { cls: "tag-manager-action-btn" });
    setIcon(btn.createEl("span", { cls: "tag-manager-action-icon" }), icon);
    btn.createEl("span", { text: label });
    btn.onclick = onClick;
  }

  private buildTagTree(allTags: Map<string, number>): TagNode {
    const root: TagNode = {
      name: "All Tags",
      fullPath: "",
      count: 0,
      children: new Map(),
      isHierarchical: false,
    };

    const sorted = Array.from(allTags.entries()).sort((a, b) => b[1] - a[1]);

    for (const [tag, count] of sorted) {
      const parts = tag.split("/");
      let current = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const path = parts.slice(0, i + 1).join("/");

        if (!current.children.has(part)) {
          current.children.set(part, {
            name: part,
            fullPath: path,
            count: 0,
            children: new Map(),
            isHierarchical: i > 0 || parts.length > 1,
          });
        }

        const child = current.children.get(part)!;

        if (i === parts.length - 1) {
          child.count = count;
          child.isHierarchical = parts.length > 1;
        }

        current = child;
      }
    }

    return root;
  }

  private renderTagTree(parent: HTMLElement, node: TagNode, depth: number) {
    if (depth > 0) {
      const row = parent.createEl("div", { cls: "tag-tree-row" });
      row.style.paddingLeft = `${depth * 16}px`;

      // Expand/collapse arrow for nodes with children
      if (node.children.size > 0) {
        const arrow = row.createEl("span", { cls: "tag-tree-arrow" });
        setIcon(arrow, "right-triangle");
        arrow.style.cursor = "pointer";
        arrow.style.marginRight = "4px";
        arrow.style.transition = "transform 0.15s";

        const childrenContainer = parent.createEl("div", { cls: "tag-tree-children" });

        arrow.onclick = () => {
          const isCollapsed = childrenContainer.hasClass("collapsed");
          if (isCollapsed) {
            childrenContainer.removeClass("collapsed");
            arrow.style.transform = "rotate(90deg)";
          } else {
            childrenContainer.addClass("collapsed");
            arrow.style.transform = "rotate(0deg)";
          }
        };

        // Render children
        for (const child of node.children.values()) {
          this.renderTagTree(childrenContainer, child, depth + 1);
        }
      } else {
        row.createEl("span", { cls: "tag-tree-spacer", text: "  " });
      }

      // Tag name
      const nameSpan = row.createEl("span", { cls: "tag-tree-name", text: node.name });
      if (!node.isHierarchical) {
        nameSpan.addClass("tag-flat");
      }

      // Count badge
      if (node.count > 0) {
        row.createEl("span", { cls: "tag-tree-count", text: node.count.toString() });
      }

      // Actions for leaf tags
      if (node.children.size === 0 && node.count > 0) {
        const actionGroup = row.createEl("span", { cls: "tag-tree-actions" });

        // Find similar button
        const findBtn = actionGroup.createEl("span", { cls: "tag-tree-action", attr: { "aria-label": "Find similar" } });
        setIcon(findBtn, "search");
        findBtn.onclick = async (e) => {
          e.stopPropagation();
          await this.showSimilarTags(node.fullPath);
        };

        // Rename button
        const renameBtn = actionGroup.createEl("span", { cls: "tag-tree-action", attr: { "aria-label": "Rename" } });
        setIcon(renameBtn, "pencil");
        renameBtn.onclick = async (e) => {
          e.stopPropagation();
          await this.renameTag(node.fullPath);
        };

        // Files button
        const filesBtn = actionGroup.createEl("span", { cls: "tag-tree-action", attr: { "aria-label": "Show files" } });
        setIcon(filesBtn, "file-text");
        filesBtn.onclick = async (e) => {
          e.stopPropagation();
          await this.showTagFiles(node.fullPath);
        };
      }
    }

    // Root level: render top-level children
    if (depth === 0) {
      for (const child of node.children.values()) {
        this.renderTagTree(parent, child, depth + 1);
      }
    }
  }

  private async showSimilarTags(tag: string) {
    const similar = this.tagManager.findSimilar(tag, 0.5);
    if (similar.length === 0) {
      new Notice(`No similar tags found for "${tag}"`);
      return;
    }

    let message = `Tags similar to "${tag}":\n\n`;
    similar.forEach((s, i) => {
      message += `${i + 1}. ${s.tag} (${(s.similarity * 100).toFixed(0)}% similar)\n`;
    });
    message += `\nMerge option: combine these tags?`;

    const shouldMerge = await this.showConfirmDialog("Similar Tags", message);
    if (shouldMerge && similar.length > 0) {
      const target = similar[0].tag;
      const result = await this.tagManager.mergeTags(tag, target);
      new Notice(`✅ Merged "${tag}" → "${target}" in ${result.updatedFiles} files`);
      await this.loadAndRender();
    }
  }

  private async renameTag(tag: string) {
    const newName = await this.showInputDialog("Rename Tag", `Current: ${tag}\nEnter new name:`, tag);
    if (newName && newName !== tag) {
      const result = await this.tagManager.mergeTags(tag, newName);
      new Notice(`✅ Renamed "${tag}" → "${newName}" in ${result.updatedFiles} files`);
      await this.loadAndRender();
    }
  }

  private async showTagFiles(tag: string) {
    const normalized = tag.startsWith("#") ? tag : `#${tag}`;
    const files = this.app.vault.getMarkdownFiles().filter(file => {
      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache) return false;
      if (cache.tags?.some(t => t.tag === normalized)) return true;
      const fm = cache.frontmatter?.tags;
      if (Array.isArray(fm)) return fm.some(t => `#${t.replace(/^#/, "")}` === normalized);
      return false;
    });

    if (files.length === 0) {
      new Notice(`No files with tag "${tag}"`);
      return;
    }

    let message = `Files tagged "${tag}" (${files.length}):\n\n`;
    files.forEach((f, i) => {
      message += `${i + 1}. ${f.path}\n`;
    });

    this.showMessageModal(`Files: ${tag}`, message);
  }

  private async runGlobalAudit() {
    if (!this.connection || !this.connection.isConnected()) {
      new Notice("Please connect to an AI agent first");
      return;
    }

    try {
      new Notice("🔍 Running tag audit...");
      const tagAuditor = new TagAuditor(this.connection, this.tagManager, this.vaultAdapter, this.settingsProvider || (() => ({ tagMergePrompt: "" } as ClaudeACPSettings)));
      const report = await tagAuditor.auditAllTags();
      this.renderAuditReport(report);
    } catch (error: any) {
      new Notice(`❌ Audit failed: ${error.message}`);
    }
  }

  private renderAuditReport(report: GlobalTagAuditReport) {
    this.container.empty();

    // Back button
    const backBtn = this.container.createEl("button", { cls: "tag-manager-back-btn", text: "← Back to Tags" });
    backBtn.onclick = () => this.loadAndRender();

    const header = this.container.createEl("div", { cls: "tag-manager-header" });
    header.createEl("h3", { text: "Audit Report", cls: "tag-manager-title" });

    // Health score
    const scoreContainer = this.container.createEl("div", { cls: "tag-audit-score" });
    const scoreClass = report.healthScore >= 80 ? "good" : report.healthScore >= 50 ? "medium" : "bad";
    scoreContainer.createEl("div", { text: `${report.healthScore}`, cls: `tag-audit-score-value ${scoreClass}` });
    scoreContainer.createEl("div", { text: "Health Score", cls: "tag-audit-score-label" });

    // Issues list
    const issues = report.issues;
    const sections = [
      { title: "Flat Tags (non-hierarchical)", items: issues.flatTags.map(t => `${t.tag} (${t.count}x)`), icon: "layers" },
      { title: "Similar Tag Groups", items: issues.similarTags.map(g => g.group.join(" ≈ ")), icon: "copy" },
      { title: "Duplicate Tags", items: issues.duplicateTags.map(d => d.tags.join(" = ")), icon: "git-merge" },
      { title: "Rarely Used Tags", items: issues.rarelyUsedTags.map(t => `${t.tag} (${t.count}x)`), icon: "trash" },
      { title: "Overused Tags", items: issues.overusedTags.map(t => `${t.tag} (${t.count}x)`), icon: "alert-triangle" },
    ];

    for (const section of sections) {
      if (section.items.length === 0) continue;
      const sectionEl = this.container.createEl("div", { cls: "tag-audit-section" });
      const sectionHeader = sectionEl.createEl("div", { cls: "tag-audit-section-header" });
      setIcon(sectionHeader.createEl("span"), section.icon);
      sectionHeader.createEl("span", { text: `${section.title} (${section.items.length})` });

      const list = sectionEl.createEl("div", { cls: "tag-audit-list" });
      for (const item of section.items.slice(0, 20)) {
        list.createEl("div", { text: item, cls: "tag-audit-item" });
      }
      if (section.items.length > 20) {
        list.createEl("div", { text: `... and ${section.items.length - 20} more`, cls: "tag-audit-item tag-audit-more" });
      }
    }

    // Optimization suggestions
    if (report.optimizationSuggestions.length > 0) {
      const suggestionsEl = this.container.createEl("div", { cls: "tag-audit-section" });
      suggestionsEl.createEl("h4", { text: "Suggestions" });
      for (const s of report.optimizationSuggestions) {
        const item = suggestionsEl.createEl("div", { cls: "tag-audit-suggestion" });
        item.createEl("span", { text: s.description });
        const tags = item.createEl("div", { cls: "tag-audit-suggestion-meta" });
        tags.createEl("span", { text: `Impact: ${s.impact}`, cls: `tag-impact-${s.impact}` });
        tags.createEl("span", { text: `Effort: ${s.effort}`, cls: `tag-effort-${s.effort}` });
      }
    }
  }

  private async runAutoFix() {
    if (!this.connection || !this.connection.isConnected()) {
      new Notice("Please connect to an AI agent first");
      return;
    }

    const allTags = this.tagManager.getAllTags();
    const flatTags = Array.from(allTags.keys()).filter(t => !t.includes("/"));

    if (flatTags.length === 0) {
      new Notice("No flat tags to fix!");
      return;
    }

    const message = `Found ${flatTags.length} flat tags that can be converted to hierarchical format:\n\n${flatTags.slice(0, 10).map(t => `• ${t}`).join("\n")}${flatTags.length > 10 ? `\n... and ${flatTags.length - 10} more` : ""}\n\nConvert these tags?`;
    const shouldProceed = await this.showConfirmDialog("Auto-Fix Flat Tags", message);

    if (!shouldProceed) return;

    try {
      new Notice("🔄 Converting tags...");
      const tagAuditor = new TagAuditor(this.connection, this.tagManager, this.vaultAdapter, this.settingsProvider || (() => ({ tagMergePrompt: "" } as ClaudeACPSettings)));
      const migrator = new TagMigrator(this.tagManager, tagAuditor, this.vaultAdapter);
      const result = await migrator.migrate();

      if (result.success) {
        new Notice(`✅ Converted ${result.stats.convertedToHierarchical} tags in ${result.updatedFiles} files`);
      } else {
        new Notice(`❌ Migration had ${result.errors.length} errors`);
      }
      await this.loadAndRender();
    } catch (error: any) {
      new Notice(`❌ Auto-fix failed: ${error.message}`);
    }
  }

  private async runAIMergeAnalysis() {
    if (!this.connection || !this.connection.isConnected()) {
      new Notice("Please connect to an AI agent first");
      return;
    }

    if (!this.settingsProvider) {
      new Notice("Tag merge settings not configured");
      return;
    }

    try {
      this.renderLoading();

      new Notice("🔍 AI analyzing tag similarity...");
      const allTags = this.tagManager.getAllTags();
      const tagAuditor = new TagAuditor(
        this.connection, this.tagManager, this.vaultAdapter, this.settingsProvider
      );

      this.mergeSuggestions = await tagAuditor.analyzeMergeCandidatesWithAI(allTags);

      if (this.mergeSuggestions.length === 0) {
        new Notice("No similar tags found by AI analysis");
        await this.loadAndRender();
        return;
      }

      this.renderMergeSuggestions();
    } catch (error: any) {
      new Notice(`❌ AI merge analysis failed: ${error.message}`);
      await this.loadAndRender();
    }
  }

  private renderMergeSuggestions() {
    this.container.empty();
    this.container.addClass("tag-manager-view");

    const header = this.container.createEl("div", { cls: "tag-manager-header" });
    header.createEl("h2", { text: "AI Merge Suggestions", cls: "tag-manager-title" });

    const backBtn = this.container.createEl("button", { cls: "tag-manager-back-btn", text: "← Back" });
    backBtn.onclick = async () => {
      await this.loadAndRender();
    };

    const countEl = this.container.createEl("div", {
      cls: "tag-merge-count",
      text: `${this.mergeSuggestions.length} merge suggestion(s) found`
    });

    const batchBtn = this.container.createEl("button", {
      cls: "tag-merge-batch-btn mod-cta",
      text: "Apply All High Confidence"
    });
    batchBtn.onclick = async () => {
      await this.applyBatchMerge("high");
    };

    const list = this.container.createEl("div", { cls: "tag-merge-list" });

    for (let i = 0; i < this.mergeSuggestions.length; i++) {
      const suggestion = this.mergeSuggestions[i];
      const card = list.createEl("div", { cls: "tag-merge-suggestion" });

      const confClass = `tag-merge-confidence-${suggestion.confidence}`;
      const confBadge = card.createEl("span", {
        cls: `tag-merge-confidence ${confClass}`,
        text: suggestion.confidence
      });

      const fromEl = card.createEl("div", { cls: "tag-merge-from" });
      fromEl.createEl("span", { text: "From: " });
      for (const tag of suggestion.from) {
        fromEl.createEl("code", { text: tag });
        fromEl.createEl("span", { text: " " });
      }

      const arrow = card.createEl("div", { cls: "tag-merge-arrow", text: "→" });

      const toEl = card.createEl("div", { cls: "tag-merge-to" });
      toEl.createEl("span", { text: "To: " });
      toEl.createEl("code", { text: suggestion.to });

      const reasonEl = card.createEl("div", { cls: "tag-merge-reason", text: suggestion.reason });

      const actions = card.createEl("div", { cls: "tag-merge-actions" });
      const applyBtn = actions.createEl("button", { text: "Apply", cls: "mod-cta" });
      applyBtn.onclick = async () => {
        await this.applySingleMerge(i);
      };

      const skipBtn = actions.createEl("button", { text: "Skip" });
      skipBtn.onclick = () => {
        this.mergeSuggestions.splice(i, 1);
        this.renderMergeSuggestions();
      };
    }
  }

  private async applySingleMerge(index: number) {
    const suggestion = this.mergeSuggestions[index];
    if (!this.connection) return;

    try {
      new Notice(`Merging tags → ${suggestion.to}...`);
      const tagAuditor = new TagAuditor(
        this.connection, this.tagManager, this.vaultAdapter,
        this.settingsProvider || (() => ({ tagMergePrompt: "" } as ClaudeACPSettings))
      );

      const candidates = suggestion.from.map(from => ({ from, to: suggestion.to, reason: suggestion.reason }));
      const result = await tagAuditor.mergeSimilarTags(candidates);

      if (result.success) {
        new Notice(`✅ Merged ${result.mergedCount} tags in ${result.updatedFiles} files`);
      } else {
        new Notice(`⚠️ Merge completed with ${result.errors.length} errors`);
      }

      this.mergeSuggestions.splice(index, 1);

      if (this.mergeSuggestions.length === 0) {
        await this.loadAndRender();
      } else {
        this.renderMergeSuggestions();
      }
    } catch (error: any) {
      new Notice(`❌ Merge failed: ${error.message}`);
    }
  }

  private async applyBatchMerge(minConfidence: "high" | "medium" | "low") {
    if (!this.connection) return;

    const confidenceOrder = { high: 0, medium: 1, low: 2 };
    const minIdx = confidenceOrder[minConfidence];

    const toApply = this.mergeSuggestions.filter(
      s => confidenceOrder[s.confidence] <= minIdx
    );

    if (toApply.length === 0) {
      new Notice("No matching suggestions to apply");
      return;
    }

    const message = `Apply ${toApply.length} merge suggestion(s) with ${minConfidence}+ confidence?`;
    const shouldProceed = await this.showConfirmDialog("Batch Merge", message);
    if (!shouldProceed) return;

    try {
      new Notice(`Applying ${toApply.length} merges...`);
      const tagAuditor = new TagAuditor(
        this.connection, this.tagManager, this.vaultAdapter,
        this.settingsProvider || (() => ({ tagMergePrompt: "" } as ClaudeACPSettings))
      );

      const candidates = toApply.flatMap(s =>
        s.from.map(from => ({ from, to: s.to, reason: s.reason }))
      );
      const result = await tagAuditor.mergeSimilarTags(candidates);

      if (result.success) {
        new Notice(`✅ Merged ${result.mergedCount} tags in ${result.updatedFiles} files`);
      } else {
        new Notice(`⚠️ Batch merge completed with ${result.errors.length} errors`);
      }

      this.mergeSuggestions = this.mergeSuggestions.filter(
        s => confidenceOrder[s.confidence] > minIdx
      );

      if (this.mergeSuggestions.length === 0) {
        await this.loadAndRender();
      } else {
        this.renderMergeSuggestions();
      }
    } catch (error: any) {
      new Notice(`❌ Batch merge failed: ${error.message}`);
    }
  }

  private showConfirmDialog(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new Modal(this.app);
      modal.setTitle(title);

      const content = modal.contentEl.createEl("div");
      content.style.whiteSpace = "pre-wrap";
      content.style.maxHeight = "400px";
      content.style.overflowY = "auto";
      content.createEl("p", { text: message });

      const buttonContainer = content.createEl("div", { cls: "dialog-buttons" });

      const okButton = buttonContainer.createEl("button", { text: "Yes", cls: "mod-cta" });
      okButton.onclick = () => { resolve(true); modal.close(); };

      const cancelButton = buttonContainer.createEl("button", { text: "No" });
      cancelButton.onclick = () => { resolve(false); modal.close(); };

      modal.open();
    });
  }

  private showInputDialog(title: string, message: string, defaultValue: string): Promise<string> {
    return new Promise((resolve) => {
      const modal = new Modal(this.app);
      modal.setTitle(title);

      const content = modal.contentEl.createEl("div");
      content.createEl("p", { text: message });

      const input = content.createEl("input", { type: "text", value: defaultValue });
      input.style.width = "100%";
      input.style.marginBottom = "12px";
      input.select();

      const buttonContainer = content.createEl("div", { cls: "dialog-buttons" });

      const okButton = buttonContainer.createEl("button", { text: "Rename", cls: "mod-cta" });
      okButton.onclick = () => { resolve(input.value); modal.close(); };

      const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
      cancelButton.onclick = () => { resolve(""); modal.close(); };

      input.onkeydown = (e: KeyboardEvent) => {
        if (e.key === "Enter") { resolve(input.value); modal.close(); }
        if (e.key === "Escape") { resolve(""); modal.close(); }
      };

      modal.open();
    });
  }

  private showMessageModal(title: string, message: string) {
    const modal = new Modal(this.app);
    modal.setTitle(title);

    const content = modal.contentEl.createEl("div");
    content.style.whiteSpace = "pre-wrap";
    content.style.fontFamily = "monospace";
    content.style.fontSize = "13px";
    content.style.maxHeight = "400px";
    content.style.overflowY = "auto";
    content.textContent = message;

    const closeButton = content.createEl("button", { text: "Close", cls: "mod-cta", attr: { style: "margin-top: 12px;" } });
    closeButton.onclick = () => modal.close();

    modal.open();
  }
}
