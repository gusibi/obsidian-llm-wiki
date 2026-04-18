import { App } from "obsidian";
import { createHash } from "crypto";
import {
  ACPRequest,
  ACPResponse,
  ACPCapabilities,
  SessionInfo,
  FileReadParams,
  FileWriteParams,
} from "./types";
import { VaultFileSystemAdapter } from "./vault-adapter";
import { createUnifiedDiff } from "./unified-diff";
import { promptPatch } from "./patch-modal";
import { appendAuditEntry } from "./audit-log";
import { runCommand } from "./terminal-executor";
import { promptTerminalPermission } from "./terminal-permission-modal";
import { ClaudeACPSettings, TerminalPolicy } from "./settings";

export type PermissionHandler = (request: {
  toolName: string;
  description: string;
  options: { optionId: string; name?: string; kind?: string }[];
}) => Promise<string>;

export class ACPClient {
  private app: App;
  private messageId = 0;
  private session: SessionInfo | null = null;
  private vaultAdapter: VaultFileSystemAdapter;
  private settingsProvider: () => ClaudeACPSettings;
  private terminalSessions: Map<string, import("child_process").ChildProcess> =
    new Map();
  private permissionHandler: PermissionHandler | null = null;

  constructor(app: App, settingsProvider: () => ClaudeACPSettings) {
    this.app = app;
    this.vaultAdapter = new VaultFileSystemAdapter(app);
    this.settingsProvider = settingsProvider;
  }

  setPermissionHandler(handler: PermissionHandler) {
    this.permissionHandler = handler;
  }

  async initialize(): Promise<SessionInfo> {
    const capabilities: ACPCapabilities = {
      fs: {
        readTextFile: true,
        writeTextFile: true,
      },
      terminal: {
        create: true,
        resize: false,
        kill: true,
      },
    };

    const sessionId = this.generateSessionId();

    this.session = {
      sessionId,
      clientInfo: {
        name: "Obsidian",
        version: "1.0.0",
        capabilities,
      },
    };

    return this.session;
  }

