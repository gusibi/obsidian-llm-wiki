# Claude Code for Obsidian (PRD)

## 1. 产品定位
一个 **以 Obsidian Vault 为“长期项目记忆”**、以 **claude-code-cli + claude-code-acp 为执行引擎** 的 **本地优先（local-first）Agent 插件**。

---

## 2. 核心功能

### A. Agent Chat 面板
- 流式输出 (Streaming)
- Markdown 渲染
- 工具调用日志 (Tool-call logs)
- 会话管理：新建、恢复、分叉 (Fork)

### B. 上下文系统 (Context System)
- 支持多种 @ 引用类型：
  - Note, Block, Folder, Tag, Search
- 自动上下文摘要
- 上下文占用 (Token budget) 可视化与控制

### C. Patch & Diff 系统
- Agent 提出 Patch Proposal
- 生成 Diff 预览
- 用户 Apply/Reject/Edit 流程
- 详细的操作审计日志

### D. 终端执行 (Terminal)
- 后台命令执行 (Tests, Build)
- 分类权限控制 (Safe, Test, Danger)
- 输出折叠与审计

### E. TODO / Task 闭环
- Agent 输出 TODO 自动同步到笔记或 `Agent Inbox.md`
- TODO 支持点击继续执行（绑定来源会话）

---

## 3. 技术架构

### 核心引擎 (ACP Client)
插件通过 **Agent Client Protocol (ACP)** 与 Claude Code 连接。
- **stdio → WebSocket bridge** 建立连接
- 支持 reconnect / resume

### 数据存储
- 会话存储：`.obsidian/claude/sessions/`
- 审计日志：`.obsidian/claude/audit/`
- 权限配置：`.obsidian/claude/permissions.json`

---

## 4. Obsidian 原生差异化

### 项目记忆文件 (Project Memory)
- 自动维护 `CLAUDE.md` 或 `PROJECT.md`
- 存储架构约定、决策、测试命令

### 图谱 Context Picker
- 利用 Obsidian 的知识图谱一键将关联笔记加入上下文
