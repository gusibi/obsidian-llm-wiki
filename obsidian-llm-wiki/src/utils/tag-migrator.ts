import { TagManager } from "./tag-manager";
import { TagAuditor } from "./tag-auditor";
import { VaultFileSystemAdapter } from "../vault-adapter";
import { TAG_KNOWLEDGE_BASE } from "../config/tag-knowledge-base";

/**
 * 迁移结果
 */
export interface MigrationResult {
  success: boolean;
  totalFiles: number;
  processedFiles: number;
  updatedFiles: number;
  errors: Array<{ file: string; error: string }>;
  stats: {
    originalFlatTags: number;
    convertedToHierarchical: number;
    mergedTags: number;
    renamedTags: number;
  };
}

/**
 * 迁移报告
 */
export interface MigrationReport {
  summary: string;
  updatedFiles: number;
  changes: Array<{
    file: string;
    originalTags: string[];
    newTags: string[];
    changes: Array<{ type: string; from?: string; to?: string; reason: string }>;
  }>;
  stats: MigrationResult["stats"];
  recommendations: string[];
}

/**
 * 迁移选项
 */
export interface MigrationOptions {
  dryRun?: boolean; // 试运行，不实际修改文件
  autoConvertFlatTags?: boolean; // 自动转换扁平标签为层级格式
  autoMergeSimilarTags?: boolean; // 自动合并相似标签
  normalizeTags?: boolean; // 规范化标签格式
  filter?: (filePath: string) => boolean; // 过滤要处理的文件
  confirmChanges?: boolean; // 确认每个变更
}

/**
 * 标签迁移工具
 * 用于将现有扁平标签批量转换为层级格式
 */
export class TagMigrator {
  private tagManager: TagManager;
  private tagAuditor: TagAuditor;
  private vaultAdapter: VaultFileSystemAdapter;

  constructor(
    tagManager: TagManager,
    tagAuditor: TagAuditor,
    vaultAdapter: VaultFileSystemAdapter
  ) {
    this.tagManager = tagManager;
    this.tagAuditor = tagAuditor;
    this.vaultAdapter = vaultAdapter;
  }

