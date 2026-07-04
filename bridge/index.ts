import { createServer, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { runCodex } from './providers/codexProvider.js';
import type { AgentEvent, AgentRequest } from '../src/shared/types.js';
import {
  appendSessionTurn,
  getOrCreateSession,
  listSessions,
  loadSession,
  toSessionSummary,
} from './sessions/sessionStore.js';

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

function getQueryParam(url: string | undefined, key: string): string | undefined {
  const value = new URL(url ?? '/', 'http://127.0.0.1').searchParams.get(key);
  return value ?? undefined;
}

function matchSessionUrl(url: string | undefined): string | null {
  const pathname = new URL(url ?? '/', 'http://127.0.0.1').pathname;
  const match = pathname.match(/^\/api\/sessions\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function readGraphFile(graphPath: string | undefined, relativePath: string | undefined): Promise<string> {
  if (!graphPath || !relativePath) {
    throw new Error('graphPath and path are required');
  }

  const root = resolve(graphPath);
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error('File path must stay inside graph root');
  }

  return readFile(target, 'utf8');
}

async function handleChat(res: ServerResponse, request: AgentRequest): Promise<void> {
  res.writeHead(200, {
    'access-control-allow-origin': '*',
    'cache-control': 'no-cache',
    'connection': 'keep-alive',
    'content-type': 'application/x-ndjson; charset=utf-8',
  });

  const abortController = new AbortController();
  const stop = () => {
    abortController.abort();
  };
  res.on('close', stop);

  const session = await getOrCreateSession(request);
  const capturedEvents: AgentEvent[] = [];

  try {
    sendEvent(res, { type: 'session', session: toSessionSummary(session) });
    const events = runCodex({ ...request, sessionId: session.id, history: session.turns }, abortController.signal);
    for await (const event of events) {
      if (res.destroyed || res.writableEnded) {
        break;
      }
      const outgoing = event.type === 'start'
        ? { ...event, sessionId: session.id }
        : event;
      capturedEvents.push(outgoing);
      sendEvent(res, outgoing);
    }
  } catch (error) {
    if (!res.destroyed && !res.writableEnded) {
      const event: AgentEvent = { type: 'error', message: error instanceof Error ? error.message : String(error) };
      capturedEvents.push(event);
      sendEvent(res, event);
    }
  } finally {
    if (!abortController.signal.aborted && capturedEvents.length > 0) {
      await appendSessionTurn(session, request, capturedEvents).catch(() => undefined);
    }
    res.off('close', stop);
    if (!res.destroyed && !res.writableEnded) {
      res.end();
    }
  }
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

  if (req.method === 'GET' && new URL(req.url ?? '/', 'http://127.0.0.1').pathname === '/api/sessions') {
    sendJson(res, 200, { sessions: await listSessions(getQueryParam(req.url, 'graphPath')) });
    return;
  }

  if (req.method === 'GET' && new URL(req.url ?? '/', 'http://127.0.0.1').pathname === '/api/context/file') {
    try {
      sendJson(res, 200, {
        content: await readGraphFile(getQueryParam(req.url, 'graphPath'), getQueryParam(req.url, 'path')),
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : 'Unable to read file' });
    }
    return;
  }

  const sessionId = matchSessionUrl(req.url);
  if (req.method === 'GET' && sessionId) {
    const session = await loadSession(sessionId, getQueryParam(req.url, 'graphPath'));
    if (!session) {
      sendJson(res, 404, { error: 'Session not found' });
      return;
    }
    sendJson(res, 200, { session });
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
