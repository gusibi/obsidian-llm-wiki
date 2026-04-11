import { spawn, ChildProcess } from "child_process";
import { App, Notice } from "obsidian";
import { ACPClient } from "./acp-client";
import { ACPRequest, ACPResponse } from "./types";
import { ClaudeACPSettings } from "./settings";

export class ClaudeCodeConnection {
  private app: App;
  private apiKey: string;
  private claudeCodePath: string;
  private claudeProcess: ChildProcess | null = null;
  private acpClient: ACPClient;
  private messageHandlers: Map<string, (response: ACPResponse) => void> =
    new Map();
  private messageId = 0;
  private currentSessionId: string | null = null;
  private updateHandlers: ((update: any) => void)[] = [];
  // No chat timeout — tasks may run for hours
  private stdoutBuffer = "";

  constructor(
    app: App,
    apiKey: string,
    claudeCodePath: string = "",
    settingsProvider: () => ClaudeACPSettings,
  ) {
    this.app = app;
    this.apiKey = apiKey;
    this.claudeCodePath = claudeCodePath;
    this.acpClient = new ACPClient(app, settingsProvider);
  }

  async connect(): Promise<boolean> {
    if (!this.apiKey && !this.claudeCodePath) {
      throw new Error(
        "Please set either Anthropic API key or Claude Code path in settings",
      );
    }

    await this.acpClient.initialize();
    return await this.startClaudeCode();
  }

