# 🔧 安装、连接与故障排除指南

本指南将帮助你完成 Claude ACP 插件的安装、配置并解决可能遇到的连接问题。

---

## ✅ 快速安装（已有 Claude CLI）

如果你已经在系统级安装了 Claude CLI 并完成了配置：

1. **设置 Claude Code Path**:
   在 Obsidian 设置中，将 **Claude Code Path** 设置为 `claude-code-acp`。
2. **API Key**:
   可以留空（插件将尝试使用 CLI 已有的环境变量或配置）。
3. **测试连接**:
   点击设置页面中的 **"Test Connection"**。

---

## 🔍 连接验证流程

### 设置项说明
- **Agent Provider**: 选择 `Claude Code` 或 `Cursor Agent`。
- **Anthropic API Key**: 你的 API 密钥（可选，取决于是否通过本地环境变量提供）。
- **Claude Code Path**: 指向 `claude-code-acp` 可执行文件的完整路径（如果在 PATH 中，只需填写命令名）。

### 验证步骤
1. 打开 **Obsidian 设置** → **Claude ACP**。
2. 配置上述路径或密钥。
3. 点击 **"Test Connection"**。
4. **绿色状态指示器**: 侧边栏显示 "● Connected" 即为成功。

---

## 🆘 常见问题与故障排除

### 1. **找不到可执行文件 (ENOENT)**
```
错误提示: "Claude Code executable not found"
```
**解决方案**:
- 检查路径是否正确：终端运行 `which claude-code-acp` 获取路径。
- 确保已全局安装：`npm install -g @agentclientprotocol/claude-agent-acp`。

### 2. **权限不足 (EACCES)**
```
错误提示: "Permission denied"
```
**解决方案**:
- 给予执行权限：`chmod +x /path/to/claude-code-acp`。
- 检查 API 密钥权限。

### 3. **连接超时 (Initialization timeout)**
```
错误提示: "Initialization timeout reached"
```
**解决方案**:
- 检查网络是否能访问 Anthropic API。
- 确认 `claude-code-acp` 启动时是否因为某些交互提示（如更新提示）卡住。
- 检查 API 密钥是否有效：`echo $ANTHROPIC_API_KEY`。

---

## 🛠️ 调试步骤

如果你点击 "Test Connection" 后没有任何反馈：

1. **打开控制台**: 在 Obsidian 中按 `Ctrl + Shift + I` (Windows/Linux) 或 `Cmd + Option + I` (Mac)。
2. **查看 Console 标签**: 寻找带有 `Claude ACP:` 前缀的日志。
3. **手动验证**:
   在系统终端中运行以下命令，确保环境本身是通的：
   ```bash
   claude-code-acp --version
   claude-code-acp --help
   ```

## 🚀 进阶：使用不同启动方式

- **方式 1（推荐）**: 直接使用命令名（确保在 PATH 中）。
- **方式 2**: 使用 `npx` (在路径处填入 `npx @agentclientprotocol/claude-agent-acp`)。
- **方式 3**: 使用绝对路径 (如 `/usr/local/bin/claude-code-acp`)。

---

**现在你可以开始使用 Claude ACP 的强大功能了！** 🚀
