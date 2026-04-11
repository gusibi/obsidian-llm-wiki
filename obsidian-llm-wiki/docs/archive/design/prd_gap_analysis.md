# PRD Gap Analysis & Next Steps

## Scope
This document compares the current implementation in this repo with the PRD in `PRD.md`, then outlines the remaining work in a prioritized plan.

## Current Functionality (Observed)

### Core UI / Chat
- Chat sidebar (WorkspaceLeaf) with streaming responses and markdown rendering.
- Tool call + tool result UI with collapsible sections.
- Connection status indicator and current-file indicator.

### Sessions
- Session persistence in `.obsidian/claude/sessions/`.
- Session list/dropdown, New, and Fork controls.
- Current session pointer stored in `.obsidian/claude/current-session.json`.

### Context System
- Mentions parsing for `@search(...)`, `@tag(...)`, `@folder(...)`, `@Note`.
- Context bar shows selected items and token estimate.
- Context items are appended to the outgoing prompt.

### File I/O + Tags
- ACP client supports vault read/write + tags operations.
- Vault adapter abstraction for filesystem access.
- Tag analysis and suggestion UI.

### TODO Sync
- Extract TODO items from assistant responses.
- Append to `Agent Inbox.md` with timestamp and source note.

## PRD Coverage Summary

### MVP (A1-A5)
- A1 Chat panel: **Mostly covered** (streaming, markdown, tool logs, session controls).
- A2 Context system: **Partial** (mentions + basic token estimate; missing summaries, per-item toggles).
- A3 Edit/Patch flow: **Missing** (no patch proposal/diff preview/audit).
- A4 Terminal: **Missing** (no execution, permissions, or output UI).
- A5 TODO loop: **Partial** (inbox sync exists; no current-note option or click-to-resume).

### Pro (B1-B4)
- Editor quick actions: **Missing**.
- Slash commands from `.claude/commands/`: **Missing**.
- Edit review generation: **Missing**.
- MCP server exposure: **Missing**.

### Obsidian Differentiation (C1-C2)
- Project memory files (`CLAUDE.md` / `PROJECT.md`): **Missing**.
- Graph-based context picker: **Missing**.

## Detailed Gaps vs PRD

### 1) Auditability + Safe Writes (High Priority)
- No patch proposal or unified diff preview.
- No apply/reject/edit flow.
- No audit log with session ID + prompt summary + diff + timestamp.
- No file hash validation before apply.

### 2) Terminal Execution (High Priority)
- No terminal tool in ACP capabilities.
- No permission tiers (safe/test/danger) or confirmation flow.
- No terminal output panel or audit trail.

### 3) Context System Completeness (High Priority)
- Missing summarization + token budget management.
- Missing per-item enable/disable toggles in UI.
- Missing context usage breakdown by item.

### 4) TODO Loop Completion (Medium Priority)
- Only supports `Agent Inbox.md` target.
- Missing option to sync to current note.
- Missing click-to-resume action that binds to source conversation.

### 5) Session Metadata / Structure (Medium Priority)
- Session metadata limited to id/title/timestamps/messages.
- Missing context refs, tools used, todo list, tags, and per-vault grouping.
- No audit linkage or export log.

### 6) Pro Features (Medium Priority)
- Editor quick actions (selection/heading/note actions).
- Slash commands loading and autocomplete.
- Edit review generation (intent/risk/verify).
- MCP server exposure of vault tools.

### 7) Obsidian Differentiation (Lower Priority)
- Project memory files auto-maintain + update prompts.
- Graph-based context picker (backlinks + tag neighbors).

## Suggested Work Plan (Phased)

### Phase 1: MVP Hard Gaps (Audit + Terminal + Context Controls)
1. Patch proposal + diff preview UI
   - Unified diff generation for edits.
   - Apply/reject/edit flow with user confirmation.
   - Audit log file under `.obsidian/claude/audit/`.
2. Terminal execution tool
   - Add ACP terminal capability stubs.
   - Permission tier model with confirm dialogs.
   - Output panel + audit capture.
3. Context system completion
   - Per-item toggles + token budget UI.
   - Basic summarization or truncation policy.

### Phase 2: MVP Completion (TODO + Sessions)
1. TODO sync target selection
   - Current note or `Agent Inbox.md`.
   - Click-to-resume linkage (store message/session id).
2. Session metadata upgrades
   - Store context refs, tools used, todos, tags.
   - Optional per-vault grouping and list filters.

### Phase 3: Pro Features
1. Editor quick actions
2. Slash commands from `.claude/commands/` (params + autocomplete)
3. Edit review generation
4. MCP server exposure for vault tools

### Phase 4: Obsidian Differentiation
1. Project memory files (`CLAUDE.md` / `PROJECT.md`) maintenance + prompts
2. Graph-based context picker

## Open Questions
- Should terminal execution run via ACP client or a direct Obsidian-side runner?
- What minimum diff UX is acceptable for MVP (inline vs modal vs separate view)?
- Where should audit logs live (vault root vs `.obsidian/claude/`)?
- Is session storage scoped per vault already (Obsidian config), or should we add explicit vault IDs?

