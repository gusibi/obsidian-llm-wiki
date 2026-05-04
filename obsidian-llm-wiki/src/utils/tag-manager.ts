import { TAG_KNOWLEDGE_BASE } from "../config/tag-knowledge-base";
import { TFile, TAbstractFile } from "obsidian";
import { VaultFileSystemAdapter } from "../vault-adapter";

/**
 * 标签校验结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 层级信息
 */
export interface HierarchyInfo {
  levels: string[];
  depth: number;
  topLevel: string;
  leaf: string;
  isValid: boolean;
}

/**
 * 相似标签候选
 */
export interface SimilarTagCandidate {
  tag: string;
  similarity: number; // 0-1，越高越相似
  suggestion: string;
}

/**
 * 标签统计信息
 */
export interface TagStats {
  totalTags: number;
  uniqueTags: number;
  hierarchicalTagsCount: number;
  flatTagsCount: number;
  topLevelTags: Record<string, number>;
  averageDepth: number;
  tagsPerFile: number;
}

/**
 * 标签管理器
 * 提供标签校验、规范化、查询、分析等核心功能
 */
export class TagManager {
  private vaultAdapter: VaultFileSystemAdapter;
  private allTagsCache: Map<string, number> = new Map(); // 标签 -> 使用次数
  private cacheTimestamp: number = 0;
  private CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存

  constructor(vaultAdapter: VaultFileSystemAdapter) {
    this.vaultAdapter = vaultAdapter;
  }

