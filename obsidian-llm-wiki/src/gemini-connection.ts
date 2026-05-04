import { spawn, ChildProcess } from "child_process";
import { App, Notice } from "obsidian";
import { ACPClient } from "./acp-client";
import {
  ACPConfigOption,
  ACPModelOption,
  parseAvailableModels,
  parseConfigOptions,
  parseCurrentModelId,
} from "./agent-connection";
import { ACPRequest, ACPResponse } from "./types";
import { ClaudeACPSettings } from "./settings";

export class GeminiConnection {
  private app: App;
  private apiKey: string;
  private geminiAgentPath: string;
  private geminiProcess: ChildProcess | null = null;
  private acpClient: ACPClient;
  private messageHandlers: Map<string, (response: ACPResponse) => void> =
    new Map();
  private messageRejectors: Map<string, (error: Error) => void> = new Map();
  private messageId = 0;
  private currentSessionId: string | null = null;
  private activePromptRequestId: string | null = null;
  private updateHandlers: ((update: any) => void)[] = [];
  private availableModels: ACPModelOption[] = [];
  private currentModelId: string | null = null;
  private configOptions: ACPConfigOption[] = [];
  private modelListeners: Set<(models: ACPModelOption[]) => void> = new Set();
  private configListeners: Set<(options: ACPConfigOption[]) => void> =
    new Set();
  // No chat timeout — tasks may run for hours
  private stdoutBuffer = "";

  constructor(
    app: App,
    apiKey: string,
    geminiAgentPath: string = "",
    settingsProvider: () => ClaudeACPSettings,
  ) {
    this.app = app;
    this.apiKey = apiKey;
    this.geminiAgentPath = geminiAgentPath;
    this.acpClient = new ACPClient(app, settingsProvider);
  }

  async connect(): Promise<boolean> {
    if (!this.apiKey && !this.geminiAgentPath) {
      throw new Error(
        "Please set either Anthropic API key or Gemini Agent path in settings",
      );
    }

    await this.acpClient.initialize();
    return await this.startGeminiAgent();
  }

