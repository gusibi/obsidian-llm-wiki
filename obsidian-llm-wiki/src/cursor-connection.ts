import { spawn, ChildProcess } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { App, Notice } from "obsidian";
import { ACPClient } from "./acp-client";
import {
  ACPConfigOption,
  ACPModelOption,
  parseAvailableModels,
  parseConfigOptions,
  parseCurrentModelId,
} from "./agent-connection";
import { promptCursorImageGeneration } from "./cursor-image-modal";
import { promptCursorPlan } from "./cursor-plan-modal";
import {
  promptCursorQuestions,
  CursorQuestionPrompt,
} from "./cursor-question-modal";
import { ACPRequest, ACPResponse } from "./types";
import { ClaudeACPSettings } from "./settings";

const CURSOR_ACP_ROOT = "Cursor ACP";

export class CursorAgentConnection {
  private app: App;
  private cursorProcess: ChildProcess | null = null;
  private acpClient: ACPClient;
  private settingsProvider: () => ClaudeACPSettings;
  private messageHandlers: Map<string, (response: ACPResponse) => void> =
    new Map();
  private messageRejectors: Map<string, (error: Error) => void> = new Map();
  private messageId = 0;
  private currentSessionId: string | null = null;
  private activePromptRequestId: string | null = null;
  private availableModels: ACPModelOption[] = [];
  private currentModelId: string | null = null;
  private currentModeId: string | null = null;
  private configOptions: ACPConfigOption[] = [];
  private modelListeners: Set<(models: ACPModelOption[]) => void> = new Set();
  private configListeners: Set<(options: ACPConfigOption[]) => void> =
    new Set();
  private updateHandlers: ((update: any) => void)[] = [];
  // No chat timeout — tasks may run for hours
  private stdoutBuffer = "";

  constructor(app: App, settingsProvider: () => ClaudeACPSettings) {
    this.app = app;
    this.settingsProvider = settingsProvider;
    this.acpClient = new ACPClient(app, settingsProvider);
  }

  async connect(): Promise<boolean> {
    await this.acpClient.initialize();
    return await this.startCursorAgent();
  }

  private resolveCommandAndArgs(
    configuredPath: string,
    defaultCommand: string,
    defaultArgs: string[],
  ): { command: string; args: string[] } {
    if (configuredPath && configuredPath.trim()) {
      if (configuredPath.includes(" ")) {
        const parts = configuredPath.split(" ");
        return { command: parts[0], args: parts.slice(1) };
      }
      return { command: configuredPath, args: [] };
    }
    return { command: defaultCommand, args: defaultArgs };
  }

  private async writeGeneratedConfig(
    settings: ClaudeACPSettings,
  ): Promise<string | null> {
    if (settings.cursorTimeoutMs <= 0) {
      return null;
    }

    const adapter = this.app.vault.adapter as any;
    const basePath = adapter?.basePath || process.cwd();
    const configDir = path.join(basePath, ".obsidian", "claude");
    const configPath = path.join(configDir, "cursor-acp-config.json");

    const config: any = {};
    if (settings.cursorLogLevel.trim()) {
      config.logLevel = settings.cursorLogLevel.trim();
    }
    if (settings.cursorSessionDir.trim()) {
      config.sessionDir = settings.cursorSessionDir.trim();
    }
    config.cursor = {
      ...(settings.cursorTimeoutMs > 0
        ? { timeout: settings.cursorTimeoutMs }
        : {}),
    };

    try {
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
      return configPath;
    } catch (error) {
      console.warn("Cursor ACP: Failed to write config file:", error);
      return null;
    }
  }

