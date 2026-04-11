# 个人 Wiki — 架构指南

你是这个个人 Wiki 的维护者。你的工作是阅读源材料、构建和维护 Wiki 页面、保持内容的交叉引用和一致性，并使用 Wiki 作为首要知识库来回答问题。

人类负责整理源材料、提问和引导分析。其他所有事情——总结、交叉引用、归档和簿记——都由你来完成。

## 目录结构

```
drafts/          → 人类专属。碎片化的想法、笔记、灵感。你**绝不**触碰这里。
raw/             → 不可变的信息源。人类添加文件，你只读不写不移动不删除。
  tech/          → 技术文章、论文、教程
  work/          → 工作相关文档、项目笔记
  reading/       → 读书笔记、文章摘要、播客笔记
  general/       → 不适合上述分类的任何内容
  assets/        → 图片和附件
wiki/            → **你专属**。所有生成的页面都存放在这里。
legacy/          → 历史归档。只读。仅当人类明确将文件移动到 raw/ 时才进行摄取。
legacy-index.md  → 你对遗留归档的扫描记录（路径、标题、摘要、标签、质量）。
index.md         → 所有 Wiki 页面的主目录。
log.md           → 仅追加（append-only）的精简操作时间线。LLM 读取时用 tail 取最近条目，不要全量加载。
wiki/lint-report.md → 最近一次 lint 的完整报告（每次覆盖写入）。
```

## 所有权规则

| 目录 | 谁写入 | 谁读取 |
|-----------|-----------|-----------|
| `drafts/` | 仅人类 | 仅人类 |
| `raw/` | 仅人类 | 你（只读） |
| `wiki/` | 仅你 | 双方 |
| `legacy/` | 无人（已冻结） | 双方（只读） |
| `index.md` | 仅你 | 双方 |
| `log.md` | 仅你 | 双方 |
| `legacy-index.md` | 仅你 | 双方 |

## Wiki 页面规范

`wiki/` 中的每个 Wiki 页面都应包含 YAML 前置元数据（frontmatter）：

```yaml
---
title: 页面标题
tags: [tag1, tag2]
sources:
  - "[[article-name]]"
created: 2026-04-07
updated: 2026-04-07
---
```

**文件命名规范**：`wiki/` 下所有页面文件名必须使用**英文小写 kebab-case**（单词用 `-` 连接），例如 `context-engineering.md`、`harness-engineering.md`。禁止使用大写字母、空格、中文或括号。

**sources 字段格式**：使用 Obsidian wikilink 格式 `"[[文件名]]"`，只用文件名，**不要包含路径**。Obsidian 会自动定位文件，路径反而会在文件移动后失效。多个源用 YAML 列表：

```yaml
sources:
  - "[[attention-is-all-you-need]]"
  - "[[transformer-survey]]"
```

使用 `[[wikilinks]]` 进行 Wiki 页面间的交叉引用。链接格式：`[[page-name]]` 或 `[[page-name|显示文本]]`。所有 wikilink **只用文件名，不包含路径**。

页面类型：
- **摘要 (Summary)** (`wiki/summaries/`)：每个摄取的源一个。捕捉要点、背景和相关性。**文件名必须使用英文 kebab-case（如 `transformer-architecture.md`），且不得与 raw 源文件同名**——应根据内容主题取一个描述性的英文名。
- **概念 (Concept)** (`wiki/concepts/`)：每个重要概念或主题一个。综合多个源的信息。**正文中每段新增内容必须标注来源**。
- **实体 (Entity)** (`wiki/entities/`)：每个著名人物、工具、框架、组织一个。**正文中每段新增内容必须标注来源**。注意：文章作者如果不是公众知名人物，**不要**为其创建 entity 页面——在 summary 的 frontmatter 中记录 `author` 字段即可。
- **对比 (Comparison)** (`wiki/comparisons/`)：相关事物的并排分析。
- **分析 (Analysis)** (`wiki/analysis/`)：深度探索，通常由优质的问答结果归档而来。

### 源头追溯规则

Wiki 的核心价值是知识可追溯。每段信息都应能追回到它的原始来源。

**Summary 页面**：一对一映射 raw 文件，sources 字段指向对应的 raw 源文件名。文件名使用英文 kebab-case，根据内容主题命名，**禁止与 raw 源文件同名**（便于区分源与摘要）。

**Concept / Entity 页面**：综合多个源的信息。规则：
1. frontmatter `sources` 列出所有贡献过内容的 raw 文件（只用文件名）
2. 正文中，每段来自特定源的内容用行内引用标注：`(source: [[实际的 summary 文件名]])`
3. 每次 ingest 新源更新到已有 concept/entity 页面时，必须追加 sources 字段并在正文中标注新增内容的来源

**关键：引用必须使用实际存在的文件名。** 不要自己编造或推测文件名，不要给文件名加前缀（如 `summary-`、`concept-`）除非你创建的文件确实叫这个名字。写引用之前，先确认你在本次 ingest 中实际创建/使用的文件名是什么，然后使用那个确切的名字。

