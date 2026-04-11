export interface ACPRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: any;
}

export interface ACPResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface ACPCapabilities {
  fs?: {
    readTextFile: boolean;
    writeTextFile: boolean;
  };
  terminal?: {
    create: boolean;
    resize: boolean;
    kill: boolean;
  };
}

export interface ClientInfo {
  name: string;
  version: string;
  capabilities: ACPCapabilities;
}

export interface SessionInfo {
  sessionId: string;
  clientInfo: ClientInfo;
}

export interface FileReadParams {
  sessionId: string;
  path: string;
  line?: number;
  limit?: number;
}

export interface FileWriteParams {
  sessionId: string;
  path: string;
  content: string;
}