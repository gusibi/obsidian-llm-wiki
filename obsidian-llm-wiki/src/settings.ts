export type TodoTarget = "inbox" | "current";
export type TerminalPolicy =
  | "prompt"
  | "allow-safe"
  | "allow-tests"
  | "allow-all";
export type ACPProvider = "claude" | "cursor" | "gemini";

export interface ClaudeACPSettings {
  agentProvider: ACPProvider;
  anthropicApiKey: string;
  claudeCodePath: string;
  cursorAgentPath: string;
  cursorConfigPath: string;
  cursorLogLevel: string;
  cursorSessionDir: string;
  cursorAdditionalArgs: string;
  cursorTimeoutMs: number;
  geminiApiKey: string;
  geminiAgentPath: string;
  wikiRootPath: string;
  enabledFeatures: {
    fileEditing: boolean;
  };
  contextTokenBudget: number;
  todoTarget: TodoTarget;
  terminalPolicy: TerminalPolicy;
  tagMergePrompt: string;
}

export const DEFAULT_SETTINGS: ClaudeACPSettings = {
  agentProvider: "claude",
  anthropicApiKey: "",
  claudeCodePath: "",
  cursorAgentPath: "",
  cursorConfigPath: "",
  cursorLogLevel: "",
  cursorSessionDir: "",
  cursorAdditionalArgs: "",
  cursorTimeoutMs: 0,
  geminiApiKey: "",
  geminiAgentPath: "",
  wikiRootPath: "",
  enabledFeatures: {
    fileEditing: true,
  },
  contextTokenBudget: 1200,
  todoTarget: "inbox",
  terminalPolicy: "prompt",
  tagMergePrompt: `你是一个标签体系整理专家。请分析以下标签列表，找出语义相同或高度相似的标签组，给出合并建议。

规则：
- 只建议真正语义相同/相似的标签合并，不要因为字符串部分重叠就建议合并
- 建议合并时，优先保留使用次数多的标签
- 考虑层级关系：如果扁平标签是某个层级标签的叶子，建议转为层级格式而非合并
- 每组合并建议需要给出理由

返回 JSON 数组，每个元素格式：
{
  "from": ["要被合并的标签列表"],
  "to": "合并后的目标标签",
  "reason": "合并理由",
  "confidence": "high/medium/low"
}

如果没有需要合并的标签，返回空数组 []

标签列表：
{{TAG_LIST}}`,
};