# LLM Wiki — 个人知识库

基于 [llm-wiki 模式](assets/llm-wiki.md) 构建的个人知识库。核心理念：LLM 不是每次查询时临时检索，而是**持续构建和维护一个结构化的 wiki**。知识编译一次，持续更新，越用越丰富。

## 核心思想

传统 RAG 方式：你上传文档 → LLM 每次提问时检索片段 → 从头拼凑答案。知识不积累，每次都在重新发现。

Wiki 方式：你提供源文件 → LLM **一次性读取、提炼、整合**到 wiki 中 → 更新实体页、概念页、交叉引用 → 知识持续复利增长。

**你负责**：筛选内容源、提出好问题、把控方向。
**LLM 负责**：总结、交叉引用、归档、维护一致性——所有人类懒得做的知识库维护工作。

## 目录结构

```
llm-wiki/
├── drafts/              # 💡 个人想法暂存区
├── raw/                 # 📚 正式输入源（不可变，LLM 只读）
│   ├── tech/            #    技术文章、论文
│   ├── work/            #    工作相关文档
│   ├── reading/         #    阅读笔记、书摘
│   ├── general/         #    其他内容
│   └── assets/          #    图片等附件
├── wiki/                # 🤖 LLM 生成维护的知识库
│   ├── summaries/       #    每篇源文件的摘要
│   ├── concepts/        #    概念/主题页面（跨源综合，每段标注来源）
│   ├── entities/        #    人物/工具/框架/组织页面（每段标注来源）
│   ├── comparisons/     #    对比分析
│   └── analysis/        #    深度分析（从提问中沉淀）
├── legacy/              # 🗄️ 已有私料库存档
├── assets/              #    项目级资源文件
│   └── llm-wiki.md      #    原始 llm-wiki 模式说明
├── docs/plans/          #    设计文档
├── legacy-index.md      # 历史库索引（LLM 扫描生成）
├── index.md             # Wiki 主索引
├── log.md               # 精简操作时间线（ingest + 归档的 query + lint 摘要）
├── CLAUDE.md            # LLM 操作规范（Schema）
└── README.md            # 本文件
```

## 四个目录，四种角色

| 目录 | 谁写 | 谁读 | 用途 |
|------|------|------|------|
| `drafts/` | 你 | 你 | 碎片想法、灵感、未成型的笔记。没有格式要求。 |
| `raw/` | 你 | LLM（只读） | 不可变的信息源。文件一旦放入不修改不移动。 |
| `wiki/` | LLM | 你 + LLM | LLM 维护的结构化知识库。你只看不改。 |
| `legacy/` | 无人修改 | 你 + LLM（只读） | 已有私料库的原封存档。按需取用。 |

## 工作流程

### 1. Ingest（摄入新内容）

最核心的操作。当你有一篇新文章或资料要加入知识库时：

```
你：把文件放入 raw/ 对应子目录
你：告诉 LLM "ingest raw/tech/xxx.md"
LLM：读取全文 → 和你讨论要点 → 达成共识后一气呵成：写摘要页 → 更新概念页/实体页（标注来源）→ 加交叉引用 → 更新 index → 追加 log
```

一次 ingest 可能触达 10-15 个 wiki 页面。建议逐篇 ingest 并全程参与——LLM 会先和你讨论要点，你来引导侧重什么，然后 LLM 再执行。

### 2. Query（提问查询）

```
你：提出问题
LLM：读 index.md → 找到相关 wiki 页面 → 读取内容 → 综合回答（附 wiki 页面引用）
你：如果回答很好，可以让 LLM 把它存为 wiki/analysis/ 或 wiki/comparisons/ 下的新页面
LLM：归档后记录到 log.md
```

好的回答不应该消失在聊天记录里——沉淀到 wiki 中让知识持续积累。只有被归档为 wiki 页面的 query 才会记录到 log.md，未归档的不留痕。

### 3. Lint（健康检查）

定期让 LLM 做一次 wiki 体检：

- 有没有页面之间的矛盾？
- 有没有被新源覆盖的过时内容？
- 有没有孤立页面（没有其他页面链接到它）？
- 有没有重要概念被提到了但还没有独立页面？
- 有没有 concept/entity 页面中缺少来源标注的内容？
- 有没有可以通过搜索补充的知识空白？（附搜索建议）

### 4. Legacy Scan（历史库扫描）

针对已有的大量历史资料，做一次轻量扫描（只读标题和前几行，不读全文）：

```
你：告诉 LLM "scan legacy/"
LLM：遍历所有文件 → 读标题和前 10 行 → 生成 legacy-index.md（路径、标题、摘要、标签、质量评估）
```

