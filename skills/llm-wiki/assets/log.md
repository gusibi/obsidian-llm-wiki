# Wiki 操作日志

> Append-only 精简操作时间线。读取时用 `grep "^## \[" log.md | tail -5`，不要全量加载。

---

## [2026-04-07] ingest | Pi: The Minimal Agent Within OpenClaw
- Source: [[Pi The Minimal Agent Within OpenClaw]]
- Impact: 1 summary created, 3 concepts created, 5 entities created
- Key insight: Pi 通过极小核心（4个工具）+ 自扩展哲学 + Session 树结构，展示了一种与 MCP 不同的代理架构思路。

---

## [2026-04-08] ingest | 模型不是关键，Harness 才是
- Source: [[模型不是关键，Harness 才是]]
- Impact: 1 summary created, 8 concepts created, 12 entities created
- Key insight: Harness Engineering 是 2026 年 AI 工程圈最热话题，同一模型仅改变 Harness 可使编程基准成功率翻倍（42%→78%），证明约束系统和环境管理比模型能力本身更关键。

---

## [2026-04-08] ingest | 工程技术：在智能体优先的世界中利用 Codex
- Source: [[工程技术：在智能体优先的世界中利用 Codex]]
- Impact: 1 summary created, 2 concepts created, 3 entities created, 2 pages updated
- Key insight: OpenAI Codex 团队的完整实践展示了从零开始完全由 AI 构建软件产品的可行性，证明了代码仓库作为记录系统、智能体可读性优先、以及黄金原则等实践的重要性。

---

## [2026-04-08] lint | Wiki 健康检查
- Pages scanned: 42
- Issues fixed: 4, pending: 7
- Report: [[lint-report]]

---

## [2026-04-08] ingest | AI 常见名词解释
- Source: [[AI 常见名词解释]]
- Impact: 1 summary created, 12 concepts created, 2 concepts updated
- Key insight: 综合 AI 术语解释涵盖从基础概念到训练技术再到 AI 工程和前沿概念，并提供中文语境下三种 Engineering 的详细对比。

---

## [2026-04-08] lint | Wiki 健康检查（续）
- Pages scanned: 52
- Issues fixed: 2, pending: 14
- Report: [[lint-report]]

---

## [2026-04-08] lint | Wiki 健康检查（第三次）
- Pages scanned: 54
- Issues fixed: 1, pending: 8
- Report: [[lint-report]]

---

## [2026-04-08] ingest | Harness Engineering (Martin Fowler 版)
- Source: [[Harness Engineering]]
- Impact: 1 summary created, 1 concept updated, 1 entity updated
- Key insight: Thoughtworks 工程师 Birgitta Böckeler 的分析补充了服务模板类比、技术栈收敛假设、旧代码改造挑战等重要视角，强调约束换信任的核心洞察。

---

## [2026-04-08] ingest | Anthropic 的长期运行应用 Harness 设计
- Source: [[Harness design for long-running application development]]
- Impact: 1 summary created, 2 entities created, 1 concept updated
- Key insight: Anthropic Labs 展示了 GAN 风格多 Agent 系统（Generator-Evaluator 架构），单 Agent 成本 $9 产出 broken，完整 Harness 成本 $200 产出可运行游戏，证明分离工作与评估是解决 Agent 自我评估过松的关键。

---

