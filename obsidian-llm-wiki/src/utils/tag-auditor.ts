import { ACPConnection } from "../agent-connection";
import { TagManager, ValidationResult } from "./tag-manager";
import { VaultFileSystemAdapter } from "../vault-adapter";
import { TAG_KNOWLEDGE_BASE } from "../config/tag-knowledge-base";
import { ClaudeACPSettings } from "../settings";

/**
 * 单文件标签审计结果
 */
export interface TagAuditResult {
  file: string;
  currentTags: string[];
  issues: Array<{
    type: "error" | "warning" | "suggestion";
    tag: string;
    message: string;
    fix?: string;
  }>;
  overallScore: number; // 0-100，越高越健康
  suggestions: string[]; // 优化建议
}

/**
 * 全局标签审计报告
 */
export interface GlobalTagAuditReport {
  totalFiles: number;
  totalTags: number;
  uniqueTags: number;
  healthScore: number; // 整体健康度 0-100
  issues: {
    duplicateTags: Array<{ tags: string[]; count: number }>;
    similarTags: Array<{ group: string[]; similarity: number }>;
    flatTags: Array<{ tag: string; count: number }>;
    inconsistentTags: Array<{ tag: string; pattern: string }>;
    rarelyUsedTags: Array<{ tag: string; count: number }>;
    overusedTags: Array<{ tag: string; count: number }>;
  };
  optimizationSuggestions: Array<{
    type: "merge" | "rename" | "restructure" | "remove";
    description: string;
    impact: "low" | "medium" | "high";
    effort: "low" | "medium" | "high";
  }>;
}

/**
 * 标签优化结果
 */
export interface TagOptimizationResult {
  originalTags: string[];
  optimizedTags: string[];
  changes: Array<{
    type: "add" | "remove" | "rename" | "restructure" | "merge";
    from?: string;
    to?: string;
    reason: string;
  }>;
  scoreImprovement: number;
  needsReview: boolean;
}

/**
 * 合并候选
 */
export interface MergeCandidate {
  from: string;
  to: string;
  reason: string;
}

/**
 * 合并结果
 */
export interface MergeResult {
  success: boolean;
  mergedCount: number;
  updatedFiles: number;
  errors: string[];
}

/**
 * AI 驱动的合并建议
 */
export interface AIMergeSuggestion {
  from: string[];
  to: string;
  reason: string;
  confidence: "high" | "medium" | "low";
}

/**
 * AI 标签审计器
 * 提供智能标签审计、分析和优化功能
 */
export class TagAuditor {
  private connection: ACPConnection;
  private tagManager: TagManager;
  private vaultAdapter: VaultFileSystemAdapter;
  private settingsProvider: () => ClaudeACPSettings;

  constructor(
    connection: ACPConnection,
    tagManager: TagManager,
    vaultAdapter: VaultFileSystemAdapter,
    settingsProvider: () => ClaudeACPSettings
  ) {
    this.connection = connection;
    this.tagManager = tagManager;
    this.vaultAdapter = vaultAdapter;
    this.settingsProvider = settingsProvider;
  }

