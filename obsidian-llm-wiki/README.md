# Claude Code for Obsidian (Claude ACP)

Bring the power of [Claude Code](https://github.com/anthropics/claude-code) and Cursor Agent to your Obsidian vault.

This plugin allows you to interact with your Obsidian notes using AI agents via the **Agent Client Protocol (ACP)**. It turns your vault into a long-term project memory for the agent, enabling it to read, write, and reason about your notes with full context.

## ✨ Features

- **Agent Chat Panel**: A dedicated sidebar for streaming conversations with Claude or Cursor.
- **Deep Context Integration**: Mention notes, folders, tags, or search results using `@` in your prompts to provide precise context.
- **AI File Editing**: Ask Claude to refactor, rewrite, or improve your current note directly.
- **Smart Session Management**: Persistent chat history with support for forking sessions.
- **TODO Sync**: Automatically extracts TODO items from AI responses and syncs them to your notes or an `Agent Inbox.md`.
- **Terminal Integration (WIP)**: Execute safe terminal commands (like tests or builds) directly from the agent.
- **Audit Logging**: All AI operations are traceable and auditable.

## 🚀 Getting Started

### 1. Prerequisites
- [Claude Code](https://github.com/anthropics/claude-code) or Cursor installed locally.
- `claude-code-acp` or `cursor-agent-acp` installed:
  ```bash
  npm install -g @zed-industries/claude-code-acp
  ```

### 2. Installation
- Clone this repository into your Obsidian plugins folder.
- Run `npm install && npm run build`.
- Enable "Claude ACP" in Obsidian settings.

### 3. Configuration
- Open Obsidian Settings → Claude ACP.
- Set your **Agent Provider** (Claude or Cursor).
- Provide the path to the ACP executable (e.g., `claude-code-acp`).
- (Optional) Provide your Anthropic API Key if not configured in your environment.

## ⌨️ Shortcuts & Commands

| Command | Action | Recommended Shortcut |
|---------|--------|----------------------|
| `Open Claude Chat` | Opens the AI sidebar | `Cmd + Shift + C` |
| `AI Edit Current File` | Triggers AI editing on active note | `Cmd + Shift + E` |
| `Quick Chat About Note` | Start chat with current note context | `Cmd + Alt + C` |
| `Send Selection to Chat` | Sends highlighted text to AI | `Cmd + Shift + S` |

## 📂 Documentation

- [Setup & Troubleshooting](docs/user-guide/setup.md)
- [Shortcuts Guide](docs/user-guide/shortcuts.md)
- [Project PRD](docs/development/prd.md)
- [Roadmap](docs/development/roadmap.md)
- [Agent Instructions](docs/development/agent-instructions.md)

## 📄 License

MIT
