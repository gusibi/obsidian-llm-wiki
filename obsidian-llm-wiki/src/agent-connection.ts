import { ACPClient } from "./acp-client";

export interface ACPModelOption {
  id: string;
  name: string;
  displayName?: string;
  provider?: string;
  description?: string;
  effort?: string;
}

export interface ACPConfigSelectOption {
  value: string;
  name: string;
  description?: string;
}

export interface ACPConfigSelectGroup {
  group: string;
  name: string;
  options: ACPConfigSelectOption[];
}

export interface ACPConfigOption {
  id: string;
  name: string;
  description?: string;
  category?: string;
  type?: string;
  currentValue: string;
  options: ACPConfigSelectOption[] | ACPConfigSelectGroup[];
}

export interface ACPConnection {
  connect(): Promise<boolean>;
  disconnect(): void;
  isConnected(): boolean;
  onUpdate(handler: (update: any) => void): () => void;
  sendChatMessage(
    message: string,
    onChunk?: (chunk: string, update: any) => void,
  ): Promise<string>;
  createSession(): Promise<string>;
  loadSession?(sessionId: string): Promise<string>;
  editFile(filePath: string, instruction: string): Promise<string>;
  analyzeTags(filePath: string, content: string): Promise<string[]>;
  resetSession(): void;
  getACPClient(): ACPClient;
  getAvailableModels?(): ACPModelOption[];
  getCurrentModelId?(): string | null;
  setSessionModel?(modelId: string): Promise<void>;
  cancelCurrentPrompt?(): Promise<void>;
  onModelsUpdated?(handler: (models: ACPModelOption[]) => void): () => void;
  getConfigOptions?(): ACPConfigOption[];
  onConfigOptionsUpdated?(
    handler: (options: ACPConfigOption[]) => void,
  ): () => void;
  setSessionConfigOption?(configId: string, value: string): Promise<void>;
}

/**
 * Shared parser for the `models` field returned by ACP `session/new` and
 * `session/load` responses. Normalizes the various field names that
 * different agents use (modelId/id, displayName/label/name, effort/reasoning,
 * etc.) into our internal ACPModelOption shape.
 */
export function parseAvailableModels(result: any): ACPModelOption[] {
  const models = result?.models;
  if (!models) return [];
  const available = Array.isArray(models.availableModels)
    ? models.availableModels
    : [];
  if (available.length === 0) return [];
  return available.map((model: any) => ({
    id: model.modelId || model.id || model.name,
    name:
      model.displayName ||
      model.name ||
      model.label ||
      model.modelId ||
      model.id,
    displayName: model.displayName || model.label || model.name,
    provider: model.provider || model.vendor,
    description: model.description,
    effort:
      model.effort ||
      model.reasoningEffort ||
      model.thinking ||
      model.thinkingLevel ||
      model.reasoning ||
      model.reasoningLevel,
  }));
}

export function parseCurrentModelId(result: any): string | null {
  const id =
    result?.models?.currentModelId ||
    result?.models?.currentModel?.modelId ||
    null;
  return id ? String(id) : null;
}

/**
 * Shared parser for the `configOptions` field returned by ACP session
 * responses. Preserves grouped vs flat option shape.
 */
export function parseConfigOptions(result: any): ACPConfigOption[] {
  const raw = result?.configOptions;
  if (!Array.isArray(raw)) return [];
  return raw.map((opt: any) => {
    const options = Array.isArray(opt?.options) ? opt.options : [];
    let normalized: ACPConfigSelectOption[] | ACPConfigSelectGroup[];
    if (options.length > 0 && options[0] && "group" in options[0]) {
      normalized = options.map((g: any) => ({
        group: g.group,
        name: g.name,
        options: Array.isArray(g.options)
          ? g.options.map((o: any) => ({
              value: o.value,
              name: o.name,
              description: o.description,
            }))
          : [],
      })) as ACPConfigSelectGroup[];
    } else {
      normalized = options.map((o: any) => ({
        value: o.value,
        name: o.name,
        description: o.description,
      })) as ACPConfigSelectOption[];
    }
    return {
      id: opt.id,
      name: opt.name,
      description: opt.description,
      category: opt.category,
      type: opt.type,
      currentValue: opt.currentValue,
      options: normalized,
    };
  });
}