  private async buildCursorArgs(
    settings: ClaudeACPSettings,
  ): Promise<string[]> {
    const args: string[] = [];
    let usingGeneratedConfig = false;

    if (settings.cursorConfigPath.trim()) {
      args.push("--config", settings.cursorConfigPath.trim());
    } else {
      const generatedConfigPath = await this.writeGeneratedConfig(settings);
      if (generatedConfigPath) {
        args.push("--config", generatedConfigPath);
        usingGeneratedConfig = true;
      }
    }

    if (!usingGeneratedConfig) {
      if (settings.cursorLogLevel.trim()) {
        args.push("--log-level", settings.cursorLogLevel.trim());
      }
      if (settings.cursorSessionDir.trim()) {
        args.push("--session-dir", settings.cursorSessionDir.trim());
      }
    }

    if (settings.cursorAdditionalArgs.trim()) {
      args.push(
        ...settings.cursorAdditionalArgs
          .split(" ")
          .map((value) => value.trim())
          .filter(Boolean),
      );
    }

    return args;
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

  private buildEnhancedPath(settings: ClaudeACPSettings): string {
    const currentPath = process.env.PATH || "";
    const homeDir = os.homedir();
    const additionalPaths = [
      "/opt/homebrew/bin",
      path.join(homeDir, ".local", "bin"),
      path.join(homeDir, ".npm-global", "bin"),
    ];

    if (settings.cursorAgentPath.trim()) {
      const resolvedPath = settings.cursorAgentPath.trim();
      const agentDir = path.isAbsolute(resolvedPath)
        ? path.dirname(resolvedPath)
        : "";
      if (agentDir) {
        additionalPaths.unshift(agentDir);
      }
    }

    return `${additionalPaths.join(":")}:${currentPath}`;
  }

  private async startCursorAgent(): Promise<boolean> {
    try {
      const settings = this.settingsProvider();
      const resolved = this.resolveCommandAndArgs(
        settings.cursorAgentPath,
        "agent",
        ["acp"],
      );

      const command = resolved.command;
      const cursorArgs = await this.buildCursorArgs(settings);
      const args = [...resolved.args, ...cursorArgs];
      const enhancedPath = this.buildEnhancedPath(settings);

      return await new Promise((resolve) => {
        const spawnOptions: import("child_process").SpawnOptions = {
          env: {
            ...process.env,
            PATH: enhancedPath,
          },
          stdio: ["pipe", "pipe", "pipe"],
          shell: false,
          detached: false,
        };

        this.cursorProcess = spawn(command, args, spawnOptions);

        if (!this.cursorProcess) {
          resolve(false);
          return;
        }

        this.cursorProcess.on("error", (error: any) => {
          console.error("Cursor ACP: Process error:", error);
          this.rejectAllPendingMessages(
            new Error(`Cursor Agent process error: ${error?.message || String(error)}`),
          );
          resolve(false);
        });

        this.cursorProcess.on("exit", (code, signal) => {
          this.rejectAllPendingMessages(
            new Error(
              `Cursor Agent process exited${code !== null ? ` with code ${code}` : ""}${signal ? ` (${signal})` : ""}`,
            ),
          );
          if (code !== 0) {
            resolve(false);
          }
        });

        if (this.cursorProcess.stdout) {
          this.cursorProcess.stdout.on("data", (data) => {
            const dataStr = data.toString();
            this.handleACPMessages(dataStr);
          });
        }

        if (this.cursorProcess.stderr) {
          this.cursorProcess.stderr.on("data", (data) => {
            const stderrText = data.toString();
            if (
              stderrText.toLowerCase().includes("error") ||
              stderrText.toLowerCase().includes("failed")
            ) {
              console.error("Cursor Agent stderr:", stderrText);
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
              name: "LLM Wiki",
              version: "0.1.0",
            },
            capabilities: {
              tools: true,
              files: true,
              tags: true,
            },
          },
        });

        const initId = this.messageId.toString();
        let initResolved = false;

        this.messageHandlers.set(initId, async (response: any) => {
          clearTimeout(initTimeout);

          if (response.error) {
            initResolved = true;
            resolve(false);
            return;
          }

          try {
            const authResponse = await this.sendMessage({
              method: "authenticate",
              params: {
                methodId: "cursor_login",
              },
            });
            initResolved = true;
            resolve(!authResponse.error);
          } catch (error) {
            console.error("Cursor ACP: Authentication failed:", error);
            initResolved = true;
            resolve(false);
          }
        });

        this.cursorProcess.stdin?.write(initMessage + "\n");

        const initTimeout = setTimeout(() => {
          if (!initResolved) {
            resolve(false);
          }
        }, 10000);

        this.cursorProcess.on("exit", (code, signal) => {
          clearTimeout(initTimeout);
          if (code === 0) {
            resolve(true);
          } else {
            resolve(false);
          }
        });
      });
    } catch (spawnError) {
      console.error("Cursor ACP: Spawn failed:", spawnError);
      return false;
    }
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
      const modeId =
        params.update?.modeId ||
        params.update?.currentModeId ||
        params.update?.mode?.id;
      if (modeId) {
        this.currentModeId = String(modeId);
      }
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
          `[${timestamp}] [Cursor ACP] session/update:`,
          params.update,
        );
      }
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
      if (request.method?.startsWith("cursor/")) {
        const response = await this.handleCursorExtensionRequest(request);
        if (response && this.cursorProcess?.stdin) {
          this.cursorProcess.stdin.write(JSON.stringify(response) + "\n");
        }
        return;
      }

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

