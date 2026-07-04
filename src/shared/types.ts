export type AgentProviderId = 'codex';

export type ApprovalMode = 'on-request' | 'never';

export type SandboxMode = 'read-only' | 'workspace-write';

export type EditIntent = 'chat' | 'insert-below' | 'rewrite-block' | 'rewrite-selection' | 'rewrite-selected-blocks';

export interface BlockContext {
  uuid: string;
  content: string;
}

export interface ContextAttachment {
  id: string;
  kind: 'page' | 'block' | 'file' | 'selection';
  label: string;
  content?: string;
  path?: string;
  uuid?: string;
}

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
  currentBlock?: BlockContext;
  selectedBlocks?: BlockContext[];
  childBlocks?: BlockContext[];
  selectedText?: string;
  attachments?: ContextAttachment[];
}

export interface AgentRequest {
  sessionId?: string;
  provider: AgentProviderId;
  prompt: string;
  intent?: EditIntent;
  context: GraphContext;
  history?: AgentSessionTurn[];
  settings: Pick<IdeaseqSettings, 'codexCommand' | 'model' | 'graphPath' | 'sandbox' | 'approvalMode'>;
}

export interface PanelOpenOptions {
  intent?: EditIntent;
  targetBlockUuid?: string;
  originalText?: string;
  presetPrompt?: string;
}

export interface AgentSessionTurn {
  id: string;
  prompt: string;
  response: string;
  intent?: EditIntent;
  createdAt: string;
  completedAt?: string;
  events: AgentEvent[];
}

export interface AgentSession {
  id: string;
  title: string;
  provider: AgentProviderId;
  graphPath?: string;
  createdAt: string;
  updatedAt: string;
  turns: AgentSessionTurn[];
}

export interface AgentSessionSummary {
  id: string;
  title: string;
  provider: AgentProviderId;
  graphPath?: string;
  createdAt: string;
  updatedAt: string;
  turnCount: number;
}

export interface ToolEvent {
  id: string;
  phase: 'started' | 'completed';
  command: string;
  output?: string;
  exitCode?: number | null;
}

export type AgentEvent =
  | { type: 'start'; provider: string; sessionId?: string }
  | { type: 'session'; session: AgentSessionSummary }
  | { type: 'message'; text: string }
  | { type: 'status'; text: string }
  | { type: 'tool'; tool: ToolEvent }
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
