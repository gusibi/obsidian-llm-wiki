export type TodoTarget = "inbox" | "current";
export type TerminalPolicy =
  | "prompt"
  | "allow-safe"
  | "allow-tests"
  | "allow-all";
export type ACPProvider = "claude" | "cursor";

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
  wikiRootPath: string;
  enabledFeatures: {
    fileEditing: boolean;
  };
  contextTokenBudget: number;
  todoTarget: TodoTarget;
  terminalPolicy: TerminalPolicy;
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
  wikiRootPath: "",
  enabledFeatures: {
    fileEditing: true,
  },
  contextTokenBudget: 1200,
  todoTarget: "inbox",
  terminalPolicy: "prompt",
};