  private async startClaudeCode(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        let command: string;
        let args: string[] = [];

        if (this.claudeCodePath && this.claudeCodePath.trim()) {
          if (this.claudeCodePath.includes(" ")) {
            const parts = this.claudeCodePath.split(" ");
            command = parts[0];
            args = parts.slice(1);
          } else {
            command = this.claudeCodePath;
            args = [];
          }
        } else {
          command = "npx";
          args = ["-y", "claude-code-acp"];
        }

        // Ensure Node.js is in PATH for the spawned process
        const nodePath = "/opt/homebrew/bin";
        const currentPath = process.env.PATH || "";
        const enhancedPath = `${nodePath}:${currentPath}`;

        // If we are pointing to claude-code-acp, it's a Node script.
        // It's safer to spawn 'node' explicitly with the script as an argument
        // to ensure the environment is correctly picked up.
        if (command.endsWith("claude-code-acp")) {
          args = [command, ...args];
          command = "node";
        }

        const spawnOptions: import("child_process").SpawnOptions = {
          env: this.apiKey
            ? {
                ...process.env,
                ANTHROPIC_API_KEY: this.apiKey,
                PATH: enhancedPath,
              }
            : { ...process.env, PATH: enhancedPath },
          stdio: ["pipe", "pipe", "pipe"],
          shell: false,
          detached: false,
        };

        this.claudeProcess = spawn(command, args, spawnOptions);

        if (!this.claudeProcess) {
          resolve(false);
          return;
        }

        this.claudeProcess.on("error", (error: any) => {
          console.error("Claude ACP: Process error:", error);
          resolve(false);
        });

        this.claudeProcess.on("exit", (code, signal) => {
          if (code !== 0) {
            resolve(false);
          }
        });

        if (this.claudeProcess.stdout) {
          this.claudeProcess.stdout.on("data", (data) => {
            const dataStr = data.toString();
            this.handleACPMessages(dataStr);
          });
        }

        if (this.claudeProcess.stderr) {
          this.claudeProcess.stderr.on("data", (data) => {
            const stderrText = data.toString();
            // Only log actual errors, not debug info
            if (
              stderrText.toLowerCase().includes("error") ||
              stderrText.toLowerCase().includes("failed")
            ) {
              console.error("Claude Code stderr:", stderrText);
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
              name: "claude-code-acp",
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

        this.claudeProcess.stdin?.write(initMessage + "\n");

        const initTimeout = setTimeout(() => {
          if (!initResolved) {
            resolve(false);
          }
        }, 10000);

        this.claudeProcess.on("exit", (code, signal) => {
          clearTimeout(initTimeout);
          if (code === 0) {
            resolve(true);
          } else {
            resolve(false);
          }
        });
      } catch (spawnError) {
        console.error("Claude ACP: Spawn failed:", spawnError);
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
        console.error("Failed to parse ACP message:", error, trimmed);
        continue;
      }

      if (message.id && this.messageHandlers.has(message.id.toString())) {
        const handler = this.messageHandlers.get(message.id.toString());
        if (handler) {
          handler(message);
          this.messageHandlers.delete(message.id.toString());
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
      if (this.isDebugLoggingEnabled()) {
        console.log("Claude ACP session/update:", params.update);
      }
      // Notify all registered update handlers
      for (const handler of this.updateHandlers) {
        handler(params.update);
      }
    }
  }

  private isDebugLoggingEnabled(): boolean {
    try {
      const storage = (globalThis as any)?.localStorage;
      return !!storage?.getItem("claude-acp-debug");
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
          response.result?.outcome?.optionId !== "deny";
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

      if (this.claudeProcess?.stdin) {
        const responseStr = JSON.stringify(response) + "\n";
        this.claudeProcess.stdin.write(responseStr);
      } else {
        console.error("Claude ACP: claudeProcess.stdin is null!");
      }
    } catch (error) {
      console.error("Claude ACP: Error in handleIncomingRequest:", error);
      if (error instanceof Error) {
        console.error("Claude ACP: Error message:", error.message);
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
    return new Promise((resolve, reject) => {
      if (!this.claudeProcess?.stdin) {
        reject(new Error("Claude Code process not available"));
        return;
      }

      const id = (++this.messageId).toString();
      const fullRequest: ACPRequest = {
        jsonrpc: "2.0",
        id,
        method: request.method || "",
        params: request.params,
      };

      this.messageHandlers.set(id, (response) => {
        resolve(response);
      });

      this.claudeProcess.stdin.write(JSON.stringify(fullRequest) + "\n");
    });
  }

  async createSession(): Promise<string> {
    if (!this.isConnected()) {
      throw new Error("Claude Code not connected");
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
      return sessionId;
    } catch (error: any) {
      throw new Error(`Failed to create session: ${error.message}`);
    }
  }

  async sendChatMessage(
    message: string,
    onChunk?: (chunk: string, update: any) => void,
  ): Promise<string> {
    if (!this.isConnected()) {
      throw new Error("Claude Code not connected");
    }

    if (!this.currentSessionId) {
      console.log("Claude ACP: No session, creating new one...");
      await this.createSession();
    }

    console.log(
      "Claude ACP: Sending session/prompt to session",
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

      this.sendMessage({
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
      })
        .then((response) => {
          unregister();
          console.log("Claude ACP: session/prompt completed", {
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
          console.error("Claude ACP: session/prompt failed:", error.message);
          reject(error);
        });
    });
  }

  async editFile(filePath: string, instruction: string): Promise<string> {
    if (!this.isConnected()) {
      throw new Error("Claude Code not connected");
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

    try {
      const response = await this.sendMessage({
        method: "session/prompt",
        params: {
          sessionId: this.currentSessionId,
          prompt: [
            {
              type: "text",
              text: `Please edit the file at: ${fullPath}\nInstruction: ${instruction}\n\nUse the file system tools to read the file, make the edits, and write it back.`,
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
      throw new Error("Claude Code not connected");
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
      const response = await this.sendMessage({
        method: "session/prompt",
        params: {
          sessionId: this.currentSessionId,
          prompt: [
            {
              type: "text",
              text: `Please suggest tags for the file at ${filePath}. Return only a JSON array of tag strings, no other text.\n\nFile content:\n${content}`,
            },
          ],
        },
      });

      unregister();

      if (response.error) {
        throw new Error(response.error.message);
      }

      const resultText = messageChunks.join("");
      try {
        const tags = JSON.parse(resultText);
        return Array.isArray(tags) ? tags : [];
      } catch {
        return [];
      }
    } catch (error: any) {
      unregister();
      throw new Error(`Tag analysis failed: ${error.message}`);
    }
  }

  disconnect(): void {
    this.currentSessionId = null;
    this.updateHandlers = [];
    this.stdoutBuffer = "";
    if (this.claudeProcess && !this.claudeProcess.killed) {
      this.claudeProcess.kill("SIGTERM");
      this.claudeProcess = null;
    }
  }

  resetSession(): void {
    this.currentSessionId = null;
  }

  isConnected(): boolean {
    return this.claudeProcess !== null && !this.claudeProcess.killed;
  }

  getACPClient(): ACPClient {
    return this.acpClient;
  }
}