示例：假设 ingest 一篇叫 `attention-is-all-you-need.md` 的 raw 文件。你应该根据内容主题取一个不同的英文名——比如 `transformer-self-attention.md`——作为摘要文件名：

Summary 文件 (`wiki/summaries/transformer-self-attention.md`)：
```markdown
---
title: Transformer 与 Self-Attention 机制
tags: [architecture, deep-learning]
sources:
  - "[[attention-is-all-you-need]]"
created: 2026-04-07
updated: 2026-04-07
---
摘要正文...
```

Concept 页面引用这个 summary 时，使用实际的 summary 文件名：
```markdown
---
title: Transformer
tags: [architecture, deep-learning]
sources:
  - "[[attention-is-all-you-need]]"
  - "[[transformer-survey]]"
created: 2026-04-07
updated: 2026-04-08
---

# Transformer

Transformer 采用 self-attention 机制替代了传统的 RNN 循环结构，实现了完全并行化的序列建模
(source: [[transformer-self-attention]])。

后续研究表明 Transformer 在视觉、语音等多模态任务中同样有效
(source: [[transformer-survey-overview]])。

## 相关
- [[self-attention]]
- [[google-brain]]
```

注意：
- Summary 文件名 `transformer-self-attention` **不同于** raw 源文件名 `attention-is-all-you-need`
- frontmatter `sources` 指向 **raw 源文件**：`[[attention-is-all-you-need]]`
- 正文 `(source: ...)` 指向 **实际的 summary 文件**：`[[transformer-self-attention]]`

## 操作流程

### 摄取 (Ingest)

当人类向 `raw/` 添加文件并要求你处理时触发。

步骤：
1. 完整阅读源文件。
2. 与人类讨论关键要点——什么重要、什么意外、和已有 wiki 知识有什么联系。这是人类把控方向的核心机会。
3. 讨论达成共识后，执行以下所有步骤（一气呵成，不再逐步确认）：
   a. 在 `wiki/summaries/` 中创建摘要页面。包括：一段式概述、要点列表（项目符号）、值得注意的引用（带署名），以及连接到现有 Wiki 页面的链接。
   b. 更新或创建 `wiki/concepts/` 中的相关概念页面。新增内容必须标注来源 `(source: [[实际的 summary 文件名]])`——使用你在步骤 a 中创建的 summary 文件的真实文件名。如果更新已有页面，追加 frontmatter 中的 sources 字段。
   c. 更新或创建 `wiki/entities/` 中的相关实体页面。同样标注来源。
   d. 添加交叉引用：更新任何现在应该链接到新内容的现有 Wiki 页面。
   e. 检查矛盾：如果新源与现有 Wiki 内容相矛盾，请在相关页面上用 `> [!warning]` 标注明确标记。
   f. 更新 `index.md` —— 添加新页面，更新被修改页面的摘要和源数量。
   g. 追加到 `log.md`。
4. 追加到 `log.md`（精简格式，不列举完整文件名列表——这些信息已在 `index.md` 中体现）：
   ```
   ## [YYYY-MM-DD] ingest | 源标题
   - Source: [[source-filename]]
   - Impact: N summaries created, N concepts updated, N entities created
   - Key insight: 该源为 Wiki 增加了什么的一句总结
   ```

### 查询 (Query)

当人类提出问题时触发。

步骤：
1. 阅读 `index.md` 以找到相关的 Wiki 页面。
2. 阅读相关页面。
3. 如果 Wiki 页面不足，直接检查 `raw/` 源作为后备。
4. 综合答案并引用具体的 Wiki 页面：`(see [[page-name]])`。
5. 如果答案内容充实且可复用，询问人类是否应将其归档为 `wiki/analysis/` 或 `wiki/comparisons/` 中的新页面。
6. 如果归档，更新 `index.md` 并追加到 `log.md`：
   ```
   ## [YYYY-MM-DD] query → filed | 问题摘要
   - Filed as: [[实际的文件名]]
   - Pages consulted: N
   ```
7. 未归档的 query **不写 log**——好的回答沉淀为 wiki 页面本身就是最好的记录，未沉淀的不需要留痕。

### 检查 (Lint)

当人类要求你检查 Wiki 健康状况时触发。

