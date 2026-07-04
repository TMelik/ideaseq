import { spawn } from 'node:child_process';
import { createServer, type ServerResponse } from 'node:http';
import { createInterface } from 'node:readline';

import { buildAgentPrompt } from '../src/shared/prompt.js';
import type { AgentEvent, AgentRequest } from '../src/shared/types.js';

const DEFAULT_PORT = 45321;

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'access-control-allow-origin': '*',
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendEvent(res: ServerResponse, event: AgentEvent): void {
  res.write(`${JSON.stringify(event)}\n`);
}

async function readJsonBody(req: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function isAgentRequest(value: unknown): value is AgentRequest {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.provider === 'codex'
    && typeof record.prompt === 'string'
    && !!record.context
    && typeof record.context === 'object'
    && !!record.settings
    && typeof record.settings === 'object';
}

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

async function handleChat(res: ServerResponse, request: AgentRequest): Promise<void> {
  res.writeHead(200, {
    'access-control-allow-origin': '*',
    'cache-control': 'no-cache',
    'connection': 'keep-alive',
    'content-type': 'application/x-ndjson; charset=utf-8',
  });

  sendEvent(res, { type: 'start', provider: request.provider });

  const child = spawn(request.settings.codexCommand || 'codex', codexArgs(request), {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
  });

  const stop = () => {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  };
  res.on('close', stop);

  child.on('error', (error) => {
    sendEvent(res, { type: 'error', message: error.message });
    res.end();
  });

  child.stdin.end(buildAgentPrompt(request));

  const stdout = createInterface({ input: child.stdout });
  stdout.on('line', (line) => {
    if (!line.trim()) return;
    try {
      sendEvent(res, { type: 'codex-event', event: JSON.parse(line) });
    } catch {
      sendEvent(res, { type: 'stdout', text: line });
    }
  });

  const stderr = createInterface({ input: child.stderr });
  stderr.on('line', (line) => {
    if (line.trim()) {
      sendEvent(res, { type: 'stderr', text: line });
    }
  });

  child.on('close', (exitCode) => {
    res.off('close', stop);
    sendEvent(res, { type: 'done', exitCode });
    res.end();
  });
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-origin': '*',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true, name: 'ideaseq-bridge' });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    try {
      const body = await readJsonBody(req);
      if (!isAgentRequest(body)) {
        sendJson(res, 400, { error: 'Invalid agent request' });
        return;
      }
      await handleChat(res, body);
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : 'Unknown error' });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

const port = Number(process.env.IDEASEQ_BRIDGE_PORT || DEFAULT_PORT);
server.on('error', (error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Ideaseq bridge listening on http://127.0.0.1:${port}`);
});
