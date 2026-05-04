# 层级标签系统使用指南

## 概述
本系统实现了智能层级标签管理功能，帮助你更好地组织和管理 wiki 内容。与传统扁平标签相比，层级标签使用斜杠 `/` 分隔（如 `ai/machine-learning/transformer`），能更好地体现分类关系，减少重复标签，提升可维护性。

## 核心功能

### 1. 智能标签生成
- AI 自动为新内容生成符合层级规范的标签
- 自动学习现有标签的风格和层级结构，保持一致性
- 标签格式自动规范化为 kebab-case 小写

### 2. 标签审计与优化
- AI 自动分析现有标签是否合理，提供优化建议
- 支持自动合并相似标签、转换扁平标签为层级格式
- 提供全局标签健康度报告，帮助你优化整个标签体系

### 3. 增强查询功能
- 支持层级前缀查询，例如 `@tag(ai/*)` 可以查询所有 `ai/` 分类下的内容
- 自动补全支持层级路径提示

### 4. 批量迁移工具
- 支持将现有扁平标签批量转换为层级格式
- 提供试运行模式，确认变更后再实际修改
- 支持 git 回滚，确保安全

## 快速开始

### 自动生成层级标签
从现在开始，AI 生成标签时会自动使用层级格式，无需额外操作。生成的标签会遵循你现有标签的风格，如果是全新的库，会使用行业通用的分类体系。

### 手动查询层级标签
在聊天中使用 `@tag(前缀/*)` 可以查询该分类下的所有内容：
```
@tag(ai/*) 请列出所有关于人工智能的笔记
@tag(engineering/method/*) 请给我所有方法论相关的文档
```

### 审计标签健康度
可以通过命令对所有标签进行审计，了解当前标签体系的健康状况，获取优化建议：
```
/audit-tags
```

### 批量迁移现有标签
如果有大量扁平标签需要转换，可以使用迁移工具：
```
/migrate-tags --dry-run  # 试运行，查看会有哪些变更
/migrate-tags --confirm  # 执行实际迁移
```

## 最佳实践

### 标签层级设计建议
- 层级深度建议控制在 2-4 级，不要过深
- 顶层分类建议保持精简，控制在 5-10 个，例如：
  - `ai/` - 人工智能相关
  - `engineering/` - 工程技术相关
  - `domain/` - 业务领域相关
  - `project/` - 项目管理相关
  - `research/` - 研究学习相关
  - `tool/` - 工具使用相关

### 标签命名规范
- 全部使用小写字母
- 单词之间使用减号 `-` 分隔（kebab-case）
- 不要使用空格、下划线或其他特殊字符
- 用词要简洁明确，避免歧义

### 管理建议
- 定期（如每月）运行标签审计，清理和合并重复标签
- 当领域知识增长时，可以适当调整层级结构
- 重要标签调整建议先做试运行，确认影响范围后再执行

## API 说明（开发者）

### TagManager 类
标签管理核心类，提供校验、查询、统计等功能：
```typescript
const tagManager = new TagManager(vaultAdapter);
await tagManager.learnFromExistingTags(); // 学习现有标签模式
const suggestions = tagManager.suggestHierarchy("llm"); // 获取层级建议
const stats = tagManager.generateStats(); // 获取标签统计
```

### TagAuditor 类
AI 审计功能：
```typescript
const tagAuditor = new TagAuditor(connection, tagManager, vaultAdapter);
const auditResult = await tagAuditor.auditFileTags(filePath); // 审计单个文件
const globalReport = await tagAuditor.auditAllTags(); // 全局审计
const optimized = await tagAuditor.autoOptimizeTags(tags); // 自动优化标签
```

### TagMigrator 类
迁移工具：
```typescript
const migrator = new TagMigrator(tagManager, tagAuditor, vaultAdapter);
const preview = await migrator.generatePreviewReport(); // 生成迁移预览
const result = await migrator.migrate({ dryRun: false }); // 执行迁移
```

## 注意事项
- 所有功能仅作用于 `wiki/` 目录，不会影响其他目录的内容
- 自动操作都会生成详细的变更报告，建议确认后再应用
- 重要变更前建议先提交 git 版本，方便回滚
- 首次使用建议先运行审计功能，了解当前标签状况

## 常见问题

### Q: 现有扁平标签会被自动转换吗？
A: 不会自动转换，需要你手动运行迁移命令。系统提供了智能的转换建议，你可以选择全部应用或部分调整。

### Q: 可以自定义顶层分类吗？
A: 完全可以。你可以在 `src/config/tag-knowledge-base.ts` 中的 `manualMappings` 配置自定义映射规则，也可以直接修改 AI 生成的标签。

### Q: 层级查询性能如何？
A: 系统内置了标签缓存，查询性能很高，即使有几千个标签也不会有明显延迟。

### Q: 可以混合使用扁平标签和层级标签吗？
A: 可以，系统完全兼容。但建议逐步将扁平标签转换为层级格式，提升整体可维护性。