  /**
   * 审计单个文件的标签
   */
  async auditFileTags(
    filePath: string,
    fileContent?: string,
    currentTags?: string[]
  ): Promise<TagAuditResult> {
    // 如果没有提供标签，从文件读取
    if (!currentTags) {
      currentTags = await this.vaultAdapter.getFileTags(filePath);
    }

    // 确保 currentTags 是数组
    currentTags = currentTags || [];

    // 如果没有提供内容，从文件读取
    if (!fileContent) {
      fileContent = await this.vaultAdapter.readFile(filePath);
    }

    const issues: TagAuditResult["issues"] = [];
    const suggestions: string[] = [];
    let totalScore = 100;

    // 1. 基础格式校验
    for (const tag of currentTags) {
      const validation = this.tagManager.validate(tag);
      if (!validation.valid) {
        for (const error of validation.errors) {
          issues.push({
            type: "error",
            tag,
            message: error,
            fix: this.tagManager.normalize(tag),
          });
          totalScore -= 10;
        }
      }
      for (const warning of validation.warnings) {
        issues.push({
          type: "warning",
          tag,
          message: warning,
          fix: this.tagManager.suggestHierarchy(tag)[0],
        });
        totalScore -= 5;
      }
    }

    // 2. 标签数量检查
    if (currentTags.length < TAG_KNOWLEDGE_BASE.rules.minTagsPerFile) {
      issues.push({
        type: "warning",
        tag: "",
        message: `标签数量过少，建议至少 ${TAG_KNOWLEDGE_BASE.rules.minTagsPerFile} 个标签`,
      });
      totalScore -= 10;
      suggestions.push("建议添加更多相关标签");
    } else if (currentTags.length > TAG_KNOWLEDGE_BASE.rules.maxTagsPerFile) {
      issues.push({
        type: "warning",
        tag: "",
        message: `标签数量过多，建议最多 ${TAG_KNOWLEDGE_BASE.rules.maxTagsPerFile} 个标签`,
      });
      totalScore -= 10;
      suggestions.push("建议移除不相关的标签");
    }

    // 3. 相似标签检查
    const normalizedTags = currentTags.map(tag => this.tagManager.normalize(tag));
    for (let i = 0; i < normalizedTags.length; i++) {
      for (let j = i + 1; j < normalizedTags.length; j++) {
        const similarity = this.calculateSimilarity(normalizedTags[i], normalizedTags[j]);
        if (similarity > 0.7) {
          issues.push({
            type: "warning",
            tag: currentTags[i],
            message: `与标签 "${currentTags[j]}" 含义相似`,
            fix: `建议合并为一个更通用的标签`,
          });
          totalScore -= 5;
        }
      }
    }

    // 4. AI 智能分析相关性和合理性
    try {
      const aiAnalysis = await this.analyzeTagsWithAI(filePath, fileContent, currentTags);
      issues.push(...aiAnalysis.issues);
      suggestions.push(...aiAnalysis.suggestions);
      totalScore += aiAnalysis.scoreAdjustment;
    } catch (error) {
      console.warn("AI 标签分析失败:", error);
    }

    // 确保分数在 0-100 之间
    totalScore = Math.max(0, Math.min(100, totalScore));

    return {
      file: filePath,
      currentTags,
      issues,
      overallScore: totalScore,
      suggestions,
    };
  }

  /**
   * 审计所有 wiki 文件的标签
   */
  async auditAllTags(wikiRoot: string = "wiki"): Promise<GlobalTagAuditReport> {
    const allTags = this.tagManager.getAllTags();
    const allFiles = await this.vaultAdapter.listFiles(wikiRoot);
    const mdFiles = allFiles.filter((path: string) => path.endsWith(".md"));

    const report: GlobalTagAuditReport = {
      totalFiles: mdFiles.length,
      totalTags: Array.from(allTags.values()).reduce((sum, count) => sum + count, 0),
      uniqueTags: allTags.size,
      healthScore: 100,
      issues: {
        duplicateTags: [],
        similarTags: [],
        flatTags: [],
        inconsistentTags: [],
        rarelyUsedTags: [],
        overusedTags: [],
      },
      optimizationSuggestions: [],
    };

    // 分析扁平标签
    const flatTags: Record<string, number> = {};
    for (const [tag, count] of allTags.entries()) {
      if (!tag.includes(TAG_KNOWLEDGE_BASE.rules.separator)) {
        flatTags[tag] = count;
      }
    }
    report.issues.flatTags = Object.entries(flatTags)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);

    // 分析标签使用频率
    const tagCounts = Array.from(allTags.entries());
    const avgCount = report.totalTags / report.uniqueTags;