      if (this.cursorProcess?.stdin) {
        const responseStr = JSON.stringify(response) + "\n";
        this.cursorProcess.stdin.write(responseStr);
      } else {
        console.error("Cursor ACP: cursorProcess.stdin is null!");
      }
    } catch (error) {
      console.error("Cursor ACP: Error in handleIncomingRequest:", error);
      if (error instanceof Error) {
        console.error("Cursor ACP: Error message:", error.message);
      }
    }
  }

  private async handleCursorExtensionRequest(
    request: any,
  ): Promise<ACPResponse | null> {
    const { id, method, params } = request;
    const buildResponse = (result: any): ACPResponse | null => {
      if (id === undefined || id === null) {
        return null;
      }
      return {
        jsonrpc: "2.0",
        id,
        result,
      };
    };

    if (method === "cursor/create_plan") {
      const decision = await promptCursorPlan(this.app, {
        name: params?.name,
        overview: params?.overview,
        isProject: !!params?.isProject,
        plan: String(params?.plan ?? ""),
        todos: Array.isArray(params?.todos) ? params.todos : [],
        phases: Array.isArray(params?.phases) ? params.phases : [],
      });
      if (decision.outcome !== "accepted") {
        return buildResponse(decision);
      }

      const planUri = await this.persistCursorPlan(params);
      const entries = this.buildPlanEntriesFromCursorRequest(params);
      if (entries.length > 0) {
        this.emitUpdate({
          sessionUpdate: "plan",
          entries,
        });
      }
      this.emitUpdate({
        sessionUpdate: "background_task",
        status: "completed",
        toolName: params?.name || "Plan",
        message: `Saved Cursor plan to ${planUri}`,
      });
      return buildResponse({ outcome: "accepted", planUri });
    }

    if (method === "cursor/update_todos") {
      const todoPath = await this.persistCursorTodos(
        Array.isArray(params?.todos) ? params.todos : [],
        !!params?.merge,
      );
      const entries = this.buildPlanEntriesFromCursorTodos(params?.todos);
      if (entries.length > 0) {
        this.emitUpdate({
          sessionUpdate: "plan",
          entries,
        });
      }
      this.emitUpdate({
        sessionUpdate: "background_task",
        status: "completed",
        toolName: "Todos",
        message: `Updated Cursor todo board at ${todoPath}`,
      });
      if (id !== undefined && id !== null) {
        return buildResponse({
          outcome: "accepted",
          todos: Array.isArray(params?.todos) ? params.todos : [],
        });
      }
      return null;
    }

    if (method === "cursor/ask_question") {
      const decision = await promptCursorQuestions(this.app, {
        title: params?.title,
        questions: this.normalizeCursorQuestions(params?.questions),
      });
      return buildResponse(decision);
    }

    if (method === "cursor/task") {
      const taskPath = await this.persistCursorTask(params);
      this.emitUpdate({
        sessionUpdate: "background_task",
        status: "completed",
        toolName: params?.description || "Task",
        message: `Logged Cursor task to ${taskPath}`,
      });
      return buildResponse({
        outcome: "completed",
        agentId: params?.agentId,
        durationMs: params?.durationMs ?? 0,
      });
    }

    if (method === "cursor/generate_image") {
      const decision = await promptCursorImageGeneration(this.app, {
        description: String(params?.description ?? ""),
        filePath: this.normalizeGeneratedImagePath(params?.filePath),
        referenceImagePaths: Array.isArray(params?.referenceImagePaths)
          ? params.referenceImagePaths
          : [],
      });
      if (decision.outcome !== "generated") {
        if (id !== undefined && id !== null) {
          return buildResponse(decision.outcome === "skipped"
            ? { outcome: "rejected", reason: decision.reason || "Skipped by user" }
            : { outcome: "cancelled" });
        }
        return null;
      }

      const savedPath = await this.persistGeneratedImage(
        decision.filePath,
        String(params?.description ?? ""),
        Array.isArray(params?.referenceImagePaths)
          ? params.referenceImagePaths
          : [],
      );
      this.emitUpdate({
        sessionUpdate: "background_task",
        status: "completed",
        toolName: "Generate image",
        message: `Generated SVG image at ${savedPath}`,
      });
      if (id !== undefined && id !== null) {
        return buildResponse({
          outcome: "generated",
          filePath: savedPath,
        });
      }
      return null;
    }

    return buildResponse({
      outcome: "cancelled",
    });
  }

  private normalizeCursorQuestions(questions: any): CursorQuestionPrompt[] {
    if (!Array.isArray(questions)) {
      return [];
    }
    return questions
      .map((question) => ({
        id: String(question?.id ?? ""),
        prompt: String(question?.prompt ?? ""),
        options: Array.isArray(question?.options)
          ? question.options
              .map((option: any) => ({
                id: String(option?.id ?? ""),
                label: String(option?.label ?? ""),
              }))
              .filter((option: any) => option.id && option.label)
          : [],
        allowMultiple: !!question?.allowMultiple,
      }))
      .filter((question) => question.id && question.prompt && question.options.length);
  }

  private async ensureFolder(pathValue: string): Promise<void> {
    const segments = pathValue.split("/").filter(Boolean);
    let current = "";
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (!existing) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  private async writeTextFile(pathValue: string, content: string): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(pathValue);
    if (existing) {
      await this.app.vault.modify(existing as any, content);
      return;
    }
    const folder = path.posix.dirname(pathValue);
    if (folder && folder !== ".") {
      await this.ensureFolder(folder);
    }
    await this.app.vault.create(pathValue, content);
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "item";
  }

  private getTimestampSlug(): string {
    return new Date().toISOString().replace(/[:.]/g, "-");
  }

  private async persistCursorPlan(params: any): Promise<string> {
    const baseName = this.slugify(
      String(params?.name || params?.overview || "cursor-plan"),
    );
    const planPath = `${CURSOR_ACP_ROOT}/Plans/${this.getTimestampSlug()}-${baseName}.md`;
    const parts = [
      `# ${params?.name || "Cursor Plan"}`,
      params?.overview ? `> ${String(params.overview).trim()}` : "",
      "## Plan",
      String(params?.plan || "").trim(),
    ].filter(Boolean);

    if (Array.isArray(params?.phases) && params.phases.length > 0) {
      parts.push("## Phases");
      for (const phase of params.phases) {
        if (phase?.name) {
          parts.push(`### ${phase.name}`);
        }
        if (Array.isArray(phase?.todos)) {
          for (const todo of phase.todos) {
            parts.push(this.renderTodoLine(todo));
          }
        }
      }
    } else if (Array.isArray(params?.todos) && params.todos.length > 0) {
      parts.push("## Todos");
      for (const todo of params.todos) {
        parts.push(this.renderTodoLine(todo));
      }
    }

    await this.writeTextFile(planPath, parts.join("\n\n").trim() + "\n");
    return planPath;
  }

  private renderTodoLine(todo: any): string {
    const status = String(todo?.status || "pending");
    const content = String(todo?.content || todo?.title || "").trim();
    if (!content) {
      return "";
    }
    if (status === "completed") {
      return `- [x] ${content}`;
    }
    if (status === "cancelled") {
      return `- [x] ~~${content}~~ (cancelled)`;
    }
    if (status === "in_progress") {
      return `- [ ] ${content} (in progress)`;
    }
    return `- [ ] ${content}`;
  }

  private parseCursorTodoBoard(content: string): Map<string, any> {
    const todos = new Map<string, any>();
    const regex =
      /<!--\s*cursor-todo:(\{.*?\})\s*-->\s*\n- \[[ x]\] (.+?)(?:\r?\n|$)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      try {
        const meta = JSON.parse(match[1]);
        todos.set(String(meta.id), {
          id: String(meta.id),
          content: String(meta.content || meta.title || match[2] || ""),
          status: String(meta.status || "pending"),
        });
      } catch {
        // Ignore malformed entries
      }
    }
    return todos;
  }

  private renderCursorTodoBoard(todos: Map<string, any>): string {
    const lines = ["# Cursor ACP Todos", ""];
    for (const todo of todos.values()) {
      lines.push(`<!-- cursor-todo:${JSON.stringify(todo)} -->`);
      lines.push(this.renderTodoLine(todo));
      lines.push("");
    }
    return lines.join("\n").trimEnd() + "\n";
  }

  private async persistCursorTodos(todos: any[], merge: boolean): Promise<string> {
    const todoPath = `${CURSOR_ACP_ROOT}/Todos.md`;
    let current = new Map<string, any>();
    const existing = this.app.vault.getAbstractFileByPath(todoPath);
    if (merge && existing) {
      current = this.parseCursorTodoBoard(await this.app.vault.read(existing as any));
    }
    if (!merge) {
      current.clear();
    }
    for (const todo of todos) {
      const id = String(todo?.id || "");
      const content = String(todo?.content || todo?.title || "").trim();
      if (!id || !content) continue;
      current.set(id, {
        id,
        content,
        status: String(todo?.status || "pending"),
      });
    }
    await this.writeTextFile(todoPath, this.renderCursorTodoBoard(current));
    return todoPath;
  }

  private async persistCursorTask(params: any): Promise<string> {
    const taskPath = `${CURSOR_ACP_ROOT}/Tasks.md`;
    const existing = this.app.vault.getAbstractFileByPath(taskPath);
    const current = existing ? await this.app.vault.read(existing as any) : "# Cursor ACP Tasks\n";
    const entry = [
      "",
      `## ${new Date().toLocaleString()} | ${params?.description || "Task"}`,
      `- Type: ${params?.subagentType?.custom || params?.subagentType || "unspecified"}`,
      params?.model ? `- Model: ${params.model}` : "",
      params?.agentId ? `- Agent ID: ${params.agentId}` : "",
      params?.durationMs ? `- Duration: ${params.durationMs}ms` : "",
      "",
      "### Prompt",
      "```text",
      String(params?.prompt || "").trim(),
      "```",
    ]
      .filter(Boolean)
      .join("\n");
    await this.writeTextFile(taskPath, `${current.trimEnd()}\n${entry}\n`);
    return taskPath;
  }

  private normalizeGeneratedImagePath(filePath?: string): string {
    const trimmed = String(filePath || "").trim();
    if (!trimmed) {
      return `${CURSOR_ACP_ROOT}/Generated Images/${this.getTimestampSlug()}.svg`;
    }
    if (trimmed.toLowerCase().endsWith(".svg")) {
      return trimmed;
    }
    return `${trimmed}.svg`;
  }

  private buildSvgImage(
    description: string,
    referenceImagePaths: string[],
  ): string {
    const safeDescription = this.escapeXml(description || "Generated image");
    const refs = referenceImagePaths
      .slice(0, 4)
      .map((ref) => this.escapeXml(ref))
      .join(" | ");
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900" role="img" aria-label="${safeDescription}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1f2937"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="1400" height="900" fill="url(#bg)"/>
  <rect x="60" y="60" width="1280" height="780" rx="28" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.18)"/>
  <text x="96" y="150" fill="#f8fafc" font-family="Arial, sans-serif" font-size="34" font-weight="700">Cursor Generated Placeholder</text>
  <foreignObject x="96" y="190" width="1208" height="500">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, sans-serif; font-size: 28px; line-height: 1.45; color: #e5e7eb; white-space: pre-wrap;">${safeDescription}</div>
  </foreignObject>
  <text x="96" y="760" fill="#cbd5e1" font-family="Arial, sans-serif" font-size="20">References: ${refs || "None"}</text>
</svg>`;
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  private async persistGeneratedImage(
    filePath: string,
    description: string,
    referenceImagePaths: string[],
  ): Promise<string> {
    const normalized = this.normalizeGeneratedImagePath(filePath);
    const svg = this.buildSvgImage(description, referenceImagePaths);
    await this.writeTextFile(normalized, svg);
    return normalized;
  }

  private emitUpdate(update: any) {
    for (const handler of this.updateHandlers) {
      handler(update);
    }
  }

  private buildPlanEntriesFromCursorRequest(params: any): any[] {
    const phasedEntries = this.buildPlanEntriesFromCursorPhases(params?.phases);
    if (phasedEntries.length > 0) {
      return phasedEntries;
    }
    return this.buildPlanEntriesFromCursorTodos(params?.todos);
  }

  private buildPlanEntriesFromCursorPhases(phases: any): any[] {
    if (!Array.isArray(phases)) {
      return [];
    }
    const entries: any[] = [];
    for (const phase of phases) {
      const phaseName =
        typeof phase?.name === "string" ? phase.name.trim() : "";
      if (phaseName) {
        entries.push({
          status: "completed",
          content: phaseName,
        });
      }
      entries.push(...this.buildPlanEntriesFromCursorTodos(phase?.todos));
    }
    return entries;
  }

  private buildPlanEntriesFromCursorTodos(todos: any): any[] {
    if (!Array.isArray(todos)) {
      return [];
    }
    return todos
      .map((todo) => ({
        status: todo?.status || "pending",
        content: todo?.content || todo?.title || "",
      }))
      .filter((entry) => entry.content);
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
      if (!this.cursorProcess?.stdin) {
        reject(new Error("Cursor Agent process not available"));
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

      this.cursorProcess.stdin.write(JSON.stringify(fullRequest) + "\n");
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
    if (!this.cursorProcess?.stdin) {
      return;
    }
    this.cursorProcess.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
      }) + "\n",
    );
  }

  async createSession(): Promise<string> {
    if (!this.isConnected()) {
      throw new Error("Cursor Agent not connected");
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
      this.updateModelsFromResponse(response.result);
      this.updateConfigOptionsFromResponse(response.result);
      if (!sessionId) {
        throw new Error("Failed to create session: No session ID returned");
      }

      this.currentSessionId = sessionId;
      if (response.result?.mode?.id || response.result?.currentModeId) {
        this.currentModeId = String(
          response.result?.mode?.id || response.result?.currentModeId,
        );
      }
      return sessionId;
    } catch (error: any) {
      throw new Error(`Failed to create session: ${error.message}`);
    }
  }

  async loadSession(sessionId: string): Promise<string> {
    if (!this.isConnected()) {
      throw new Error("Cursor Agent not connected");
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
    if (response.result?.mode?.id || response.result?.currentModeId) {
      this.currentModeId = String(
        response.result?.mode?.id || response.result?.currentModeId,
      );
    }
    return sessionId;
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
      throw new Error("Cursor Agent not connected");
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
      throw new Error("Cursor Agent not connected");
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
      throw new Error("Cursor Agent not connected");
    }

    if (!this.currentSessionId) {
      console.log("Cursor ACP: No session, creating new one...");
      await this.createSession();
    }

    console.log(
      "Cursor ACP: Sending session/prompt to session",
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
          console.log("Cursor ACP: session/prompt completed", {
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
          console.error("Cursor ACP: session/prompt failed:", error.message);
          reject(error);
        });
    });
  }

  async editFile(filePath: string, instruction: string): Promise<string> {
    if (!this.isConnected()) {
      throw new Error("Cursor Agent not connected");
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
      throw new Error("Cursor Agent not connected");
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
    this.activePromptRequestId = null;
    this.updateHandlers = [];
    this.stdoutBuffer = "";
    this.availableModels = [];
    this.currentModelId = null;
    this.currentModeId = null;
    this.configOptions = [];
    this.modelListeners.clear();
    this.configListeners.clear();
    this.rejectAllPendingMessages(
      new Error("Cursor Agent process disconnected"),
    );
    if (this.cursorProcess && !this.cursorProcess.killed) {
      this.cursorProcess.kill("SIGTERM");
      this.cursorProcess = null;
    }
  }

  resetSession(): void {
    this.currentSessionId = null;
  }

  isConnected(): boolean {
    return this.cursorProcess !== null && !this.cursorProcess.killed;
  }

  getACPClient(): ACPClient {
    return this.acpClient;
  }
}
