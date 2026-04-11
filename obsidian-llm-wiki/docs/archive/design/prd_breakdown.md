# PRD Gap Analysis & Breakdown

## Current Implementation vs PRD (Summary)

### Covered (Partial)
- Chat panel with streaming + markdown rendering + tool-call UI.
- ACP client with file read/write + tag operations.
- AI file edit flow (prompt-based), tag analysis view.
- Context mentions for `@search`, `@tag`, `@folder`, `@Note` with a context usage bar.
- Session persistence to `.obsidian/claude/sessions/current.json`.
- TODO extraction from assistant responses → `Agent Inbox.md`.

### Missing or Incomplete
- Session list/resume/fork UI and storage schema for multiple sessions.
- Full context system controls (token budgeting UI, enable/disable per item).
- Patch proposal + diff preview + apply/reject/edit flow with audit log.
- Terminal execution with permission tiers.
- Slash commands loaded from `.claude/commands/`.
- Edit review (risk/verification summary) generation.
- MCP server exposure for vault tools.
- Project memory files (`CLAUDE.md` / `PROJECT.md`) and update prompts.
- Graph-based context picker.

## PRD Breakdown (Epics → Tasks)

### Phase 1 (MVP)
1. Chat panel UX
   - Streaming output + markdown render
   - Session storage + session list
   - New / resume / fork session controls
2. Context system
   - Parse `@note`, `@tag`, `@search`, `@folder`
   - Token budget + per-item enable/disable
3. Patch & diff workflow
   - Agent patch proposal
   - Diff preview + apply/reject/edit
   - Audit logging with session id + prompt summary
4. TODO sync loop
   - Extract TODOs
   - Sync to current note or `Agent Inbox.md`
5. Terminal execution
   - Safe/test/danger tiers
   - Output folding + audit log

### Phase 2 (Pro)
1. Editor quick actions
   - Selection/heading/note actions
2. Slash commands
   - `.claude/commands/*.md` loading
   - Params + autocomplete
3. Edit review
   - Diff-based risk & verification suggestion
4. MCP client
   - Expose vault tools to ACP

### Phase 3 (Obsidian Differentiation)
1. Project memory files
   - Auto-maintain `CLAUDE.md`/`PROJECT.md`
2. Graph-based context picker
   - Backlinks / tag neighbors selection

## Implemented This Pass
- Context mentions and context usage bar UI.
- Session persistence for chat history.
- TODO extraction and inbox sync.

## Suggested Next Steps
- Add session list/resume/fork UI.
- Implement patch proposal + diff preview + audit log.
- Add terminal execution with permission prompts.