产出一份"历史库地图"，后续按需从中精选内容迁移到 `raw/`。

## 知识追溯

Wiki 的核心价值之一是**知识可追溯**——你看到 wiki 中的任何一段内容，都能追回到它来自哪篇原始文章。

- **Summary 页面**：一对一映射 raw 文件
- **Concept / Entity 页面**：综合多个源，每段内容标注 `(source: [[实际的 summary 文件名]])`
- **frontmatter sources 字段**：使用 Obsidian wikilink 格式 `"[[文件名]]"`，只用文件名不含路径，Obsidian 自动定位

```markdown
Transformer 采用 self-attention 机制替代了传统的 RNN 循环结构
(source: [[attention-is-all-you-need]])。
```

## 数据流全景

```
┌─────────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  drafts/    │────▶│  raw/    │────▶│  LLM     │────▶│  wiki/   │
│  碎片想法    │ 整理 │  正式源   │ ingest│  处理    │ 生成  │  知识库   │
└─────────────┘     └──────────┘     └──────────┘     └──────────┘
                         ▲                                  │
┌─────────────┐     精选 │                                  │ 来源追溯
│  legacy/    │──────────┘                                  │ (source: [[实际文件名]])
│  历史库存档  │                                             ▼
└─────────────┘                                     每段内容可追回到 raw

┌─────────────┐     query      ┌──────────┐     file back
│  你的提问    │───────────────▶│  wiki/   │◀────────────
└─────────────┘                └──────────┘   好的回答沉淀为新页面
       │
       └──────────────────────▶ log.md（归档的 query 记录）
```

## 历史库迁移策略

面对已有的 500+ 篇私料库，**不做全量 ingest**。策略是：

1. **先扫描**：让 LLM 做一次 legacy scan，生成索引地图
2. **增量为主**：新内容走标准 ingest 流程，wiki 从新内容开始生长
3. **按需迁移**：深入某个主题时，从 `legacy-index.md` 找相关历史文章，精选后移入 `raw/` 做正式 ingest

好处：wiki 质量由高质量内容驱动，token 成本可控，你保持掌控。

## raw/ 分目录原则

- 按大类分 3-5 个子目录，**不要过细**
- 分类是给你自己浏览方便的，LLM 不依赖目录结构
- 不确定放哪的文件放 `general/`
- 可以后续调整，不用一开始定死
- raw/ 中的文件是不可变的——LLM 不会移动、重命名或修改它们

## 快速开始

### Step 1：初始化目录

```bash
mkdir -p drafts raw/{tech,work,reading,general,assets} wiki/{summaries,concepts,entities,comparisons,analysis} legacy
touch index.md log.md legacy-index.md
```

### Step 2：放入已有私料库

把你的私料库拷贝或软链接到 `legacy/`：

```bash
ln -s /path/to/your/existing/library legacy/
# 或者
cp -r /path/to/your/existing/library/* legacy/
```

### Step 3：历史库扫描

打开 LLM Agent（Claude Code / Codex / 等），告诉它：

> 请扫描 legacy/ 目录，生成 legacy-index.md。只读每个文件的标题和前 10 行，不要读全文。

### Step 4：开始 ingest

挑选 5-10 篇你最看重的内容，放入 `raw/` 对应子目录，逐篇 ingest：

> 请 ingest raw/tech/xxx.md

LLM 会先和你讨论要点，然后再执行 wiki 更新。

### Step 5：日常使用

- 新文章 → `raw/` → ingest
- 碎片想法 → `drafts/` → 积累整理 → 移入 `raw/` → ingest
- 提问 → query → 好回答沉淀到 wiki（归档的 query 记录到 log）
- 定期 → lint 维护 wiki 健康
- 需要历史内容 → 查 `legacy-index.md` → 精选迁移

## 工具推荐

- **Obsidian**：浏览 wiki 的最佳方式。Graph view 看全局结构，Dataview 做动态查询。
- **Obsidian Web Clipper**：浏览器插件，把网页文章转为 Markdown 直接存入 `raw/`。
- **qmd**：本地 Markdown 搜索引擎（BM25 + 向量搜索），wiki 变大后替代 `index.md` 做检索。
- **Marp**：Markdown 幻灯片格式，直接从 wiki 内容生成演示文稿。
- **Git**：wiki 就是一个 Markdown 文件 git repo，天然有版本历史。

## 设计文档

详细的设计决策和背景参见 [设计文档](docs/plans/2026-04-07-personal-wiki-bootstrap-design.md)。
