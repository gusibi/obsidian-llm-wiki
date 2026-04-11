# Task Plan: Add Image OCR via OpenAI-like Chat API

## Goal
Add image OCR capability in the plugin with right-click action on image files and configurable OCR host/API key/model in settings.

## Phases
- [x] Phase 1: Plan and setup
- [x] Phase 2: Research existing architecture
- [x] Phase 3: Implement OCR service, UI action, and settings
- [x] Phase 4: Verify build and deliver

## Key Questions
1. Where to trigger OCR from user workflow?
2. How to call OpenAI-like chat completions with image input?
3. How to present OCR result for reuse?

## Decisions Made
- Register OCR action on Obsidian `file-menu` context menu for image files.
- Add OCR config fields under settings: host, API key, model.
- Call OpenAI-like endpoint `/v1/chat/completions` using `requestUrl`.
- Display OCR text in a result modal with copy and insert-to-note actions.

## Errors Encountered
- None

## Status
**Done** - OCR feature implemented and build passes.