  /**
   * 执行标签迁移
   */
  async migrate(
    wikiRoot: string = "wiki",
    options: MigrationOptions = {}
  ): Promise<MigrationResult> {
    const defaultOptions: MigrationOptions = {
      dryRun: false,
      autoConvertFlatTags: true,
      autoMergeSimilarTags: true,
      normalizeTags: true,
      confirmChanges: false,
    };

    const opts = { ...defaultOptions, ...options };
    const allFiles = await this.vaultAdapter.listFiles(wikiRoot);
    const mdFiles = allFiles.filter((path: string) => path.endsWith(".md"));

    const result: MigrationResult = {
      success: true,
      totalFiles: mdFiles.length,
      processedFiles: 0,
      updatedFiles: 0,
      errors: [],
      stats: {
        originalFlatTags: 0,
        convertedToHierarchical: 0,
        mergedTags: 0,
        renamedTags: 0,
      },
    };

    // 先学习现有标签模式
    await this.tagManager.learnFromExistingTags(wikiRoot);

    // 如果是自动合并相似标签，先全局分析
    if (opts.autoMergeSimilarTags) {
      const auditReport = await this.tagAuditor.auditAllTags(wikiRoot);
      const mergeCandidates = auditReport.issues.similarTags
        .filter(group => group.similarity > 0.7)
        .map(group => ({
          from: group.group[0],
          to: group.group[1],
          reason: `相似标签合并，相似度 ${group.similarity.toFixed(2)}`,
        }));

      if (!opts.dryRun && mergeCandidates.length > 0) {
        const mergeResult = await this.tagAuditor.mergeSimilarTags(mergeCandidates, wikiRoot);
        result.stats.mergedTags += mergeResult.mergedCount;
        result.updatedFiles += mergeResult.updatedFiles;
      }
    }

    // 处理每个文件
    for (const filePath of mdFiles) {
      try {
        // 应用过滤器
        if (opts.filter && !opts.filter(filePath)) {
          continue;
        }

        const originalTags = await this.vaultAdapter.getFileTags(filePath);
        let newTags = [...originalTags];

        // 统计原始扁平标签数量
        const originalFlatCount = originalTags.filter((tag: string) =>
          !tag.includes(TAG_KNOWLEDGE_BASE.rules.separator)
        ).length;
        result.stats.originalFlatTags += originalFlatCount;

        // 1. 规范化标签
        if (opts.normalizeTags) {
          const normalizedTags = newTags.map(tag => {
            const normalized = this.tagManager.normalize(tag);
            if (normalized !== tag) {
              result.stats.renamedTags++;
            }
            return normalized;
          });
          newTags = Array.from(new Set(normalizedTags));
        }

        // 2. 转换扁平标签为层级格式
        if (opts.autoConvertFlatTags) {
          const convertedTags = newTags.map(tag => {
            if (!tag.includes(TAG_KNOWLEDGE_BASE.rules.separator)) {
              const suggestions = this.tagManager.suggestHierarchy(tag);
              if (suggestions.length > 0) {
                result.stats.convertedToHierarchical++;
                return suggestions[0];
              }
            }
            return tag;
          });
          newTags = Array.from(new Set(convertedTags));
        }

        // 3. 自动优化
        const optimizationResult = await this.tagAuditor.autoOptimizeTags(newTags);
        newTags = optimizationResult.optimizedTags;
        result.stats.mergedTags += optimizationResult.changes.filter(c => c.type === "merge").length;

        // 如果有变化，更新文件
        if (JSON.stringify(originalTags.sort()) !== JSON.stringify(newTags.sort())) {
          if (!opts.dryRun) {
            await this.vaultAdapter.updateFileTags(filePath, newTags);
          }
          result.updatedFiles++;
        }

        result.processedFiles++;
      } catch (error) {
        result.success = false;
        result.errors.push({
          file: filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  /**
   * 生成迁移预览报告
   */
  async generatePreviewReport(wikiRoot: string = "wiki"): Promise<MigrationReport> {
    const result = await this.migrate(wikiRoot, { dryRun: true });
    const report: MigrationReport = {
      summary: this.generateSummary(result),
      updatedFiles: result.updatedFiles,
      changes: [],
      stats: result.stats,
      recommendations: this.generateRecommendations(result),
    };

    return report;
  }

  /**
   * 导出迁移报告到文件
   */
  async exportReport(report: MigrationReport, outputPath: string): Promise<void> {
    const content = `# 标签迁移报告

## 摘要
${report.summary}

## 统计信息
- 总文件数：${report.stats.originalFlatTags + report.stats.convertedToHierarchical}
- 转换的扁平标签：${report.stats.convertedToHierarchical}
- 合并的标签：${report.stats.mergedTags}
- 重命名的标签：${report.stats.renamedTags}

## 建议
${report.recommendations.map(r => `- ${r}`).join("\n")}
`;

    await this.vaultAdapter.writeFile(outputPath, content);
  }

  /**
   * 回滚最近的迁移（基于 git 历史）
   */
  async rollback(wikiRoot: string = "wiki"): Promise<{ success: boolean; message: string }> {
    try {
      // 执行 git 回滚
      const gitCommand = `cd "${this.vaultAdapter.getVaultPath()}" && git checkout HEAD -- "${wikiRoot}"`;
      const { exec } = require("child_process");

      return new Promise((resolve) => {
        exec(gitCommand, (error: Error, stdout: string, stderr: string) => {
          if (error) {
            resolve({
              success: false,
              message: `回滚失败: ${error.message}`,
            });
          } else {
            resolve({
              success: true,
              message: "回滚成功，已恢复到迁移前的状态",
            });
          }
        });
      });
    } catch (error) {
      return {
        success: false,
        message: `回滚失败: ${error}`,
      };
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 生成迁移摘要
   */
  private generateSummary(result: MigrationResult): string {
    if (!result.success) {
      return `迁移失败，处理了 ${result.processedFiles}/${result.totalFiles} 个文件，出现 ${result.errors.length} 个错误。`;
    }

    return `迁移成功，处理了 ${result.processedFiles} 个文件，更新了 ${result.updatedFiles} 个文件。
转换了 ${result.stats.convertedToHierarchical} 个扁平标签为层级格式，
合并了 ${result.stats.mergedTags} 个相似标签，
重命名了 ${result.stats.renamedTags} 个标签以统一格式。`;
  }

  /**
   * 生成优化建议
   */
  private generateRecommendations(result: MigrationResult): string[] {
    const recommendations: string[] = [];

    if (result.stats.convertedToHierarchical > 0) {
      recommendations.push("建议检查自动转换的标签，确保层级结构符合预期");
    }

    if (result.stats.mergedTags > 0) {
      recommendations.push("建议检查合并的标签，确认合并结果正确");
    }

    if (result.stats.originalFlatTags - result.stats.convertedToHierarchical > 0) {
      recommendations.push("部分扁平标签未能自动转换，建议手动调整");
    }

    recommendations.push("迁移完成后建议重新生成标签索引");

    return recommendations;
  }
}