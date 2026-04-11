# Project Roadmap & Gap Analysis

## 🎯 当前实现状态 (Current Implementation)

### 已覆盖 (Covered)
- **Chat 面板**: 流式输出、Markdown 渲染、工具日志。
- **会话管理**: 基本会话持久化与列表切换。
- **上下文系统**: 支持 `@Note`, `@Tag`, `@Search`, `@Folder` 的解析。
- **文件 IO**: 通过 ACP client 进行 Vault 读写。
- **TODO 同步**: 从回复中提取 TODO 并同步到 `Agent Inbox.md`。

---

## 🚧 待开发功能 (Missing Features)

### 高优先级 (High Priority)
1. **Patch & Diff 流程**: 
   - 实时 Diff 预览
   - Apply/Reject 确认弹窗
   - 审计日志文件输出
2. **终端执行**:
   - 后台命令执行与输出回传
   - 权限分级 (Prompt-based)
3. **上下文增强**:
   - 上下文项的单项开关
   - Token 预算精准控制

### 中优先级 (Medium Priority)
1. **TODO 闭环增强**:
   - 支持同步到“当前笔记”
   - 点击 TODO 快速恢复对话
2. **编辑器快捷操作**:
   - 选区重写、Heading 总结等快捷动作

### 低优先级 / 未来方向 (Long-term)
1. **项目记忆管理**: 自动维护 `CLAUDE.md`
2. **图谱联动**: 知识图谱 Context Picker
3. **MCP Server**: 将 Obsidian 能力暴露给 Agent

---

## 📈 里程碑规划 (Milestones)

### Phase 1: MVP Hard Gaps (Audit + Terminal)
- [ ] 完整的 Patch / Diff 工作流
- [ ] 终端权限提示系统
- [ ] 增强型会话元数据存储

### Phase 2: Pro Features
- [ ] 编辑器快捷入口
- [ ] Slash Commands 加载机制
- [ ] MCP Server 支持
