---
name: llm-wiki
description: >
  基于 LLM Wiki 模式初始化和维护个人知识库。生成完整的 wiki 骨架（目录结构、CLAUDE.md Schema、
  README.md、index.md、log.md），并指导后续的 ingest（摄入源文件）、query（提问查询）、
  lint（健康检查）、legacy scan（历史库扫描）等日常操作。
  当用户提到"创建 wiki"、"初始化知识库"、"建个人知识库"、"setup wiki"、"init wiki"、
  "我要开始用 llm-wiki"、"帮我搭建一个 wiki"时使用。也适用于用户已有 wiki 骨架后说
  "ingest 这篇文章"、"帮我摄入"、"wiki lint"、"扫描历史库"、"scan legacy"等操作指令。
  即使用户只是说"我有一堆笔记想整理成知识库"或者给了一个目录说"帮我处理这些文档"，
  只要上下文涉及结构化知识积累、wiki 维护、源文件摄入，都应该触发此技能。
---

# LLM Wiki

使用 LLM 构建和维护个人知识库。核心理念：LLM 不做一次性检索，而是**持续编译知识到一个结构化的 wiki 中**——交叉引用、矛盾标注、综合分析都是持久的，每一次新输入都让知识库变得更丰富。

关于这个模式的完整理论背景，参见 `assets/llm-wiki.md`。

## Two Modes

这个 Skill 有两种工作模式：

1. **Init** — 在目标目录下生成完整的 wiki 骨架
2. **Operate** — 在已有 wiki 上执行日常操作（ingest / query / lint / legacy scan）

根据用户输入自动判断模式：如果目标目录下已有 `CLAUDE.md` 和 `wiki/` 目录，进入 Operate 模式；否则进入 Init 模式。

---

## Mode 1: Init

### Step 1 — 确认配置

默认配置如下。如果用户没有指定，直接使用默认值；如果用户提供了偏好（比如 wiki 主题、raw 子目录名称），用用户的值覆盖。

**默认 raw 子目录**：

| 子目录 | 用途 |
|--------|------|
| `tech/` | 技术文章、论文、教程 |
| `work/` | 工作相关文档 |
| `reading/` | 阅读笔记、书摘 |
| `general/` | 其他/难分类的内容 |
| `assets/` | 图片等附件 |

**默认 wiki 页面类型**：

| 子目录 | 用途 |
|--------|------|
| `wiki/summaries/` | 每篇源文件的摘要 |
| `wiki/concepts/` | 概念/主题页面（跨源综合） |
| `wiki/entities/` | 人物/工具/框架/组织 |
| `wiki/comparisons/` | 对比分析 |
| `wiki/analysis/` | 深度探索（从提问中沉淀） |

用户可以：
- 增减 raw 子目录（比如不需要 `work/`，或想加 `research/`）
- 增减 wiki 页面类型（比如加 `wiki/tutorials/`）
- 指定 wiki 标题和描述
- 指定是否需要 `legacy/` 目录（如果没有历史库则不需要）

确认配置后进入 Step 2。如果用户说"直接用默认"或没有特殊要求，跳过交互直接生成。

### Step 2 — 创建目录结构

在目标目录下创建：

```bash
mkdir -p drafts
mkdir -p raw/{子目录列表}
mkdir -p wiki/{页面类型列表}
mkdir -p legacy          # 仅当用户需要时
```

### Step 3 — 生成 CLAUDE.md

读取 `assets/templates/CLAUDE.md.tmpl`，替换占位符后写入目标目录的 `CLAUDE.md`。

占位符替换规则：
- `{{WIKI_TITLE}}` → 用户指定的标题，默认 "Personal Wiki"
- `{{RAW_SUBDIRS}}` → 根据 raw 子目录生成缩进列表，如 `  tech/          → Technical articles, papers, tutorials`
- `{{WIKI_SUBDIRS}}` → 根据 wiki 页面类型生成缩进列表
- `{{PAGE_TYPES}}` → 生成页面类型说明列表
- `{{DATE}}` → 当天日期 YYYY-MM-DD

