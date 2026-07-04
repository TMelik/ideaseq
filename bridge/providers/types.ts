import type { AgentEvent, AgentRequest } from '../../src/shared/types.js';

export type ProviderRunner = (
  request: AgentRequest,
  signal?: AbortSignal
) => AsyncIterable<AgentEvent>;
