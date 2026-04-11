---
title: Wiki 健康检查报告
tags: [lint, maintenance]
updated: 2026-04-08
---

# Wiki 健康检查报告

> 最近一次 lint：2026-04-08（第三次）。此文件每次 lint 覆盖写入，历史版本通过 git 保留。

## 总览

- **总页面数**: 54（4 摘要 + 26 概念 + 24 实体）
- **已修复**: 累计 8 个问题（含历次 lint）
- **待处理**: 8 个

## 已修复问题（历次 lint 累计）

1. 缺失 sources 字段：Minimal Agent Philosophy、Mario Zechner、Peter Steinberger、Session Trees、Self-Extending Agents — 已添加
2. Armin Ronacher 文件内容错误（实际包含 Self-Extending Agents 内容）— 已删除错误文件，创建正确的 `armin-ronacher.md`
3. 重复文件 `armin-ronacher-fixed.md` — 已清理

## 待处理问题

### 1. 文件名不一致

部分实体文件名包含空格，与 kebab-case 规范不一致：

- `wiki/entities/Mario Zechner.md` → `mario-zechner.md`
- `wiki/entities/Peter Steinberger.md` → `peter-steinberger.md`

### 2. 缺失实体/概念页面

| 页面 | 引用次数 | 优先级 |
|------|----------|--------|
| [[Agent]] | 30+ | 高 |
| [[LLM]] | 20+ | 高 |
| [[MCP]] | 15+ | 高 |
| [[Model]] | 15+ | 高 |
| [[Fine-tuning]] | 8+ | 高 |
| [[Flask]] | 5+ | 高 |
| [[RLHF]] | 5+ | 高 |
| [[HashiCorp]] | 3+ | 中 |
| [[Terraform]] | 3+ | 中 |
| [[Shopify]] | 3+ | 中 |
| [[Box]] | 2 | 中 |
| [[Martin Fowler]] | 2 | 中 |
| [[mom]] | 2 | 低 |
| [[Software Building Software]] | 1 | 低 |

### 3. 来源标注缺失

以下页面的正文缺少 `(source: [[summary-xxx]])` 行内引用：

- `wiki/concepts/Minimal Agent Philosophy.md`
- `wiki/concepts/Session Trees.md`
- `wiki/concepts/Self-Extending Agents.md`
- `wiki/entities/Pi.md` — 同时缺少 sources 字段
- `wiki/entities/OpenClaw.md` — 同时缺少 sources 字段

### 4. 孤立页面

- `wiki/entities/aardvark.md` — 仅 1-2 个入链
- `wiki/entities/victor-zhu.md` — 仅 1-2 个入链
- `wiki/entities/zach-brock.md` — 仅 1-2 个入链
- `wiki/entities/llamaindex.md` — 仅 1-2 个入链

### 5. sources 字段格式不一致

部分页面混用不同格式：
- `[[模型不是关键，Harness 才是]]`（无前缀）
- `[[raw/tech/模型不是关键，Harness 才是.md]]`（有 raw 前缀）
- `[[pi-minimal-agent-openclaw]]`（无后缀）

建议统一为纯文件名 wikilink 格式。

### 6. 矛盾与陈旧内容

- 未发现矛盾，无需 `> [!warning]` 标记
- Big Model vs Big Harness 的观点差异已通过 [[guardrail-paradox]] 妥善呈现
- 未发现陈旧内容，所有概念均为 2026 年最新

## 知识空白

1. **Pi 具体实现** — 自扩展代码示例
2. **Session Trees 技术细节** — 树状会话数据结构
3. **Harness 对比分析** — OpenAI vs Stripe vs Cursor 的具体技术差异
4. **MCP 深入解析** — Protocol 细节和实现
5. **Evals 实践** — 自动化评估框架

## 推荐操作

**高优先级**:
1. 创建核心概念页面：LLM、Agent、Model、Fine-tuning、RLHF、MCP
2. 补充 Pi 和 OpenClaw 的 sources 字段
3. 为早期概念页面添加行内来源引用

**中优先级**:
1. 创建 Flask、HashiCorp、Terraform、Shopify 实体页面
2. 重命名包含空格的实体文件
3. 增加孤立页面的交叉引用

**低优先级**:
1. 统一 sources 字段格式
2. 补充技术实现细节
3. 创建对比分析页面（如 Fine-tuning vs RAG）