如果模板文件不可用（比如在其他环境使用），直接基于本 Skill 中的知识生成 CLAUDE.md 内容，确保包含：目录结构、所有权规则、Wiki 页面规范（含源头追溯规则）、四个操作流程（Ingest / Query / Lint / Legacy Scan）、Index 格式、重要规则。

### Step 4 — 生成 README.md

读取 `assets/templates/README.md.tmpl`，替换占位符后写入。

占位符替换规则：
- `{{WIKI_TITLE}}` → 标题
- `{{WIKI_DESCRIPTION}}` → 一句话描述
- `{{DIR_TREE}}` → 根据实际生成的目录结构画 tree
- `{{INIT_COMMANDS}}` → 对应的 mkdir 和 touch 命令

同样，模板不可用时直接生成内容。

### Step 5 — 初始化元文件

创建三个空的元文件：

**index.md**：
```markdown
# Wiki Index

> This index is maintained by the LLM. Updated on every ingest.

## Summaries

## Concepts

## Entities

## Comparisons

## Analysis
```

**log.md**：
```markdown
# Wiki Log

> Append-only slim operation timeline. Read with `grep "^## \[" log.md | tail -5`, not full load.

## [YYYY-MM-DD] init | Wiki initialized
- Structure: drafts/, raw/, wiki/, legacy/
- Schema: CLAUDE.md generated
- Ready for first ingest
```

**legacy-index.md**（仅当有 legacy 目录时）：
```markdown
# Legacy Index

> Lightweight scan of the legacy archive. Run `scan legacy/` to populate.

| Path | Title | Summary | Tags | Quality | Wiki Relevance |
|------|-------|---------|------|---------|----------------|
```

### Step 6 — 输出确认

生成完成后，告知用户：

```
Wiki 骨架已生成，包含：
  ├── CLAUDE.md         (LLM 操作规范)
  ├── README.md         (项目说明)
  ├── index.md          (Wiki 索引)
  ├── log.md            (操作日志)
  ├── drafts/           (想法暂存)
  ├── raw/              (输入源)
  ├── wiki/             (知识库)
  └── legacy/           (历史库存档)

下一步：
  1. 把你的源文件放入 raw/ 对应子目录
  2. 告诉我 "ingest raw/tech/xxx.md" 开始摄入
  3. 如果有历史库，放入 legacy/ 后告诉我 "scan legacy/"
```

---

## Mode 2: Operate

当目标目录已有 wiki 骨架时，根据用户指令执行对应操作。先读取 `CLAUDE.md` 了解当前 wiki 的规范，再执行操作。

### Ingest

触发词：`ingest`、`摄入`、`处理这篇`、`把这个加到 wiki`

流程：
1. 读取用户指定的源文件（必须在 `raw/` 下）
2. 与用户讨论关键要点——什么重要、什么意外、和已有知识有什么联系。这是人类把控方向的核心机会。
3. 讨论达成共识后，一气呵成执行所有文件操作：
   a. 在 `wiki/summaries/` 创建摘要页（概述 + 要点列表 + 引用 + 关联）
   b. 更新或创建 `wiki/concepts/` 中的概念页。**新增内容必须标注来源** `(source: [[实际的 summary 文件名]])`——使用步骤 a 中创建的 summary 的真实文件名，frontmatter sources 追加新源的 wikilink
   c. 更新或创建 `wiki/entities/` 中的实体页。同样标注来源。注意：文章作者如果不是公众知名人物，不要创建 entity——在 summary frontmatter 中记录 `author` 字段即可
   d. 添加交叉引用——更新所有应该链接到新内容的已有页面
   e. 检查矛盾——新源与已有 wiki 内容冲突时，用 `> [!warning]` 标注
   f. 更新 `index.md`，包括新增页面和已更新页面的源数量
   g. 追加精简条目到 `log.md`（Source + Impact 数字 + Key insight，不列举完整文件名列表）

