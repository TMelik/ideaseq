import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { AgentEvent, AgentRequest } from '../../src/shared/types.js';
import { buildAgentPrompt } from '../../src/shared/prompt.js';
import type { ProviderRunner } from './types.js';

function codexArgs(request: AgentRequest): string[] {
  const args = [
    '--ask-for-approval',
    request.settings.approvalMode,
    'exec',
    '--json',
    '--skip-git-repo-check',
    '--sandbox',
    request.settings.sandbox,
  ];

  const cwd = request.settings.graphPath || request.context.graphPath;
  if (cwd) {
    args.push('--cd', cwd);
  }

  if (request.settings.model.trim()) {
    args.push('--model', request.settings.model.trim());
  }

  args.push('-');
  return args;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function textField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function numberField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' ? value : null;
}

export function normalizeCodexEvent(event: unknown): AgentEvent | null {
  if (!event || typeof event !== 'object') return null;
  const record = event as Record<string, unknown>;
  const eventType = textField(record, 'type');

  switch (eventType) {
    case 'thread.started':
      return { type: 'status', text: `Thread started: ${textField(record, 'thread_id')}` };
    case 'turn.started':
      return { type: 'status', text: 'Turn started' };
    case 'turn.completed':
      return { type: 'status', text: 'Turn completed' };
    case 'item.started': {
      const item = record.item;
      if (isRecord(item)) {
        const itemType = textField(item, 'type');
        if (itemType === 'command_execution') {
          return { type: 'status', text: `Executing: ${textField(item, 'command')}` };
        }
        return { type: 'status', text: `Started: ${itemType || 'item'}` };
      }
      return null;
    }
    case 'item.completed': {
      const item = record.item;
      if (isRecord(item)) {
        const itemType = textField(item, 'type');
        if (itemType === 'agent_message') {
          return { type: 'message', text: textField(item, 'text') };
        }
        if (itemType === 'command_execution') {
          const exitCode = numberField(item, 'exit_code');
          const exitText = exitCode !== null ? ` (exit ${exitCode})` : '';
          return { type: 'status', text: `Completed${exitText}: ${textField(item, 'command')}` };
        }
        return { type: 'status', text: `Completed: ${itemType || 'item'}` };
      }
      return null;
    }
    case 'error':
      return { type: 'error', message: textField(record, 'message') || 'Codex error' };
    default:
      if (eventType) {
        return { type: 'status', text: `Codex event: ${eventType}` };
      }
      return null;
  }
}

export const runCodex: ProviderRunner = async function* runCodex(
  request: AgentRequest,
  signal?: AbortSignal
) {
  yield { type: 'start', provider: 'codex' };

  if (signal?.aborted) {
    yield { type: 'error', message: 'Aborted before starting' };
    return;
  }

  const child = spawn(request.settings.codexCommand || 'codex', codexArgs(request), {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
  });

  let killed = false;
  const killProcess = () => {
    if (!killed && !child.killed) {
      killed = true;
      child.kill('SIGTERM');
    }
  };

  if (signal) {
    signal.addEventListener('abort', killProcess);
  }

  // Handle stdin
  try {
    child.stdin.end(buildAgentPrompt(request));
  } catch (error) {
    if (signal) signal.removeEventListener('abort', killProcess);
    killProcess();
    yield { type: 'error', message: `Failed to write stdin: ${error instanceof Error ? error.message : String(error)}` };
    return;
  }

  const eventQueue: AgentEvent[] = [];
  let resolveNextEvent: ((value: void) => void) | null = null;
  let done = false;
  let closeEventSent = false;

  const pushEvent = (event: AgentEvent) => {
    eventQueue.push(event);
    if (resolveNextEvent) {
      resolveNextEvent();
      resolveNextEvent = null;
    }
  };

  const finish = (exitCode: number | null) => {
    if (closeEventSent) return;
    closeEventSent = true;
    done = true;
    pushEvent({ type: 'done', exitCode });
  };

  child.on('error', (err) => {
    pushEvent({ type: 'error', message: err.message });
    finish(null);
  });

  const stdout = createInterface({ input: child.stdout });
  stdout.on('line', (line) => {
    if (!line.trim()) return;
    try {
      const parsed = JSON.parse(line);
      const normalized = normalizeCodexEvent(parsed);
      if (normalized) {
        pushEvent(normalized);
      }
    } catch {
      pushEvent({ type: 'status', text: line });
    }
  });

  const stderr = createInterface({ input: child.stderr });
  stderr.on('line', (line) => {
    if (line.trim()) {
      pushEvent({ type: 'stderr', text: line });
    }
  });

  child.on('close', (exitCode) => {
    finish(exitCode);
  });

  try {
    while (!done || eventQueue.length > 0) {
      if (eventQueue.length === 0) {
        await new Promise<void>((resolve) => {
          resolveNextEvent = resolve;
        });
      }
      while (eventQueue.length > 0) {
        const ev = eventQueue.shift();
        if (ev) yield ev;
      }
    }
  } finally {
    if (signal) {
      signal.removeEventListener('abort', killProcess);
    }
    killProcess();
  }
};
