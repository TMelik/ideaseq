import type { AgentEvent, AgentRequest } from '../shared/types';

export async function checkBridgeHealth(bridgeUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${bridgeUrl.replace(/\/$/, '')}/health`, {
      method: 'GET',
      headers: { 'accept': 'application/json' },
    });
    if (!res.ok) return false;
    const data = await res.json() as Record<string, unknown>;
    return data.ok === true && data.name === 'ideaseq-bridge';
  } catch {
    return false;
  }
}

export async function* streamAgentEvents(
  bridgeUrl: string,
  request: AgentRequest,
  signal?: AbortSignal,
): AsyncGenerator<AgentEvent> {
  const response = await fetch(`${bridgeUrl.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`Bridge request failed: ${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      yield JSON.parse(line) as AgentEvent;
    }
  }

  if (buffer.trim()) {
    yield JSON.parse(buffer) as AgentEvent;
  }
}
