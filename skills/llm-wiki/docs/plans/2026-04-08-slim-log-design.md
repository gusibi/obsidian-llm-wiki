# Slim Log Design

**Date**: 2026-04-08
**Status**: Implemented

## Problem

`log.md` is append-only and records every operation (ingest, query, lint). After one day of active use (12 ingests, 3 lints, 1 query), the file reached 564 lines. The primary bloat sources:

1. **Lint reports** — a single lint outputs 70-100 lines of detailed findings, recommended actions, and knowledge gap analysis. Three lints = ~250 lines, nearly half the file.
2. **Ingest entries with full file lists** — each ingest lists every created/updated filename (5-15 lines each), information already captured in `index.md`.
3. **Every query logged** — even queries with no lasting value get a multi-line entry.

At this rate, the file would reach ~100K lines in a year, making it impractical for LLM context windows.

## Design Goals

- Keep `log.md` as a slim, scannable timeline — LLM reads recent entries with `tail`, never full-loads
- Preserve all information (just store it in the right place)
- Stay compatible with the original llm-wiki pattern's `grep "^## \[" log.md | tail -5` design

## Solution

### 1. Slim log entries

**Ingest** — record Source + Impact numbers + Key insight. Drop the full "Pages created/updated" filename lists (already in `index.md` and git diff):

```markdown
## [2026-04-08] ingest | Harness Engineering
- Source: [[harness-engineering]]
- Impact: 1 summary created, 2 concepts updated, 1 entity created
- Key insight: 约束换信任是 harness 的核心逻辑
```

**Query** — only log queries that get filed as wiki pages:

```markdown
## [2026-04-08] query → filed | Harness Engineering 概述
- Filed as: [[harness-engineering-overview]]
- Pages consulted: 4
```

Unfiled queries produce no log entry.

**Lint** — log a summary line; full report goes elsewhere:

```markdown
## [2026-04-08] lint | Wiki 健康检查
- Pages scanned: 54
- Issues fixed: 3, pending: 7
- Report: [[lint-report]]
```

### 2. Lint reports separated to `wiki/lint-report.md`

Full lint reports are written to `wiki/lint-report.md`, overwritten each run (only latest kept). Historical reports are preserved via git version history. This removes the largest source of log bloat (~250 lines per day for an active user).

### 3. Tail-first reading strategy

LLM should never read `log.md` in full. Documented reading pattern:

```bash
grep "^## \[" log.md | tail -5    # last 5 operation titles
tail -30 log.md                    # recent detail
```

Only read further back for specific historical lookups.

## Impact Estimate

| Metric | Before | After |
|--------|--------|-------|
| One day log growth | ~300 lines | ~60 lines |
| One month | ~9000 lines | ~1800 lines |
| One year | ~100K lines | ~20K lines |

## Files Modified

- `CLAUDE.md` — log format for ingest/query/lint, lint-report.md, reading strategy, rule 11
- `README.md` — query workflow description, log description in directory tree and data flow
- `SKILL.md` — operate mode query/lint descriptions, key principles, init log.md template
- `assets/templates/CLAUDE.md.tmpl` — same changes as CLAUDE.md (English template)
- `assets/templates/README.md.tmpl` — same changes as README.md (English template)

## Compatibility

Fully compatible with the original `llm-wiki.md` pattern:
- Log remains append-only and chronological
- `## [YYYY-MM-DD] type | title` prefix preserved for grep/tail parsing
- Log still serves its core purpose: "helps the LLM understand what's been done recently"
- No hard rules from the original pattern are violated
