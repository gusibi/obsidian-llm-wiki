# Obsidian LLM Wiki

一个基于 LLM 构建和维护个人知识库的完整解决方案，包含 Obsidian 插件和 Claude Code Skill 两个组件。

## 项目构成

这个项目包含两个独立但互补的组件：

### 1. Obsidian LLM Wiki 插件

**位置**: `obsidian-llm-wiki/`

Obsidian 插件，提供统一的 Wiki 管理界面，通过 ACP（Agent Communication Protocol）与 Claude Code 或 Cursor 通信。

**功能特性**:
- 🚀 一键初始化 Wiki 结构（`/init`）
- 📥 智能摄入源文件（`/ingest`）- 自动生成摘要、概念页、实体页
- ❓ 基于 Wiki 的问答（`/query`）- 回答可沉淀为知识
- 🩺 健康检查（`/lint`）- 自动发现并修复矛盾、孤立页面
- 📊 历史库扫描（`/scan`）- 轻量级旧笔记索引
- 📱 统一界面 - Wiki 状态面板 + Chat 面板一体化

**目录结构**:
```
Vault/
├── raw/          # 输入源（LLM 只读）
├── wiki/         # LLM 维护的知识库
├── drafts/       # 人类专属想法
├── legacy/       # 旧笔记存档
├── CLAUDE.md     # LLM 操作规范（Schema）
├── index.md      # Wiki 主索引
└── log.md        # 操作日志
```

**快速开始**:
1. 安装插件到 Obsidian
2. 在 Chat 面板输入 `/init` 初始化
3. 把文章放入 `raw/` 目录
4. 使用 `/ingest raw/xxx.md` 开始编译

更多详情: [插件文档](obsidian-llm-wiki/README.md)

---

### 2. llm-wiki Skill

**位置**: `skills/llm-wiki/`

Claude Code 的 Skill，用于在任何目录初始化 LLM Wiki 知识库，无需 Obsidian 插件。

**两种工作模式**:

**Mode 1: Init（初始化）**
在目标目录生成完整的 wiki 骨架：
- 创建 `drafts/`, `raw/`, `wiki/`, `legacy/` 目录
- 生成 `CLAUDE.md`（操作规范）
- 生成 `README.md`（项目说明）
- 生成 `index.md`, `log.md`, `legacy-index.md`

**Mode 2: Operate（日常操作）**
在已有 wiki 上执行：
- **Ingest** - 摄入源文件到 wiki（创建摘要、更新概念/实体页、加交叉引用）
- **Query** - 提问查询（基于 wiki 回答，可沉淀新页面）
- **Lint** - 健康检查（发现矛盾、孤立页面、缺失来源）
- **Legacy Scan** - 扫描历史库（生成轻量索引）

**适用场景**:
- 不用 Obsidian，直接在任何文件夹中维护 wiki
- 已有 wiki 骨架，需要执行日常操作
- 用户说"我要创建 wiki"、"帮我摄入这篇文章"、"扫描历史库"等

**核心原则**:
- `raw/` 是不可变的（LLM 只读，不修改）
- `wiki/` 是 LLM 的（人类只看不改）
- 知识必须可追溯（每段内容标注来源）
- 矛盾必须显式标注（用 `[!warning]`）
- 只记归档的 query 到 log（未归档的不留痕）

更多详情: [Skill 文档](skills/llm-wiki/README.md)

---

## 我该用哪个？

| 场景 | 推荐工具 | 原因 |
|------|---------|------|
| 我是 Obsidian 用户 | **插件** | 统一界面，操作顺滑，支持文件选择器 |
| 我不用 Obsidian | **Skill** | 在任何目录直接用，无需安装 |
| 我想快速试试 | **Skill** | 零配置，一条指令初始化 |
| 已有 wiki，需要维护 | 两者皆可 | 插件适合日常，skill 适合批量处理 |

## 核心思想：Wiki 不是 RAG

传统 RAG：你上传文档 → LLM 每次提问时检索片段 → 从头拼凑答案。知识不积累，每次都在重新发现。

**Wiki 方式**：你提供源文件 → LLM **一次性读取、提炼、整合**到 wiki 中 → 更新实体页、概念页、交叉引用 → 知识持续复利增长。

**你负责**：筛选内容源、提出好问题、把控方向。
**LLM 负责**：总结、交叉引用、归档、维护一致性。

## 安装与使用

### 插件安装
1. 打开 `obsidian-llm-wiki/` 目录
2. 将 `manifest.json`,`main.js`,`styles.css` 放入 Obsidian 的插件文件夹
3. 在 Obsidian 中启用插件
4. 确保已安装 Claude Code 或 Cursor

### Skill 安装
Skill 文件在 `skills/llm-wiki/`，按照 Claude Code 的 skill 安装流程添加到本地 skills 目录即可。

## 完整文档

- [插件文档](obsidian-llm-wiki/README.md) - 插件功能、安装、使用方法
- [Skill 文档](skills/llm-wiki/README.md) - Skill 工作模式、操作流程、使用示例
- [CLAUDE.md Schema](obsidian-llm-wiki/CLAUDE.md) - LLM 操作规范（这是真正的"核心逻辑"）
- [llm-wiki 模式理论](skills/llm-wiki/assets/llm-wiki.md) - 设计理念和完整背景

## 贡献

欢迎提交 Issue 和 PR！

---

*这个项目本身就是用 AI 构建的。从设计到编码到调试，全程在 Cursor 里完成。构建过程中踩的每一个坑，都变成了更好的 prompt 设计。*
