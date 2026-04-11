# Notes: OCR Feature Implementation

## Scope
- User requested image OCR action from right-click context menu.
- OCR API must be OpenAI-like chat API.
- OCR config must be editable in plugin settings (host + API key).

## Implementation
- Added OCR settings model in `src/settings.ts`:
  - `ocr.host`
  - `ocr.apiKey`
  - `ocr.model`
- Added OCR API client in `src/ocr-service.ts`:
  - Reads image binary from vault
  - Converts to base64 data URL
  - Calls OpenAI-like `/v1/chat/completions`
  - Extracts text from `choices[0].message.content`
- Added OCR result modal in `src/ocr-result-modal.ts`:
  - Displays recognized text
  - Supports copy to clipboard
  - Supports inserting OCR text into active markdown note
- Integrated context menu in `main.ts`:
  - Registers `file-menu` action `OCR 文字识别` for image files
  - Runs OCR request and opens result modal
- Added OCR settings UI in `main.ts` settings tab.

## Validation
- `npm run build` passed after implementation.