  async handleRequest(request: ACPRequest): Promise<ACPResponse> {
    try {
      const { method, params, id } = request;

      console.log("Claude ACP: ===== Incoming Request =====");
      console.log("Claude ACP: method:", method);
      console.log("Claude ACP: id:", id);
      console.log("Claude ACP: params:", JSON.stringify(params, null, 2));
      console.log("Claude ACP: ============================");

      switch (method) {
        case "initialize":
          return this.handleInitialize(id, params);

        case "fs/read_text_file":
          return this.handleReadTextFile(id, params);

        case "fs/write_text_file":
          return this.handleWriteTextFile(id, params);

        case "fs/list_files":
          return this.handleListFiles(id, params);

        case "fs/file_info":
          return this.handleFileInfo(id, params);

        case "tags/get_file_tags":
          return this.handleGetFileTags(id, params);

        case "tags/update_file_tags":
          return this.handleUpdateFileTags(id, params);

        case "terminal/execute":
        case "terminal/run":
        case "terminal/run_command":
        case "terminal/command":
        case "terminal/create":
          return await this.handleTerminalExecute(id, params);

        case "terminal/kill":
          return this.handleTerminalKill(id, params);

        case "session/request_permission":
          return await this.handleRequestPermission(id, params);

        default:
          console.error("Claude ACP: Method not found:", method);
          return {
            jsonrpc: "2.0",
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          };
      }
    } catch (error) {
      console.error("Claude ACP: Error handling request:", error);
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32603,
          message: `Internal error: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  }

  private handleInitialize(id: number | string, params: any): ACPResponse {
    const capabilities = this.session?.clientInfo.capabilities || {};

    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: 1,
        clientCapabilities: capabilities,
      },
    };
  }

  private async handleReadTextFile(
    id: number | string,
    params: FileReadParams,
  ): Promise<ACPResponse> {
    if (!this.session) {
      return this.createErrorResponse(id, -32001, "Session not initialized");
    }

    try {
      const { path, line, limit } = params;

      if (!this.vaultAdapter.fileExists(path)) {
        return this.createErrorResponse(id, -32002, `File not found: ${path}`);
      }

      let content = await this.vaultAdapter.readFile(path);

      if (line !== undefined || limit !== undefined) {
        const lines = content.split("\n");
        const startLine = line ? line - 1 : 0;
        const endLine = limit
          ? Math.min(startLine + limit, lines.length)
          : lines.length;
        content = lines.slice(startLine, endLine).join("\n");
      }

      return {
        jsonrpc: "2.0",
        id,
        result: { content },
      };
    } catch (error) {
      return this.createErrorResponse(
        id,
        -32003,
        `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async handleWriteTextFile(
    id: number | string,
    params: FileWriteParams,
  ): Promise<ACPResponse> {
    console.log("Claude ACP Client: ===== handleWriteTextFile START =====");
    console.log("Claude ACP Client: id:", id);
    console.log("Claude ACP Client: params:", JSON.stringify(params, null, 2));

    if (!this.session) {
      console.error("Claude ACP Client: Session not initialized");
      return this.createErrorResponse(id, -32001, "Session not initialized");
    }

    try {
      const { path, content } = params;
      const existing = this.vaultAdapter.fileExists(path)
        ? await this.vaultAdapter.readFile(path)
        : "";
      const hashBefore = this.hashText(existing);
      const diff = createUnifiedDiff(existing, content, path);

      const decision = await promptPatch(this.app, {
        title: "Patch proposal",
        diff,
        originalContent: existing,
        proposedContent: content,
        filePath: path,
      });

      if (decision.action === "reject") {
        await appendAuditEntry(this.app, {
          timestamp: new Date().toISOString(),
          sessionId: params.sessionId,
          action: "file_write",
          path,
          status: "rejected",
          diff,
          hashBefore,
          reason: this.extractReason(params),
        });
        return this.createErrorResponse(id, -32010, "Patch rejected by user");
      }

      const latest = this.vaultAdapter.fileExists(path)
        ? await this.vaultAdapter.readFile(path)
        : "";
      const latestHash = this.hashText(latest);
      if (latestHash !== hashBefore) {
        await appendAuditEntry(this.app, {
          timestamp: new Date().toISOString(),
          sessionId: params.sessionId,
          action: "file_write",
          path,
          status: "failed",
          diff,
          hashBefore,
          hashAfter: latestHash,
          reason: "File changed before apply",
        });
        return this.createErrorResponse(
          id,
          -32011,
          "File changed before apply. Please retry.",
        );
      }

      console.log("Claude ACP Client: Calling vaultAdapter.writeFile");
      await this.vaultAdapter.writeFile(path, decision.content);
      const hashAfter = this.hashText(decision.content);

      await appendAuditEntry(this.app, {
        timestamp: new Date().toISOString(),
        sessionId: params.sessionId,
        action: "file_write",
        path,
        status: "applied",
        diff: createUnifiedDiff(existing, decision.content, path),
        hashBefore,
        hashAfter,
        reason: this.extractReason(params),
      });

      console.log("Claude ACP Client: writeFile completed successfully");
      console.log(
        "Claude ACP Client: ===== handleWriteTextFile END (SUCCESS) =====",
      );

      return {
        jsonrpc: "2.0",
        id,
        result: null,
      };
    } catch (error) {
      console.error("Claude ACP Client: ===== handleWriteTextFile ERROR =====");
      console.error("Claude ACP Client: Error:", error);
      if (error instanceof Error) {
        console.error("Claude ACP Client: Error message:", error.message);
        console.error("Claude ACP Client: Error stack:", error.stack);
      }
      console.error(
        "Claude ACP Client: =======================================",
      );
      return this.createErrorResponse(
        id,
        -32004,
        `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async handleListFiles(
    id: number | string,
    params: { path?: string },
  ): Promise<ACPResponse> {
    if (!this.session) {
      return this.createErrorResponse(id, -32001, "Session not initialized");
    }

    try {
      const { path = "/" } = params;
      const files = this.vaultAdapter.listFiles(path);

      return {
        jsonrpc: "2.0",
        id,
        result: { files },
      };
    } catch (error) {
      return this.createErrorResponse(
        id,
        -32005,
        `Failed to list files: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async handleFileInfo(
    id: number | string,
    params: { path: string },
  ): Promise<ACPResponse> {
    if (!this.session) {
      return this.createErrorResponse(id, -32001, "Session not initialized");
    }

    try {
      const { path } = params;
      const info = this.vaultAdapter.getFileInfo(path);

      if (!info) {
        return this.createErrorResponse(id, -32002, `File not found: ${path}`);
      }

      return {
        jsonrpc: "2.0",
        id,
        result: { info },
      };
    } catch (error) {
      return this.createErrorResponse(
        id,
        -32006,
        `Failed to get file info: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async handleGetFileTags(
    id: number | string,
    params: { path: string },
  ): Promise<ACPResponse> {
    if (!this.session) {
      return this.createErrorResponse(id, -32001, "Session not initialized");
    }

    try {
      const { path } = params;
      const tags = await this.vaultAdapter.getFileTags(path);

      return {
        jsonrpc: "2.0",
        id,
        result: { tags },
      };
    } catch (error) {
      return this.createErrorResponse(
        id,
        -32007,
        `Failed to get file tags: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async handleUpdateFileTags(
    id: number | string,
    params: { path: string; tags: string[] },
  ): Promise<ACPResponse> {
    if (!this.session) {
      return this.createErrorResponse(id, -32001, "Session not initialized");
    }

    try {
      const { path, tags } = params;
      await this.vaultAdapter.updateFileTags(path, tags);

      return {
        jsonrpc: "2.0",
        id,
        result: null,
      };
    } catch (error) {
      return this.createErrorResponse(
        id,
        -32008,
        `Failed to update file tags: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async handleRequestPermission(
    id: number | string,
    params: any,
  ): Promise<ACPResponse> {
    try {
      const { toolCall, options } = params;
      const toolName = toolCall?.title || toolCall?.toolName || "Tool";
      const rawInput = toolCall?.rawInput || {};
      const description =
        rawInput.description || rawInput.command || toolName;

      console.log(`Claude ACP: Permission requested for tool: ${toolName}`);

      const normalizedOptions = options && options.length > 0 ? options : [
        { optionId: "allow", name: "Allow", kind: "allow" },
        { optionId: "reject", name: "Reject", kind: "reject" }
      ];

      const decision = await this.promptPermission(toolName, description, normalizedOptions);

      console.log("Claude ACP: Permission decision:", decision);

      return {
        jsonrpc: "2.0",
        id,
        result: {
          outcome: {
            outcome: "selected",
            optionId: decision,
          },
        },
      };
    } catch (error) {
      console.error("Claude ACP: Error in handleRequestPermission:", error);
      return this.createErrorResponse(
        id,
        -32603,
        `Failed to handle permission request: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private promptPermission(
    toolName: string,
    description: string,
    options: { optionId: string; name?: string; kind?: string }[],
  ): Promise<string> {
    if (this.permissionHandler) {
      return this.permissionHandler({
        toolName,
        description,
        options,
      });
    }
    return Promise.resolve(options[0]?.optionId || "allow");
  }

  private createErrorResponse(
    id: number | string,
    code: number,
    message: string,
  ): ACPResponse {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message,
      },
    };
  }

  private async handleTerminalExecute(
    id: number | string,
    params: any,
  ): Promise<ACPResponse> {
    if (!this.session) {
      return this.createErrorResponse(id, -32001, "Session not initialized");
    }

    const command = this.extractCommand(params);
    if (!command) {
      return this.createErrorResponse(id, -32012, "Terminal command missing");
    }

    const classification = this.classifyCommand(command);
    const policy = this.settingsProvider().terminalPolicy;
    if (!this.shouldAutoAllow(policy, classification)) {
      const decision = await promptTerminalPermission(this.app, {
        command,
        classification,
      });
      if (decision === "reject") {
        await appendAuditEntry(this.app, {
          timestamp: new Date().toISOString(),
          sessionId: params?.sessionId,
          action: "terminal_execute",
          command,
          status: "rejected",
        });
        return this.createErrorResponse(
          id,
          -32013,
          "Terminal command rejected by user",
        );
      }
    }

    const cwd = this.resolveCwd(params);
    try {
      const result = await runCommand(command, cwd);
      await appendAuditEntry(this.app, {
        timestamp: new Date().toISOString(),
        sessionId: params?.sessionId,
        action: "terminal_execute",
        command,
        status: "applied",
        output: result.output,
      });

      return {
        jsonrpc: "2.0",
        id,
        result: {
          output: result.output,
          exitCode: result.exitCode,
        },
      };
    } catch (error) {
      await appendAuditEntry(this.app, {
        timestamp: new Date().toISOString(),
        sessionId: params?.sessionId,
        action: "terminal_execute",
        command,
        status: "failed",
        output: error instanceof Error ? error.message : String(error),
      });
      return this.createErrorResponse(
        id,
        -32014,
        `Terminal command failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private handleTerminalKill(id: number | string, params: any): ACPResponse {
    const terminalId = params?.terminalId || params?.id;
    if (!terminalId) {
      return this.createErrorResponse(id, -32015, "Terminal id missing");
    }
    const process = this.terminalSessions.get(String(terminalId));
    if (!process) {
      return this.createErrorResponse(id, -32016, "Terminal session not found");
    }
    process.kill("SIGTERM");
    this.terminalSessions.delete(String(terminalId));
    return {
      jsonrpc: "2.0",
      id,
      result: null,
    };
  }

  private classifyCommand(command: string): "safe" | "test" | "danger" {
    const safePatterns = [
      /^\\s*ls(\\s|$)/i,
      /^\\s*pwd(\\s|$)/i,
      /^\\s*cat\\s+/i,
      /^\\s*rg\\s+/i,
      /^\\s*grep\\s+/i,
      /^\\s*find\\s+/i,
      /^\\s*head\\s+/i,
      /^\\s*tail\\s+/i,
      /^\\s*git\\s+(status|diff|log|show)(\\s|$)/i,
    ];

    const testPatterns = [
      /^\\s*npm\\s+(test|run\\s+test|run\\s+build|run\\s+lint)(\\s|$)/i,
      /^\\s*pnpm\\s+(test|run\\s+test|run\\s+build|run\\s+lint)(\\s|$)/i,
      /^\\s*yarn\\s+(test|run\\s+test|run\\s+build|run\\s+lint)(\\s|$)/i,
      /^\\s*bun\\s+(test|run\\s+test|run\\s+build|run\\s+lint)(\\s|$)/i,
      /^\\s*pytest(\\s|$)/i,
      /^\\s*go\\s+test(\\s|$)/i,
      /^\\s*cargo\\s+test(\\s|$)/i,
      /^\\s*deno\\s+test(\\s|$)/i,
    ];

    if (safePatterns.some((pattern) => pattern.test(command))) {
      return "safe";
    }
    if (testPatterns.some((pattern) => pattern.test(command))) {
      return "test";
    }
    return "danger";
  }

  private shouldAutoAllow(
    policy: TerminalPolicy,
    classification: "safe" | "test" | "danger",
  ): boolean {
    if (policy === "allow-all") return true;
    if (
      policy === "allow-tests" &&
      (classification === "safe" || classification === "test")
    )
      return true;
    if (policy === "allow-safe" && classification === "safe") return true;
    return false;
  }

  private extractCommand(params: any): string {
    if (typeof params?.command === "string") {
      return params.command;
    }
    if (typeof params?.cmd === "string") {
      return params.cmd;
    }
    if (typeof params?.shellCommand === "string") {
      return params.shellCommand;
    }
    if (Array.isArray(params?.argv)) {
      return params.argv.join(" ");
    }
    return "";
  }

  private resolveCwd(params: any): string {
    if (typeof params?.cwd === "string" && params.cwd.trim()) {
      return params.cwd;
    }
    const adapter = this.app.vault.adapter as any;
    return adapter?.basePath || adapter?.getBasePath?.() || process.cwd();
  }

  private hashText(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  private extractReason(params: any): string | undefined {
    return (
      params?.reason ||
      params?.instruction ||
      params?.summary ||
      params?.prompt ||
      undefined
    );
  }

  private generateSessionId(): string {
    return `obsidian_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getSession(): SessionInfo | null {
    return this.session;
  }

  isInitialized(): boolean {
    return this.session !== null;
  }
}