  private async startGeminiAgent(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        let command: string;
        let args: string[] = [];

        if (this.geminiAgentPath && this.geminiAgentPath.trim()) {
          if (this.geminiAgentPath.includes(" ")) {
            const parts = this.geminiAgentPath.split(" ");
            command = parts[0];
            args = parts.slice(1);
          } else {
            command = this.geminiAgentPath;
            args = ["--acp"];
          }
        } else {
          command = "gemini";
          args = ["--acp"];
        }

        // Ensure Node.js is in PATH for the spawned process
        const nodePath = "/opt/homebrew/bin";
        const currentPath = process.env.PATH || "";
        const enhancedPath = `${nodePath}:${currentPath}`;

        if (command.endsWith("gemini")) {
          // just spawn as is
        }

        const spawnOptions: import("child_process").SpawnOptions = {
          env: this.apiKey
            ? {
                ...process.env,
                GEMINI_API_KEY: this.apiKey,
                PATH: enhancedPath,
              }
            : { ...process.env, PATH: enhancedPath },
          stdio: ["pipe", "pipe", "pipe"],
          shell: false,
          detached: false,
        };

        this.geminiProcess = spawn(command, args, spawnOptions);

        if (!this.geminiProcess) {
          resolve(false);
          return;
        }

        this.geminiProcess.on("error", (error: any) => {
          console.error("Gemini ACP: Process error:", error);
          this.rejectAllPendingMessages(
            new Error(`Gemini Agent process error: ${error?.message || String(error)}`),
          );
          resolve(false);
        });

        this.geminiProcess.on("exit", (code, signal) => {
          this.rejectAllPendingMessages(
            new Error(
              `Gemini Agent process exited${code !== null ? ` with code ${code}` : ""}${signal ? ` (${signal})` : ""}`,
            ),
          );
          if (code !== 0) {
            resolve(false);
          }
        });

        if (this.geminiProcess.stdout) {
          this.geminiProcess.stdout.on("data", (data) => {
            const dataStr = data.toString();
            this.handleACPMessages(dataStr);
          });
        }

        if (this.geminiProcess.stderr) {
          this.geminiProcess.stderr.on("data", (data) => {
            const stderrText = data.toString();
            // Only log actual errors, not debug info
            if (
              stderrText.toLowerCase().includes("error") ||
              stderrText.toLowerCase().includes("failed")
            ) {
              console.error("Gemini Agent stderr:", stderrText);
            }
          });
        }

        const initMessage = JSON.stringify({
          jsonrpc: "2.0",
          id: ++this.messageId,
          method: "initialize",
          params: {
            protocolVersion: 1,
            clientInfo: {
              name: "gemini acp",
              version: "0.1.0",
            },
            capabilities: {
              tools: true,
              files: true,
              tags: true,
            },
          },
        });

        // Set up handler for initialization response
        const initId = this.messageId.toString();
        let initResolved = false;

        this.messageHandlers.set(initId, (response: any) => {
          clearTimeout(initTimeout);

          if (response.error) {
            initResolved = true;
            resolve(false);
            return;
          }

          // Initialization successful - resolve immediately
          initResolved = true;
          resolve(true);
        });

        this.geminiProcess.stdin?.write(initMessage + "\n");

        const initTimeout = setTimeout(() => {
          if (!initResolved) {
            resolve(false);
          }
        }, 10000);

        this.geminiProcess.on("exit", (code, signal) => {
          clearTimeout(initTimeout);
          if (code === 0) {
            resolve(true);
          } else {
            resolve(false);
          }
        });
      } catch (spawnError) {
        console.error("Gemini ACP: Spawn failed:", spawnError);
        resolve(false);
      }
    });
  }

  private handleACPMessages(data: string) {
    this.stdoutBuffer += data;
    const lines = this.stdoutBuffer.split("\n");
    // Keep the last element — it may be an incomplete line
    this.stdoutBuffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let message: any;
      try {
        message = JSON.parse(trimmed);
      } catch (error) {
        // If Gemini CLI prints raw text to stdout in ACP mode, treat it as a message chunk
        // rather than throwing a scary JSON parse error.
        message = {
          method: "session/update",
          params: {
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { text: trimmed + "\\n" }
            }
          }
        };
      }

      if (message.id && this.messageHandlers.has(message.id.toString())) {
        const messageId = message.id.toString();
        const handler = this.messageHandlers.get(messageId);
        if (handler) {
          handler(message);
          this.clearPendingMessage(messageId);
        }
      } else if (message.method === "session/update") {
        this.handleSessionUpdate(message);
      } else if (message.method) {
        this.handleIncomingRequest(message);
      }
    }
  }

  private handleSessionUpdate(message: any) {
    const { params } = message;
    if (params && params.update) {
      const sessionUpdate = params.update?.sessionUpdate;
      if (
        sessionUpdate === "current_model_update" ||
        sessionUpdate === "available_models_update"
      ) {
        this.updateModelsFromResponse(params.update);
      }
      if (
        sessionUpdate === "config_options_update" ||
        sessionUpdate === "current_config_update"
      ) {
        this.updateConfigOptionsFromResponse(params.update);
      }
      if (this.isDebugLoggingEnabled()) {
        const timestamp = new Date().toISOString();
        console.log(
          `[${timestamp}] [Gemini ACP] session/update:`,
          params.update,
        );
      }
      // Notify all registered update handlers
      for (const handler of this.updateHandlers) {
        handler(params.update);
      }
    }
  }

  private updateModelsFromResponse(result: any) {
    const parsed = parseAvailableModels(result);
    const current = parseCurrentModelId(result);
    let changed = false;
    if (parsed.length > 0) {
      this.availableModels = parsed;
      changed = true;
    }
    if (current) {
      this.currentModelId = current;
      changed = true;
    }
    if (changed) {
      this.notifyModelListeners();
    }
  }

  private updateConfigOptionsFromResponse(result: any) {
    const parsed = parseConfigOptions(result);
    if (parsed.length === 0) return;
    this.configOptions = parsed;
    this.notifyConfigListeners();
  }

  private notifyModelListeners() {
    const snapshot = [...this.availableModels];
    for (const handler of this.modelListeners) {
      handler(snapshot);
    }
  }

  private notifyConfigListeners() {
    const snapshot = [...this.configOptions];
    for (const handler of this.configListeners) {
      handler(snapshot);
    }
  }

  getAvailableModels(): ACPModelOption[] {
    return [...this.availableModels];
  }

  getCurrentModelId(): string | null {
    return this.currentModelId;
  }

  onModelsUpdated(handler: (models: ACPModelOption[]) => void): () => void {
    this.modelListeners.add(handler);
    if (this.availableModels.length > 0) {
      handler([...this.availableModels]);
    }
    return () => {
      this.modelListeners.delete(handler);
    };
  }

  async setSessionModel(modelId: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error("Gemini Agent not connected");
    }
    if (!this.currentSessionId) {
      await this.createSession();
    }
    const response = await this.sendMessage({
      method: "session/set_model",
      params: {
        sessionId: this.currentSessionId,
        modelId,
      },
    });
    if (response.error) {
      throw new Error(response.error.message);
    }
    this.currentModelId = modelId;
    this.notifyModelListeners();
  }

  getConfigOptions(): ACPConfigOption[] {
    return [...this.configOptions];
  }

  onConfigOptionsUpdated(
    handler: (options: ACPConfigOption[]) => void,
  ): () => void {
    this.configListeners.add(handler);
    if (this.configOptions.length > 0) {
      handler([...this.configOptions]);
    }
    return () => {
      this.configListeners.delete(handler);
    };
  }

  async setSessionConfigOption(configId: string, value: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error("Gemini Agent not connected");
    }
    if (!this.currentSessionId) {
      await this.createSession();
    }
    const response = await this.sendMessage({
      method: "session/set_config_option",
      params: {
        sessionId: this.currentSessionId,
        configId,
        value,
      },
    });
    if (response.error) {
      throw new Error(response.error.message);
    }
    const existing = this.configOptions.find((opt) => opt.id === configId);
    if (existing) {
      existing.currentValue = value;
    }
    this.updateConfigOptionsFromResponse(response.result);
    if (!response.result?.configOptions) {
      this.notifyConfigListeners();
    }
  }

  private isDebugLoggingEnabled(): boolean {
    try {
      const storage = (globalThis as any)?.localStorage;
      return !!storage?.getItem("gemini-acp-debug");
    } catch {
      return false;
    }
  }

  onUpdate(handler: (update: any) => void) {
    this.updateHandlers.push(handler);
    return () => {
      const index = this.updateHandlers.indexOf(handler);
      if (index > -1) {
        this.updateHandlers.splice(index, 1);
      }
    };
  }

  private async handleIncomingRequest(request: any) {
    try {
      if (request.method === "session/request_permission") {
        const toolName =
          request.params?.toolCall?.title ||
          request.params?.toolCall?.toolName ||
          "Tool";
        for (const handler of this.updateHandlers) {
          handler({
            sessionUpdate: "permission_request",
            toolName,
            toolCall: request.params?.toolCall,
          });
        }
      }

      const response = await this.acpClient.handleRequest(request);

      if (request.method === "session/request_permission") {
        const approved =
          !response.error &&
          response.result?.outcome?.optionId !== "reject" &&
          response.result?.outcome?.optionId !== "deny" &&
          response.result?.outcome?.optionId !== "cancel";
        for (const handler of this.updateHandlers) {
          handler({
            sessionUpdate: "permission_result",
            approved,
            toolName:
              request.params?.toolCall?.title ||
              request.params?.toolCall?.toolName,
          });
        }
      }

      if (this.geminiProcess?.stdin) {
        const responseStr = JSON.stringify(response) + "\n";
        this.geminiProcess.stdin.write(responseStr);
      } else {
        console.error("Gemini ACP: geminiProcess.stdin is null!");
      }
    } catch (error) {
      console.error("Gemini ACP: Error in handleIncomingRequest:", error);
      if (error instanceof Error) {
        console.error("Gemini ACP: Error message:", error.message);
      }
    }
  }

  private setupMessageHandlers() {
    this.setupConnectionMonitoring();
  }

  private setupConnectionMonitoring() {
    // 简化的连接监控，避免循环引用
  }

  async sendMessage(request: Partial<ACPRequest>): Promise<ACPResponse> {
    const dispatched = this.dispatchMessage(request);
    return dispatched.promise;
  }

  private dispatchMessage(
    request: Partial<ACPRequest>,
  ): { id: string; promise: Promise<ACPResponse> } {
    const id = (++this.messageId).toString();
    const promise = new Promise<ACPResponse>((resolve, reject) => {
      if (!this.geminiProcess?.stdin) {
        reject(new Error("Gemini Agent process not available"));
        return;
      }

      const fullRequest: ACPRequest = {
        jsonrpc: "2.0",
        id,
        method: request.method || "",
        params: request.params,
      };

      this.messageHandlers.set(id, (response) => {
        resolve(response);
      });
      this.messageRejectors.set(id, reject);

      this.geminiProcess.stdin.write(JSON.stringify(fullRequest) + "\n");
    });

    return { id, promise };
  }

  private clearPendingMessage(id: string) {
    this.messageHandlers.delete(id);
    this.messageRejectors.delete(id);
    if (this.activePromptRequestId === id) {
      this.activePromptRequestId = null;
    }
  }

  private rejectPendingMessage(id: string, error: Error) {
    const reject = this.messageRejectors.get(id);
    this.clearPendingMessage(id);
    reject?.(error);
  }

  private rejectAllPendingMessages(error: Error) {
    const pendingIds = [...this.messageRejectors.keys()];
    for (const id of pendingIds) {
      const reject = this.messageRejectors.get(id);
      this.clearPendingMessage(id);
      reject?.(error);
    }
  }

  private createAbortError(): Error {
    const error = new Error("Request cancelled");
    error.name = "AbortError";
    return error;
  }

  private sendNotification(method: string, params?: any): void {
    if (!this.geminiProcess?.stdin) {
      return;
    }
    this.geminiProcess.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
      }) + "\n",
    );
  }

  async createSession(): Promise<string> {
    if (!this.isConnected()) {
      throw new Error("Gemini Agent not connected");
    }

    try {
      const adapter = this.app.vault.adapter as any;
      const basePath = adapter.basePath || process.cwd();

      const response = await this.sendMessage({
        method: "session/new",
        params: {
          cwd: basePath,
          mcpServers: [],
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const sessionId = response.result?.sessionId;
      if (!sessionId) {
        throw new Error("Failed to create session: No session ID returned");
      }

      this.currentSessionId = sessionId;
      this.updateModelsFromResponse(response.result);
      this.updateConfigOptionsFromResponse(response.result);
      return sessionId;
    } catch (error: any) {
      throw new Error(`Failed to create session: ${error.message}`);
    }
  }

  async loadSession(sessionId: string): Promise<string> {
    if (!this.isConnected()) {
      throw new Error("Gemini Agent not connected");
    }

    const adapter = this.app.vault.adapter as any;
    const basePath = adapter.basePath || process.cwd();
    const response = await this.sendMessage({
      method: "session/load",
      params: {
        sessionId,
        cwd: basePath,
        mcpServers: [],
      },
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    this.currentSessionId = sessionId;
    this.updateModelsFromResponse(response.result);
    this.updateConfigOptionsFromResponse(response.result);
    return sessionId;
  }

  async cancelCurrentPrompt(): Promise<void> {
    if (!this.isConnected()) {
      return;
    }

    const activePromptRequestId = this.activePromptRequestId;
    if (activePromptRequestId) {
      this.sendNotification("$/cancelRequest", { id: activePromptRequestId });
      this.rejectPendingMessage(activePromptRequestId, this.createAbortError());
    }

    if (!this.currentSessionId) {
      return;
    }

    const response = await this.sendMessage({
      method: "session/cancel",
      params: {
        sessionId: this.currentSessionId,
      },
    });
    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  async sendChatMessage(
    message: string,
    onChunk?: (chunk: string, update: any) => void,
  ): Promise<string> {
    if (!this.isConnected()) {
      throw new Error("Gemini Agent not connected");
    }

    if (!this.currentSessionId) {
      console.log("Gemini ACP: No session, creating new one...");
      await this.createSession();
    }

    console.log(
      "Gemini ACP: Sending session/prompt to session",
      this.currentSessionId,
    );

    return new Promise((resolve, reject) => {
      const messageChunks: string[] = [];

      const unregister = this.onUpdate((update) => {
        if (
          update.sessionUpdate === "agent_message_chunk" &&
          update.content?.text
        ) {
          messageChunks.push(update.content.text);
          if (onChunk) {
            onChunk(update.content.text, update);
          }
        }
      });

      const promptRequest = this.dispatchMessage({
        method: "session/prompt",
        params: {
          sessionId: this.currentSessionId,
          prompt: [
            {
              type: "text",
              text: message,
            },
          ],
        },
      });
      this.activePromptRequestId = promptRequest.id;

      promptRequest.promise
        .then((response) => {
          unregister();
          console.log("Gemini ACP: session/prompt completed", {
            hasError: !!response.error,
            chunks: messageChunks.length,
          });

          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(messageChunks.join("") || "No response received");
          }
        })
        .catch((error) => {
          unregister();
          console.error("Gemini ACP: session/prompt failed:", error.message);
          reject(error);
        });
    });
  }

  async editFile(filePath: string, instruction: string): Promise<string> {
    if (!this.isConnected()) {
      throw new Error("Gemini Agent not connected");
    }

    if (!this.currentSessionId) {
      await this.createSession();
    }

    const adapter = this.app.vault.adapter as any;
    const basePath = adapter.basePath || process.cwd();
    const fullPath = filePath.startsWith("/")
      ? filePath
      : `${basePath}/${filePath}`;

    const messageChunks: string[] = [];
    const toolCalls: any[] = [];

    const unregister = this.onUpdate((update) => {
      if (
        update.sessionUpdate === "agent_message_chunk" &&
        update.content?.text
      ) {
        messageChunks.push(update.content.text);
      } else if (update.sessionUpdate === "tool_call") {
        toolCalls.push(update);
      } else if (update.sessionUpdate === "tool_call_update") {
        const existingIndex = toolCalls.findIndex(
          (tc) => tc.toolCallId === update.toolCallId,
        );
        if (existingIndex > -1) {
          toolCalls[existingIndex] = { ...toolCalls[existingIndex], ...update };
        }
      }
    });

    const isLogFile = fullPath.toLowerCase().endsWith("log.md");
    const editInstruction = isLogFile
      ? `Please edit the file at: ${fullPath}\nInstruction: ${instruction}\n\nCRITICAL: Since this is a log file, you MUST read the file and append your new entries to the end. Do NOT use the replace tool for log.md. Rewrite the whole file with write_file including the new appended content.`
      : `Please edit the file at: ${fullPath}\nInstruction: ${instruction}\n\nUse the file system tools to read the file, make the edits, and write it back.`;

    try {
      const response = await this.sendMessage({
        method: "session/prompt",
        params: {
          sessionId: this.currentSessionId,
          prompt: [
            {
              type: "text",
              text: editInstruction,
            },
          ],
        },
      });

      unregister();

      if (response.error) {
        throw new Error(response.error.message);
      }

      return messageChunks.join("") || `Processed ${filePath}`;
    } catch (error: any) {
      unregister();
      throw new Error(`File edit failed: ${error.message}`);
    }
  }

  async analyzeTags(filePath: string, content: string): Promise<string[]> {
    if (!this.isConnected()) {
      throw new Error("Gemini Agent not connected");
    }

    if (!this.currentSessionId) {
      await this.createSession();
    }

    const messageChunks: string[] = [];

    const unregister = this.onUpdate((update) => {
      if (
        update.sessionUpdate === "agent_message_chunk" &&
        update.content?.text
      ) {
        messageChunks.push(update.content.text);
      }
    });

    try {
      // 引入标签管理器获取现有标签作为示例
      const { TagManager } = await import("./utils/tag-manager");
      const { VaultFileSystemAdapter } = await import("./vault-adapter");
      const vaultAdapter = new VaultFileSystemAdapter(this.app);
      const tagManager = new TagManager(vaultAdapter);

      // 获取现有标签示例（最多20个）
      const allTags = Array.from(tagManager.getAllTags().keys()).slice(0, 20);
      const existingTagsExample = allTags.length > 0
        ? `Existing tags example (please follow the hierarchical style of these tags first):\n${allTags.join("\n")}`
        : "";

      const response = await this.sendMessage({
        method: "session/prompt",
        params: {
          sessionId: this.currentSessionId,
          prompt: [
            {
              type: "text",
              text: `Please generate tags for the file at ${filePath}. Follow these rules strictly:
1. Tags must use hierarchical format separated by slashes, e.g. "ai/machine-learning/transformer", "engineering/method/prompt-engineering"
2. Each level uses kebab-case lowercase, only letters, numbers and hyphens are allowed, no spaces or special characters
3. Recommended hierarchy depth is 2-4 levels, do not exceed 4 levels
4. ${existingTagsExample}
5. Try to use existing prefix hierarchies for new tags, avoid creating unnecessary new top-level categories
6. Control the number of tags between 3-5, prioritize the most relevant tags that best represent the content
7. Return only a JSON array of tag strings, no other text, explanations or markdown formatting, do not include json markers

File content:
${content.slice(0, 3000)}${content.length > 3000 ? "..." : ""}
`,
            },
          ],
        },
      });

      unregister();

      if (response.error) {
        throw new Error(response.error.message);
      }

      const resultText = messageChunks.join("").trim();
      try {
        // 清理可能的 markdown 格式
        const cleanedText = resultText.replace(/```json|```/g, "").trim();
        const tags = JSON.parse(cleanedText);
        return Array.isArray(tags) ? tags : [];
      } catch (parseError) {
        console.warn("Tag parsing failed, raw response:", resultText);
        return [];
      }
    } catch (error: any) {
      unregister();
      throw new Error(`Tag analysis failed: ${error.message}`);
    }
  }

  disconnect(): void {
    this.currentSessionId = null;
    this.activePromptRequestId = null;
    this.updateHandlers = [];
    this.stdoutBuffer = "";
    this.availableModels = [];
    this.currentModelId = null;
    this.configOptions = [];
    this.modelListeners.clear();
    this.configListeners.clear();
    this.rejectAllPendingMessages(
      new Error("Gemini Agent process disconnected"),
    );
    if (this.geminiProcess && !this.geminiProcess.killed) {
      this.geminiProcess.kill("SIGTERM");
      this.geminiProcess = null;
    }
  }

  resetSession(): void {
    this.currentSessionId = null;
  }

  isConnected(): boolean {
    return this.geminiProcess !== null && !this.geminiProcess.killed;
  }

  getACPClient(): ACPClient {
    return this.acpClient;
  }
}