    report.issues.rarelyUsedTags = tagCounts
      .filter(([_, count]) => count < Math.max(1, avgCount * 0.3))
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => a.count - b.count);

    report.issues.overusedTags = tagCounts
      .filter(([_, count]) => count > avgCount * 3)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);

    // 分析相似标签组
    const similarGroups = this.findSimilarTagGroups(Array.from(allTags.keys()));
    report.issues.similarTags = similarGroups
      .map(group => ({
        group: group.tags,
        similarity: group.averageSimilarity,
      }))
      .filter(group => group.similarity > 0.6)
      .sort((a, b) => b.similarity - a.similarity);

    // 计算健康分数
    const flatRatio = report.issues.flatTags.length / report.uniqueTags;
    const similarRatio = report.issues.similarTags.length / report.uniqueTags;
    const rareRatio = report.issues.rarelyUsedTags.length / report.uniqueTags;

    report.healthScore = 100 -
      (flatRatio * 30) - // 扁平标签最多扣 30 分
      (similarRatio * 30) - // 相似标签最多扣 30 分
      (rareRatio * 20) - // 低使用标签最多扣 20 分
      (report.issues.overusedTags.length * 2); // 每个过度使用标签扣 2 分

    report.healthScore = Math.max(0, Math.min(100, Math.round(report.healthScore)));

    // 生成优化建议
    report.optimizationSuggestions = this.generateOptimizationSuggestions(report);

    return report;
  }

  /**
   * 自动优化标签
   */
  async autoOptimizeTags(
    tags: string[],
    auditResult?: TagAuditResult
  ): Promise<TagOptimizationResult> {
    // 如果没有提供审计结果，先审计
    if (!auditResult) {
      // 这里需要文件路径和内容，暂时只做基础优化
      auditResult = {
        file: "",
        currentTags: tags,
        issues: [],
        overallScore: 0,
        suggestions: [],
      };
    }

    const changes: TagOptimizationResult["changes"] = [];
    let optimizedTags = [...tags];
    const originalScore = auditResult.overallScore;

    // 1. 规范化所有标签
    for (let i = 0; i < optimizedTags.length; i++) {
      const original = optimizedTags[i];
      const normalized = this.tagManager.normalize(original);
      if (original !== normalized) {
        optimizedTags[i] = normalized;
        changes.push({
          type: "rename",
          from: original,
          to: normalized,
          reason: "标签格式规范化",
        });
      }
    }

    // 2. 转换扁平标签为层级格式
    for (let i = 0; i < optimizedTags.length; i++) {
      const tag = optimizedTags[i];
      if (!tag.includes(TAG_KNOWLEDGE_BASE.rules.separator)) {
        const suggestions = this.tagManager.suggestHierarchy(tag);
        if (suggestions.length > 0) {
          optimizedTags[i] = suggestions[0];
          changes.push({
            type: "restructure",
            from: tag,
            to: suggestions[0],
            reason: "扁平标签转换为层级格式",
          });
        }
      }
    }

    // 3. 去重
    const uniqueTags = Array.from(new Set(optimizedTags));
    if (uniqueTags.length !== optimizedTags.length) {
      const removed = optimizedTags.filter((tag, index) => optimizedTags.indexOf(tag) !== index);
      for (const tag of removed) {
        changes.push({
          type: "remove",
          from: tag,
          reason: "重复标签",
        });
      }
      optimizedTags = uniqueTags;
    }

    // 4. 合并相似标签
    const mergedTags = new Set<string>();
    const toRemove = new Set<string>();

    for (let i = 0; i < optimizedTags.length; i++) {
      if (toRemove.has(optimizedTags[i])) continue;

      const similar = this.tagManager.findSimilar(optimizedTags[i], 0.8);
      if (similar.length > 0) {
        // 选择使用次数最多的标签作为主标签
        const allTags = this.tagManager.getAllTags();
        const mainTag = [optimizedTags[i], ...similar.map(s => s.tag)]
          .sort((a, b) => (allTags.get(b) || 0) - (allTags.get(a) || 0))[0];

        mergedTags.add(mainTag);
        for (const s of similar) {
          if (s.tag !== mainTag && optimizedTags.includes(s.tag)) {
            toRemove.add(s.tag);
            changes.push({
              type: "merge",
              from: s.tag,
              to: mainTag,
              reason: `与 "${mainTag}" 含义相似`,
            });
          }
        }
      } else {
        mergedTags.add(optimizedTags[i]);
      }
    }

    optimizedTags = Array.from(mergedTags);

    // 5. 调整标签数量
    if (optimizedTags.length > TAG_KNOWLEDGE_BASE.rules.maxTagsPerFile) {
      // 保留最相关的标签（这里简单保留前 N 个，实际可以用 AI 分析相关性）
      const removed = optimizedTags.splice(TAG_KNOWLEDGE_BASE.rules.maxTagsPerFile);
      for (const tag of removed) {
        changes.push({
          type: "remove",
          from: tag,
          reason: "标签数量过多，移除相关性较低的标签",
        });
      }
    }

    // 计算分数提升
    const newScore = originalScore + changes.length * 5; // 每个改进加 5 分
    const scoreImprovement = Math.max(0, newScore - originalScore);

    return {
      originalTags: tags,
      optimizedTags,
      changes,
      scoreImprovement,
      needsReview: changes.some(c => c.type === "remove" || c.type === "merge"),
    };
  }

  /**
   * 批量合并相似标签
   */
  async mergeSimilarTags(
    candidates: MergeCandidate[],
    wikiRoot: string = "wiki"
  ): Promise<MergeResult> {
    const result: MergeResult = {
      success: true,
      mergedCount: 0,
      updatedFiles: 0,
      errors: [],
    };

    for (const candidate of candidates) {
      try {
        const mergeResult = await this.tagManager.mergeTags(candidate.from, candidate.to, wikiRoot);
        result.mergedCount++;
        result.updatedFiles += mergeResult.updatedFiles;
      } catch (error) {
        result.success = false;
        result.errors.push(`合并 "${candidate.from}" 到 "${candidate.to}" 失败: ${error}`);
      }
    }

    return result;
  }

  // ==================== 辅助方法 ====================

  /**
   * 使用 AI 分析标签相关性和合理性
   */
  private async analyzeTagsWithAI(
    filePath: string,
    fileContent: string,
    tags: string[]
  ): Promise<{
    issues: TagAuditResult["issues"];
    suggestions: string[];
    scoreAdjustment: number;
  }> {
    const prompt = `
请分析以下文件的标签是否合理：

文件路径：${filePath}
文件内容：${fileContent.slice(0, 2000)}...（内容过长已截断）
当前标签：${JSON.stringify(tags)}

请从以下方面分析：
1. 标签是否与内容相关？如果有不相关的标签，请指出
2. 是否缺少重要的相关标签？请建议
3. 标签粒度是否合适？是否有过于宽泛或过于具体的标签？
4. 标签层级是否合理？

请以 JSON 格式返回结果：
{
  "issues": [
    {
      "type": "error" | "warning" | "suggestion",
      "tag": "问题标签",
      "message": "问题描述",
      "fix": "修复建议"
    }
  ],
  "suggestions": ["优化建议列表"],
  "scoreAdjustment": 分数调整（正数加分，负数扣分）
}
`;

    try {
      // 调用 AI 分析
      const result = await this.connection.sendChatMessage(prompt);
      const parsed = JSON.parse(result);
      return parsed;
    } catch (error) {
      console.warn("AI 分析失败:", error);
      return {
        issues: [],
        suggestions: [],
        scoreAdjustment: 0,
      };
    }
  }

  /**
   * 使用 AI 分析标签合并候选（独立 session，不影响 chat 历史）
   */
  async analyzeMergeCandidatesWithAI(
    allTags: Map<string, number>,
    customPrompt?: string
  ): Promise<AIMergeSuggestion[]> {
    const settings = this.settingsProvider();
    const promptTemplate = customPrompt || settings.tagMergePrompt;

    // 格式化标签列表
    const tagList = Array.from(allTags.entries())
      .map(([tag, count]) => `${tag} (使用${count}次)`)
      .join("\n");

    const prompt = promptTemplate.replace("{{TAG_LIST}}", tagList);

    // 保存当前 session
    const anyConn = this.connection as any;
    const originalSessionId = anyConn.currentSessionId || null;

    try {
      // 创建独立 session 做合并分析
      if (this.connection.loadSession && originalSessionId) {
        await this.connection.createSession();
      }

      const result = await this.connection.sendChatMessage(
        prompt + "\n\n请只返回 JSON 数组，不要包含其他文字或 markdown 格式标记。"
      );

      // 恢复原 session
      if (this.connection.loadSession && originalSessionId) {
        await this.connection.loadSession(originalSessionId);
      }

      // 解析 AI 响应
      let cleaned = result.replace(/```json|```/g, "").trim();
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.warn("AI 合并分析返回格式不正确:", result);
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) return [];

      return parsed.filter(
        (s: any) =>
          Array.isArray(s.from) &&
          typeof s.to === "string" &&
          typeof s.reason === "string"
      ) as AIMergeSuggestion[];
    } catch (error) {
      // 确保恢复 session
      if (this.connection.loadSession && originalSessionId) {
        try { await this.connection.loadSession(originalSessionId); } catch {}
      }
      console.warn("AI 合并分析失败:", error);
      return [];
    }
  }

  /**
   * 查找相似标签组
   */
  private findSimilarTagGroups(tags: string[]): Array<{
    tags: string[];
    averageSimilarity: number;
  }> {
    const groups: Array<{ tags: string[]; averageSimilarity: number }> = [];
    const visited = new Set<string>();

    for (const tag of tags) {
      if (visited.has(tag)) continue;

      const group: string[] = [tag];
      let totalSimilarity = 0;
      let count = 0;

      for (const otherTag of tags) {
        if (tag === otherTag || visited.has(otherTag)) continue;

        const similarity = this.calculateSimilarity(tag, otherTag);
        if (similarity > 0.6) {
          group.push(otherTag);
          totalSimilarity += similarity;
          count++;
        }
      }

      if (group.length >= 2) {
        groups.push({
          tags: group,
          averageSimilarity: count > 0 ? totalSimilarity / count : 0,
        });
        group.forEach(t => visited.add(t));
      }
    }

    return groups;
  }

  /**
   * 生成全局优化建议
   */
  private generateOptimizationSuggestions(
    report: GlobalTagAuditReport
  ): GlobalTagAuditReport["optimizationSuggestions"] {
    const suggestions: GlobalTagAuditReport["optimizationSuggestions"] = [];

    // 扁平标签优化建议
    if (report.issues.flatTags.length > 0) {
      suggestions.push({
        type: "restructure",
        description: `有 ${report.issues.flatTags.length} 个扁平标签，建议转换为层级格式`,
        impact: "medium",
        effort: "medium",
      });
    }

    // 相似标签合并建议
    if (report.issues.similarTags.length > 0) {
      suggestions.push({
        type: "merge",
        description: `有 ${report.issues.similarTags.length} 组相似标签，建议合并`,
        impact: "high",
        effort: "medium",
      });
    }

    // 低使用标签清理建议
    if (report.issues.rarelyUsedTags.length > 0) {
      suggestions.push({
        type: "remove",
        description: `有 ${report.issues.rarelyUsedTags.length} 个极少使用的标签，建议清理或合并`,
        impact: "low",
        effort: "low",
      });
    }

    // 过度使用标签拆分建议
    if (report.issues.overusedTags.length > 0) {
      suggestions.push({
        type: "restructure",
        description: `有 ${report.issues.overusedTags.length} 个标签使用过于频繁，建议拆分为更细的层级`,
        impact: "high",
        effort: "high",
      });
    }

    return suggestions;
  }

  /**
   * 计算字符串相似度
   */
  private calculateSimilarity(a: string, b: string): number {
    // 简单的相似度计算，实际可以用更复杂的算法
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.7;

    // 计算共同字符比例
    const setA = new Set(a.split(''));
    const setB = new Set(b.split(''));
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    return intersection.size / Math.max(setA.size, setB.size);
  }
}