每个 wiki 页面必须包含 YAML frontmatter（title, tags, sources, created, updated）和 `[[wikilinks]]` 交叉引用。sources 字段使用 Obsidian wikilink 格式 `"[[文件名]]"`，只用文件名不含路径。

### Query

触发词：用户提出问题且当前在 wiki 项目中

流程：
1. 读 `index.md` 找相关页面（用 `grep "^## \[" log.md | tail -5` 了解近期上下文，不全量加载 log）
2. 读取相关 wiki 页面
3. wiki 不够时回退到 `raw/` 原文
4. 综合回答，附 wiki 页面引用 `(see [[page-name]])`
5. 回答有价值时，问用户是否存为 `wiki/analysis/` 或 `wiki/comparisons/` 新页面
6. 若归档，更新 `index.md` 并追加精简条目到 `log.md`
7. **未归档的 query 不写 log**

### Lint

触发词：`lint`、`健康检查`、`check wiki`、`wiki 体检`

检查项：
- **重复/近义页面**：标题或主题高度相似的页面（如 `hooks` 与 `hooks-claude-code`）。主动合并：保留更完整的页面，并入独有内容，删除冗余文件，更新所有 wikilink
- **命名不规范**：文件名不符合英文小写 kebab-case（含大写、空格、中文、括号等）。主动重命名并更新引用
- 矛盾：页面间冲突的声明
- 过时内容：被新源覆盖的旧说法
- 孤立页面：没有入链的页面
- 缺失页面：被提及但没有独立页面的概念
- 缺失交叉引用：应该互链但没链的页面
- **来源缺失：concept/entity 页面中没有标注来源的内容段落**
- **空白与建议：知识空白主题，附上建议的搜索方向或待查找的资料类型**

将完整报告写入 `wiki/lint-report.md`（覆盖写入，只保留最新），**主动修复**能修复的（包括合并重复页面和重命名不规范文件），不能修的给建议。追加精简摘要到 `log.md`（只记 pages scanned / issues fixed / pending 数字）。

### Legacy Scan

触发词：`scan legacy`、`扫描历史库`、`扫描 legacy`

流程：
1. 列出 `legacy/` 所有文件
2. 每个文件只读标题（第一个标题）和前 10 行——不读全文
3. 生成或更新 `legacy-index.md`：路径、标题、一句话摘要、标签、质量预估、与 wiki 的关联
4. 追加 `log.md`

---

## Key Principles

这些原则贯穿所有操作：

- **raw/ 是不可变的**。不修改、不删除、不重命名、不移动 raw 中的文件。LLM 只读。
- **drafts/ 是人类的**。LLM 不主动处理 drafts 中的内容。
- **wiki/ 是 LLM 的**。人类只看不改。
- **每次操作后更新 index.md 和 log.md**。这是 wiki 的导航和时间线。log 条目保持精简，lint 完整报告写入 `wiki/lint-report.md`。
- **交叉引用用 wikilinks**。格式 `[[page-name]]` 或 `[[page-name|Display Text]]`。
- **sources 字段用 wikilinks**。格式 `"[[文件名]]"`，只用文件名不含路径，Obsidian 自动定位。
- **知识必须可追溯**。concept/entity 页面的每段内容标注来源 `(source: [[实际的 summary 文件名]])`，引用前确认文件名正确。
- **矛盾必须显式标注**。不要悄悄覆盖旧内容。
- **优先更新已有页面**，而不是创建新页面。创建前先检查是否已有同义/近义页面，有则合并不新建。
- **Ingest 先讨论再执行**。先和用户讨论要点，共识后再一气呵成完成文件操作。
- **只记归档的 query 到 log**。未归档的 query 不留痕，好回答沉淀为 wiki 页面本身就是最好的记录。
- **每次只 ingest 一篇**，除非用户明确要求批量处理。
- **不确定时问用户**。宁可多问一句，不要做错结构决策。
