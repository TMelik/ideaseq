import { createServer, type ServerResponse } from 'node:http';
import { runCodex } from './providers/codexProvider.js';
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

  try {
    const events = runCodex(request, abortController.signal);
    for await (const event of events) {
      if (res.destroyed || res.writableEnded) {
        break;
      }
      sendEvent(res, event);
    }
  } catch (error) {
    if (!res.destroyed && !res.writableEnded) {
      sendEvent(res, { type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  } finally {
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
