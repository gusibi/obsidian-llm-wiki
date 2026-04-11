# PRD vs 当前实现：未实现功能清单

## 结论概览
- **已实现（或大部分覆盖）**：Chat 面板（流式/Markdown/工具日志）、会话新建/恢复/分叉、基础上下文解析、TODO 抽取到 `Agent Inbox.md`。
- **部分实现**：上下文系统（缺摘要/开关/预算）、TODO 闭环（缺当前 Note 目标与一键继续）、编辑器内快捷入口（仅有“选区发送”和“当前笔记快速聊天”）。
- **未实现**：Patch+Diff 审计写入、终端执行、Slash Commands、Edit Review、MCP server、项目记忆文件、图谱 Context Picker。

---

## A. 核心功能（MVP）缺口

### A2 上下文系统（Context System）
- **缺失**：自动摘要与 token 预算控制。
- **缺失**：每条上下文的启用/禁用开关。
- **缺失**：上下文占用的可视化拆分（按项）。

### A3 Edit / Patch（可审计写入）
- **缺失**：Patch Proposal 流程。
- **缺失**：统一 diff 预览（apply/reject/edit 流程）。
- **缺失**：审计日志（会话 ID、prompt 摘要、diff、时间戳）。
- **缺失**：apply 前文件 hash 校验。

### A4 终端执行（Terminal）
- **缺失**：终端命令执行能力（ACP/本地桥接）。
- **缺失**：权限分级与二次确认。
- **缺失**：输出折叠与审计记录。

### A5 TODO / Task 闭环
- **缺失**：同步到“当前 Note”选项。
- **缺失**：TODO 一键继续执行（绑定来源对话）。

---

## B. 进阶功能（Pro）缺口

### B1 编辑器内快捷入口
- **部分实现**：已支持“Send Selection to Claude Chat”“Quick Chat About Current Note”。
- **缺失**：选区解释/重写/生成测试等动作。
- **缺失**：Heading 级别总结/生成实现计划。
- **缺失**：整 Note 转换为 Spec/PRD 的快捷入口。

### B2 Slash Commands（Vault 驱动）
- **缺失**：读取 `.claude/commands/` 命令定义。
- **缺失**：参数支持与自动补全、命名空间。

### B3 Edit Review
- **缺失**：针对 diff 的目的/风险/验证建议生成。
- **缺失**：写回 Changelog/PRD/Review Note。

### B4 MCP（Client-side）
- **缺失**：MCP server 暴露 vault 工具（search/read/write/backlinks/list_by_tag）。
- **缺失**：权限校验与注册流程。

---

## C. Obsidian 原生差异化缺口

### C1 项目记忆文件（Project Memory）
- **缺失**：`CLAUDE.md` / `PROJECT.md` 自动维护。
- **缺失**：任务后更新提示/建议。

### C2 图谱 Context Picker
- **缺失**：基于反向链接/同 tag 的可视化 Context Picker。
- **缺失**：一键加入上下文。
