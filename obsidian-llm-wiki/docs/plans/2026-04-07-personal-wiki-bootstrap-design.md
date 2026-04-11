# obsidian-llm-wiki 精简与 LLM Wiki 转型设计

日期：2026-04-07

## 背景

obsidian-llm-wiki 当前功能杂乱，包含 Tag 管理、OCR、文件编辑、Chat 等多个不相关模块。需要精简为专注 LLM Wiki 工作流的插件，对齐 `skills/llm-wiki/SKILL.md` 定义的操作模式（init / ingest / query / lint / legacy scan）。

## 决策摘要

- 采用方案 C：Slash Commands + 轻量 Wiki 感知
- Chat 面板 slash commands 为主，配合一个轻量 wiki 操作面板
- 插件不实现 wiki 操作业务逻辑，只做 UI 和上下文注入，Agent 执行实际操作
- Wiki 状态通过自动检测 vault 目录结构判断，可在设置中覆盖路径

## 第一部分：删减

### 删除的文件

| 文件 | 原功能 |
|------|--------|
| `src/tag-view.ts` | Tag 侧边栏面板 |
| `src/tag-management-modal.ts` | Tag 管理弹窗 |
| `src/ocr-service.ts` | OCR 图片文字识别服务 |
| `src/ocr-result-modal.ts` | OCR 结果展示弹窗 |

### main.ts 中移除的内容

- `TagView`、`TAG_VIEW_TYPE` 的 import 和注册
- `OCRService`、`OCRResultModal` 的 import
- `ocrService`、`ocrStatusEl`、`ocrStatusClearTimer` 成员变量
- `registerEditorImageContextMenu()` 及其调用
- `resolveImageFileFromEditorContext()`、`runOCRForImage()`、`setOCRStatus()`、`isImageFile()`、`extractPathFromMarkdownLink()`、`isExternalUrl()` 方法
- Tag ribbon icon（`addRibbonIcon("tags", ...)`）
- Tag 相关 commands：`smart-tag-management`、`suggest-tags-for-current-note`
- `updateViewConnections()` 中 TagView 的更新逻辑
- Settings Tab 中 "Tag Management" toggle 和 "OCR Configuration" section

### settings.ts 中移除的配置

- `enabledFeatures.tagManagement`
- `enabledFeatures.metadataManagement`（无实际使用）
- `ocr` 整个配置块（host, apiKey, model）

## 第二部分：新增 — Wiki Detector

**文件：`src/wiki-detector.ts`**

检测当前 Vault 的 wiki 状态，提供给面板和 slash commands。

```typescript
interface WikiStatus {
  initialized: boolean;       // CLAUDE.md + wiki/ 都存在
  rootPath: string;           // wiki 根路径
  hasClaudeMd: boolean;
  hasWikiDir: boolean;
  hasIndexMd: boolean;
  hasLogMd: boolean;
  hasLegacyDir: boolean;
  rawSubdirs: string[];
  wikiSubdirs: string[];
  pageCount: number;          // wiki/ 下的 .md 文件数
  rawCount: number;           // raw/ 下的文件数
}
```

核心方法：

- `detect(): Promise<WikiStatus>` — 扫描 vault 返回状态
- `getClaudeMdContent(): Promise<string | null>` — 读取 CLAUDE.md 内容
- `getIndexContent(): Promise<string | null>` — 读取 index.md

检测逻辑：

1. 先检查设置中的 `wikiRootPath`，非空则用它做根路径
2. 否则用 vault 根目录
3. 检查 `{root}/CLAUDE.md` 和 `{root}/wiki/` 是否存在

## 第三部分：新增 — Wiki 操作面板

**文件：`src/wiki-panel.ts`**

替代原 TagView，注册为 `wiki-panel-view` 类型。

面板内容：

1. **Wiki 状态指示**：一行文字 — "Wiki initialized (42 pages, 15 sources)" 或 "Wiki not initialized"
2. **快捷操作按钮**：
   - **Init Wiki** — 仅未初始化时可用，点击后打开 Chat 面板并预填 `/init`
   - **Ingest** — 点击后弹出文件选择器（过滤 raw/ 目录），选好后预填 `/ingest raw/xxx/file.md`
   - **Lint** — 预填 `/lint`
   - **Scan Legacy** — 仅有 legacy/ 目录时可用，预填 `/scan`

面板不执行 wiki 操作，只是 Chat 面板的快捷入口。

## 第四部分：Chat Slash Commands 改造

### 新增的 slash commands

| Command | 行为 |
|---------|------|
| `/init` | 注入 wiki init 指令 + SKILL.md 定义的默认配置，让 Agent 初始化 wiki 骨架 |
| `/ingest <path>` | 注入 CLAUDE.md 规范 + 目标文件路径，让 Agent 执行 ingest |
| `/query <question>` | 注入 index.md 内容作为上下文，让 Agent 执行 query |
| `/lint` | 注入 CLAUDE.md + index.md，让 Agent 执行 lint |
| `/scan` | 注入 CLAUDE.md + legacy/ 文件列表，让 Agent 执行 legacy scan |

### 上下文注入格式

每个 wiki slash command 自动把 CLAUDE.md 规范注入消息：

```
[Wiki Operation: ingest]
Target: raw/tech/article-on-rag.md

---
Wiki Schema (from CLAUDE.md):
{CLAUDE.md 全文}
---

Please ingest this source file following the wiki schema above.
```

### 移除的 slash commands 内容

- chat-view.ts 的 `buildMentionSuggestions()` 中移除 tag 相关 suggestion

## 第五部分：Settings 变更

### 新增配置

```typescript
wikiRootPath: string;  // 默认 "" 表示 vault 根目录
```

### Settings Tab 变更

- 移除 "Tag Management" toggle
- 移除 "Metadata Management" toggle
- 移除 "OCR Configuration" section
- 新增 "Wiki Root Path" 文本框（在 Connection 设置之后、Feature toggles 之前）

## 第六部分：Manifest 变更

```json
{
  "description": "LLM Wiki — Build and maintain a personal wiki with LLM agents in Obsidian"
}
```

## 改动范围汇总

| 操作 | 文件 |
|------|------|
| 删除 | `src/tag-view.ts`, `src/tag-management-modal.ts`, `src/ocr-service.ts`, `src/ocr-result-modal.ts` |
| 大改 | `main.ts`（移除 tag/ocr，注册 wiki panel） |
| 大改 | `src/chat-view.ts`（新增 wiki slash commands） |
| 中改 | `src/settings.ts`（删旧加新） |
| 小改 | `manifest.json`（更新描述） |
| 新增 | `src/wiki-detector.ts` |
| 新增 | `src/wiki-panel.ts` |

不变的文件：`src/agent-connection.ts`、`src/claude-connection.ts`、`src/cursor-connection.ts`、`src/acp-client.ts`、`src/context-builder.ts`、`src/session-store.ts`、`src/todo-sync.ts`、`src/terminal-executor.ts`、`src/terminal-permission-modal.ts`、`src/unified-diff.ts`、`src/patch-modal.ts`、`src/vault-adapter.ts`、`src/chat-modal.ts`、`src/audit-log.ts`、`src/types.ts`
