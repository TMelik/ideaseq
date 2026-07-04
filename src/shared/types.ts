export type AgentProviderId = 'codex';

export type ApprovalMode = 'on-request' | 'never';

export type SandboxMode = 'read-only' | 'workspace-write';

export interface IdeaseqSettings {
  bridgeUrl: string;
  provider: AgentProviderId;
  codexCommand: string;
  model: string;
  graphPath: string;
  sandbox: SandboxMode;
  approvalMode: ApprovalMode;
}

export interface GraphContext {
  graphPath?: string;
  currentPage?: {
    name: string;
    originalName?: string;
  };
  currentBlock?: {
    uuid: string;
    content: string;
  };
  selectedText?: string;
}

export interface AgentRequest {
  provider: AgentProviderId;
  prompt: string;
  context: GraphContext;
  settings: Pick<IdeaseqSettings, 'codexCommand' | 'model' | 'graphPath' | 'sandbox' | 'approvalMode'>;
}

export type AgentEvent =
  | { type: 'start'; provider: string }
  | { type: 'message'; text: string }
  | { type: 'status'; text: string }
  | { type: 'stderr'; text: string }
  | { type: 'error'; message: string }
  | { type: 'done'; exitCode: number | null };

export const DEFAULT_SETTINGS: IdeaseqSettings = {
  bridgeUrl: 'http://127.0.0.1:45321',
  provider: 'codex',
  codexCommand: 'codex',
  model: '',
  graphPath: '',
  sandbox: 'workspace-write',
  approvalMode: 'on-request',
};