## [2026-04-08] ingest | How I write software with LLMs
- Source: [[How I write software with LLMs - Stavros' Stuff]]
- Impact: 1 summary created, 2 concepts created, 1 entity created
- Key insight: Stavros Korokithakis 的实践展示了多模型分工（Architect-Developer-Reviewer 模式）的有效性，人类监督粒度从「每行代码」演进到「架构级别」。

---

## [2026-04-08] ingest | 解锁 Codex 运行框架
- Source: [[解锁 Codex 运行框架：我们如何构建 App Server]]
- Impact: 1 summary created, 2 concepts created, 1 entity created
- Key insight: OpenAI 的 Codex App Server 展示了如何通过 JSON-RPC 协议 + 对话原语将智能体循环嵌入多种客户端，是 Harness 的具体协议实现。

---

## [2026-04-08] ingest | Harness Engineering 综合分析（Gemini）
- Source: [[Harness Engineering：AI 编程领域的范式革命与系统架构分析 - Gemini]]
- Impact: 1 summary created, 1 concept updated
- Key insight: Gemini 的综合分析提出从"代码生成"到"环境工程"的范式转变，补充了演进阶段对比、幂次法则、安全挑战和未来展望。

---

## [2026-04-08] ingest | I Improved 15 LLMs at Coding
- Source: [[I Improved 15 LLMs at Coding in One Afternoon. Only the Harness Changed.]]
- Impact: 1 summary created, 1 concept created, 1 entity created
- Key insight: Can Bölük 证明仅改变 harness 就让 Grok Code Fast 1 从 6.7% 提升到 68.3%（十倍），harness 是比模型更大的瓶颈。

---

## [2026-04-08] ingest | Harness Engineering（Perplexity 版）
- Source: [[Harness Engineering（线束工程）的方法论、实践、起源与发展趋势 - perplexity]]
- Impact: 1 summary created, 1 concept updated
- Key insight: Perplexity 总结了 Constrain/Inform/Verify/Correct 四件事方法论，以及内环/外环/背景环的多层循环结构，强调 harness 是"代码化约束"而非 wiki 文档。

---

## [2026-04-08] ingest | AI 工程的真实代价（Claude Code 泄露源码分析）
- Source: [[AI 工程的真实代价：从 Claude Code 泄露源码看新模型接入的工程现实]]
- Impact: 1 summary created, 2 concepts created, 1 entity created
- Key insight: Claude Code 泄露源码揭示了新模型接入 agentic 系统的真实工程代价：反蒸馏三层防线、50K-70K token 缓存成本、5 个模型行为边界案例，展示了"模型能力快速进步 vs 系统接入成本以不同速率增长"的悖论。

---

## [2026-04-08] ingest | Writing a good CLAUDE.md
- Source: [[Writing a good CLAUDE]]
- Impact: 1 summary created, 2 concepts created, 1 entity created
- Key insight: CLAUDE.md 最佳实践：LLM 无状态导致需要显式管理上下文，前沿模型约能可靠遵循 150-200 条指令，应遵循"少即是多"原则，使用渐进式披露策略。

---

## [2026-04-08] ingest | Codex Best Practices
- Source: [[Codex Best practices]]
- Impact: 1 summary created, 3 concepts created, 1 entity created
- Key insight: Codex 最佳实践核心思想是把 AI 助手当作需要配置和改进的队友，AGENTS.md 是 CLAUDE.md 的开源替代，Skills 封装方法，Automations 定义调度。

---

## [2026-04-08] ingest | 5 Agent Skill design patterns every ADK developer should know
- Source: [[5 Agent Skill design patterns every ADK developer should know]]
- Impact: 1 summary created, 6 concepts created, 2 entities created
- Key insight: ADK Skill 设计从格式标准化转向内容设计，五种模式（Tool Wrapper/Generator/Reviewer/Inversion/Pipeline）解决了如何结构化 Skill 内部逻辑的核心挑战。

---

## [2026-04-08] query → filed | Harness Engineering 概述
- Filed as: [[harness-engineering-overview]]
- Pages consulted: 4

---

## [2026-04-08] ingest | 用 LLM + Obsidian 构建个人知识库
- Source: [[用 LLM + Obsidian 构建个人知识库：基于 Karpathy 的"LLM Knowledge Bases"工作流]]
- Impact: 1 summary created, 2 concepts created, 1 entity created, 1 entity updated
- Key insight: Karpathy 提出将知识库类比为代码仓库的核心隐喻——原始资料是源代码，知识条目是编译产物，LLM 是编译器，Obsidian 是 IDE；关键原则是"别让你的笔记腐烂，让它们被编译"。
