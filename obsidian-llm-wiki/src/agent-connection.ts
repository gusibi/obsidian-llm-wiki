import { ACPClient } from "./acp-client";

export interface ACPModelOption {
  id: string;
  name: string;
  displayName?: string;
  provider?: string;
  description?: string;
  effort?: string;
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
}