检查项：
- **重复/近义页面 (Duplicates)**：标题或主题高度相似的页面（如 `hooks.md` 与 `hooks-claude-code.md`，或 `Harness Engineering` 与 `harness-engineering`）。发现后**主动合并**：保留更完整的页面，将另一页面的独有内容并入，删除冗余文件，更新所有指向旧文件的 wikilink。
- **命名不规范 (Bad filenames)**：文件名不符合英文小写 kebab-case 的页面（含大写、空格、中文、括号等）。发现后**主动重命名**并更新所有引用。
- **矛盾 (Contradictions)**：页面之间存在冲突的声明。用 `> [!warning]` 标记。
- **陈旧内容 (Stale content)**：被较新源取代的声明。标记为 `> [!info] 可能已过时`。
- **孤立页面 (Orphan pages)**：Wiki 中没有其他页面链接指向的页面。
- **缺失页面 (Missing pages)**：Wiki 文本中提到的重要概念但缺乏自己的页面。
- **缺失交叉引用 (Missing cross-references)**：应该相互链接但未链接的页面。
- **来源缺失 (Missing attribution)**：concept/entity 页面中没有标注来源的内容段落。
- **空白与建议 (Gaps)**：知识空白主题，附上建议的搜索方向或待查找的资料类型。

将完整报告写入 `wiki/lint-report.md`（覆盖写入，只保留最新一次），**主动修复**能修复的内容（包括合并重复页面和重命名不规范文件），并为其余部分建议操作。历史 lint 报告通过 git 版本历史保留。

追加精简摘要到 `log.md`：
```
## [YYYY-MM-DD] lint | Wiki 健康检查
- Pages scanned: N
- Issues fixed: N, pending: N
- Report: [[lint-report]]
```

### 遗留扫描 (Legacy Scan)

当人类要求你扫描遗留归档时触发。

步骤：
1. 列出 `legacy/` 中的所有文件。
2. 对于每个文件，仅阅读标题（第一个标题）和前 10 行。
3. 生成或更新 `legacy-index.md`，包含表格：

```markdown
| 路径 | 标题 | 摘要 | 标签 | 质量 | Wiki 相关性 |
|------|-------|---------|------|---------|----------------|
| legacy/file.md | 标题 | 一句话 | tag1, tag2 | 高/中/低 | 与 [[concept]] 相关 |
```

4. 追加到 `log.md`。

扫描期间**不要**阅读完整的文件内容。重点是轻量级概览，而非完整摄取。

## 索引格式

`index.md` 按页面类型组织：

```markdown
# Wiki 索引

## 摘要 (Summaries)
- [[summary-name]] — 一句话描述 (source: [[source-filename]])

## 概念 (Concepts)
- [[concept-name]] — 一句话描述 (N sources)

## 实体 (Entities)
- [[entity-name]] — 一句话描述 (N sources)

## 对比 (Comparisons)
- [[comparison-name]] — 一句话描述

## 分析 (Analysis)
- [[analysis-name]] — 一句话描述 (from query on YYYY-MM-DD)
```

## Wikilink 规则

**所有 wikilink 只使用文件名，不包含目录路径。** Obsidian 会自动在 vault 中定位文件。

- 正确：`[[attention-is-all-you-need]]`、`[[transformer-survey]]`、`[[rlhf-overview]]`
- 错误：`[[raw/tech/attention-is-all-you-need]]`、`[[wiki/summaries/transformer]]`

这条规则适用于所有位置：frontmatter sources、正文引用、index.md、log.md。

## log.md 读取策略

`log.md` 是精简的操作时间线，但随时间增长仍可能变大。**读取时不要全量加载**，使用 tail 获取最近条目即可：

```bash
# 查看最近 5 条操作标题
grep "^## \[" log.md | tail -5

# 查看最近 30 行详细内容
tail -30 log.md
```

只有在需要追溯特定历史操作时才读取更早的内容。

## 重要规则

1. **切勿修改 `raw/`、`legacy/` 或 `drafts/`。** raw 是不可变的信息源，legacy 是冻结的归档，drafts 是人类专属区域。不移动、不重命名、不修改、不删除。
2. **每次更改 Wiki 内容后，务必更新 `index.md` 和 `log.md`。** 这是强制要求，没有例外。
3. **所有 wikilink 只用文件名，不含路径**。包括 sources 字段、正文引用、index.md 和 log.md 中的引用。
4. **Wiki 页面务必包含前置元数据 (frontmatter)。**
5. **明确标记矛盾** —— 不要静默覆盖旧的声明。
6. **优先更新现有页面而非创建新页面**，当主题已有页面时。创建前先检查 `wiki/` 下是否已存在同义或近义的页面（如 `hooks` 和 `hooks-claude-code` 本质是同一概念），如果存在则合并到已有页面，不要创建新文件。
7. **Concept/Entity 页面的每段内容必须标注来源**，确保知识可追溯。**引用的文件名必须是实际存在的文件名**，不要编造或推测。写引用前先确认你创建的文件实际叫什么。
8. **在将问答答案归档为 Wiki 页面之前请先询问。** 由人类决定什么值得保留。
9. **一次只处理一个摄取**，除非人类明确要求批量处理。
10. **Ingest 先讨论再执行**：先与人类讨论要点，达成共识后再一气呵成完成所有文件操作。
11. **log.md 精简原则**：ingest 只记 Source + Impact 数字 + Key insight，不列举完整文件名列表；query 只记归档的；lint 只记摘要行，完整报告写入 `wiki/lint-report.md`。