  /**
   * 校验标签是否符合规范
   */
  validate(tag: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const { rules, forbiddenTags } = TAG_KNOWLEDGE_BASE;

    // 基本格式检查
    if (!tag || typeof tag !== "string") {
      errors.push("标签不能为空");
      return { valid: false, errors, warnings };
    }

    // 禁用标签检查
    if (forbiddenTags.includes(tag.toLowerCase())) {
      errors.push(`标签 "${tag}" 是禁用标签`);
    }

    // 分割层级
    const levels = tag.split(rules.separator);

    // 层级深度检查
    if (levels.length > rules.maxDepth) {
      errors.push(`标签层级过深，最大允许 ${rules.maxDepth} 级，当前 ${levels.length} 级`);
    }

    // 每级格式检查
    for (const level of levels) {
      if (level.length < rules.minLength) {
        errors.push(`层级 "${level}" 过短，最小长度 ${rules.minLength}`);
      }
      if (level.length > rules.maxLength) {
        errors.push(`层级 "${level}" 过长，最大长度 ${rules.maxLength}`);
      }
      if (!rules.allowedChars.test(level)) {
        errors.push(`层级 "${level}" 格式不正确，仅允许小写字母、数字和减号`);
      }
    }

    // 警告：层级太浅
    if (levels.length === 1) {
      warnings.push(`标签 "${tag}" 是扁平格式，建议使用层级格式`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 规范化标签（处理别名、转换格式）
   */
  normalize(tag: string): string {
    let normalized = tag.toLowerCase().trim();

    // 移除开头和结尾的分隔符
    const { separator } = TAG_KNOWLEDGE_BASE.rules;
    normalized = normalized.replace(new RegExp(`^${separator}+|${separator}+$`, "g"), "");

    // 应用手动映射
    if (TAG_KNOWLEDGE_BASE.manualMappings[normalized]) {
      normalized = TAG_KNOWLEDGE_BASE.manualMappings[normalized];
    }
    // 应用学习到的映射
    else if (TAG_KNOWLEDGE_BASE.hierarchyMap[normalized]) {
      normalized = TAG_KNOWLEDGE_BASE.hierarchyMap[normalized];
    }

    // 应用合并规则
    for (const rule of TAG_KNOWLEDGE_BASE.mergeRules) {
      if (normalized === rule.from) {
        normalized = rule.to;
        break;
      }
    }

    // 转换为 kebab-case
    normalized = this.toKebabCase(normalized);

    return normalized;
  }

  /**
   * 为标签建议层级路径（基于已有的模式）
   */
  suggestHierarchy(tag: string): string[] {
    const suggestions: string[] = [];
    const normalizedTag = this.normalize(tag);

    // 如果已经是层级格式，直接返回
    if (normalizedTag.includes(TAG_KNOWLEDGE_BASE.rules.separator)) {
      return [normalizedTag];
    }

    // 从已有标签中查找相似模式
    const allTags = Array.from(this.allTagsCache.keys());
    const existingHierarchies = new Set<string>();

    for (const existingTag of allTags) {
      if (existingTag.includes(TAG_KNOWLEDGE_BASE.rules.separator)) {
        const parts = existingTag.split(TAG_KNOWLEDGE_BASE.rules.separator);
        // 收集所有前缀
        for (let i = 1; i < parts.length; i++) {
          const prefix = parts.slice(0, i).join(TAG_KNOWLEDGE_BASE.rules.separator);
          existingHierarchies.add(prefix);
        }

        // 如果现有标签的最后一级和当前标签相似，建议相同前缀
        const lastPart = parts[parts.length - 1];
        if (this.calculateSimilarity(lastPart, normalizedTag) > 0.7) {
          const suggestion = parts.slice(0, -1).join(TAG_KNOWLEDGE_BASE.rules.separator) +
            TAG_KNOWLEDGE_BASE.rules.separator + normalizedTag;
          if (!suggestions.includes(suggestion)) {
            suggestions.push(suggestion);
          }
        }
      }
    }

    // 如果没有找到相似模式，建议常用前缀
    if (suggestions.length === 0) {
      const commonPrefixes = ["ai", "engineering", "domain", "project", "research", "tool"];
      for (const prefix of commonPrefixes) {
        suggestions.push(`${prefix}/${normalizedTag}`);
      }
    }

    return suggestions.slice(0, 3); // 返回前3个建议
  }

  /**
   * 找到相似标签
   */
  findSimilar(tag: string, threshold: number = 0.6): SimilarTagCandidate[] {
    const normalized = this.normalize(tag);
    const allTags = Array.from(this.allTagsCache.keys());
    const candidates: SimilarTagCandidate[] = [];

    for (const existingTag of allTags) {
      if (existingTag === normalized) continue;

      const similarity = this.calculateSimilarity(normalized, existingTag);
      if (similarity >= threshold) {
        candidates.push({
          tag: existingTag,
          similarity,
          suggestion: similarity > 0.8 ? `建议合并到 ${existingTag}` : "可能相关",
        });
      }
    }

    return candidates.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * 获取标签的层级信息
   */
  getHierarchyInfo(tag: string): HierarchyInfo {
    const levels = tag.split(TAG_KNOWLEDGE_BASE.rules.separator);
    const validation = this.validate(tag);

    return {
      levels,
      depth: levels.length,
      topLevel: levels[0],
      leaf: levels[levels.length - 1],
      isValid: validation.valid,
    };
  }

  /**
   * 按前缀查询标签
   */
  queryByPrefix(prefix: string): string[] {
    const allTags = Array.from(this.allTagsCache.keys());
    const normalizedPrefix = prefix.toLowerCase().trim();

    return allTags.filter(tag =>
      tag.startsWith(normalizedPrefix) ||
      tag.startsWith(normalizedPrefix + TAG_KNOWLEDGE_BASE.rules.separator)
    );
  }

  /**
   * 从现有标签库中学习层级模式
   */
  async learnFromExistingTags(wikiRoot: string = "wiki"): Promise<void> {
    const allTags = new Map<string, number>();
    const mdFiles = await this.getAllMarkdownFiles(wikiRoot);

    for (const file of mdFiles) {
      const tags = await this.vaultAdapter.getFileTags(file.path);
      for (const tag of tags) {
        const normalized = this.normalize(tag);
        allTags.set(normalized, (allTags.get(normalized) || 0) + 1);
      }
    }

    this.allTagsCache = allTags;
    this.cacheTimestamp = Date.now();

    // 自动学习层级映射
    this.autoLearnHierarchyMappings();
  }

  /**
   * 自动学习层级映射
   */
  private autoLearnHierarchyMappings(): void {
    const hierarchicalTags = Array.from(this.allTagsCache.keys()).filter(tag =>
      tag.includes(TAG_KNOWLEDGE_BASE.rules.separator)
    );

    // 从已有的层级标签中学习映射
    for (const hTag of hierarchicalTags) {
      const parts = hTag.split(TAG_KNOWLEDGE_BASE.rules.separator);
      const leaf = parts[parts.length - 1];
      // 如果叶子标签还没有映射，添加映射
      if (!TAG_KNOWLEDGE_BASE.hierarchyMap[leaf] && !TAG_KNOWLEDGE_BASE.manualMappings[leaf]) {
        TAG_KNOWLEDGE_BASE.hierarchyMap[leaf] = hTag;
      }
    }
  }

  /**
   * 生成标签统计报告
   */
  async generateStats(): Promise<TagStats> {
    const allTags = Array.from(this.allTagsCache.keys());
    const hierarchicalTags = allTags.filter(tag => tag.includes(TAG_KNOWLEDGE_BASE.rules.separator));

    const topLevelTags: Record<string, number> = {};
    let totalDepth = 0;

    for (const tag of allTags) {
      const levels = tag.split(TAG_KNOWLEDGE_BASE.rules.separator);
      totalDepth += levels.length;

      if (levels.length >= 1) {
        topLevelTags[levels[0]] = (topLevelTags[levels[0]] || 0) + 1;
      }
    }

    const fileCount = await this.countMarkdownFiles("wiki");

    return {
      totalTags: Array.from(this.allTagsCache.values()).reduce((sum, count) => sum + count, 0),
      uniqueTags: allTags.length,
      hierarchicalTagsCount: hierarchicalTags.length,
      flatTagsCount: allTags.length - hierarchicalTags.length,
      topLevelTags,
      averageDepth: totalDepth / allTags.length,
      tagsPerFile: fileCount > 0 ? this.allTagsCache.size / fileCount : 0,
    };
  }

  /**
   * 获取所有标签及使用次数
   */
  getAllTags(): Map<string, number> {
    // 如果缓存过期，重新加载
    if (Date.now() - this.cacheTimestamp > this.CACHE_TTL) {
      this.learnFromExistingTags();
    }
    return new Map(this.allTagsCache);
  }

  /**
   * 合并相似标签
   */
  async mergeTags(fromTag: string, toTag: string, wikiRoot: string = "wiki"): Promise<{ updatedFiles: number }> {
    const mdFiles = await this.getAllMarkdownFiles(wikiRoot);
    let updatedFiles = 0;

    for (const file of mdFiles) {
      const tags = await this.vaultAdapter.getFileTags(file.path);
      const newTags = tags.map(tag =>
        this.normalize(tag) === this.normalize(fromTag) ? toTag : tag
      );

      // 只有发生变化时才更新
      if (JSON.stringify(tags.sort()) !== JSON.stringify(newTags.sort())) {
        await this.vaultAdapter.updateFileTags(file.path, newTags);
        updatedFiles++;
      }
    }

    // 更新缓存
    this.allTagsCache.delete(fromTag);
    this.allTagsCache.set(toTag, (this.allTagsCache.get(toTag) || 0) + (this.allTagsCache.get(fromTag) || 0));

    return { updatedFiles };
  }

  // ==================== 辅助方法 ====================

  /**
   * 转换为 kebab-case 格式
   */
  private toKebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .replace(/[\s_]+/g, "-")
      .toLowerCase();
  }

  /**
   * 计算两个字符串的相似度（Levenshtein 距离）
   */
  private calculateSimilarity(a: string, b: string): number {
    if (a.length === 0 || b.length === 0) return 0;
    if (a === b) return 1;

    const matrix = Array.from({ length: a.length + 1 }, () =>
      Array.from({ length: b.length + 1 }, (_, i) => i)
    );

    for (let i = 1; i <= a.length; i++) {
      matrix[i][0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // 删除
          matrix[i][j - 1] + 1,      // 插入
          matrix[i - 1][j - 1] + cost // 替换
        );
      }
    }

    const maxLength = Math.max(a.length, b.length);
    return 1 - matrix[a.length][b.length] / maxLength;
  }

  /**
   * 获取 wiki 目录下所有 markdown 文件
   */
  private async getAllMarkdownFiles(root: string): Promise<TFile[]> {
    const files = await this.vaultAdapter.listFiles(root);
    return files
      .filter((path: string) => path.endsWith(".md"))
      .map((path: string) => this.vaultAdapter.getAbstractFileByPath(path))
      .filter((file: TAbstractFile | null): file is TFile => file instanceof TFile);
  }

  /**
   * 统计 markdown 文件数量
   */
  private async countMarkdownFiles(root: string): Promise<number> {
    const files = await this.getAllMarkdownFiles(root);
    return files.length;
  }
}