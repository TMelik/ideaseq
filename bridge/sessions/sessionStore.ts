import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  AgentEvent,
  AgentProviderId,
  AgentRequest,
  AgentSession,
  AgentSessionSummary,
  AgentSessionTurn,
} from '../../src/shared/types.js';

function sessionRoot(graphPath?: string): string {
  const root = graphPath && graphPath.trim() ? graphPath.trim() : process.cwd();
  return join(root, '.ideaseq', 'sessions');
}

function sessionPath(root: string, id: string): string {
  const path = resolve(root, `${id}.json`);
  const resolvedRoot = resolve(root);
  if (path !== resolvedRoot && !path.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error('Invalid session id');
  }
  return path;
}

function now(): string {
  return new Date().toISOString();
}

function titleFromPrompt(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Untitled session';
  return normalized.length > 64 ? `${normalized.slice(0, 61)}...` : normalized;
}

function summarize(session: AgentSession): AgentSessionSummary {
  return {
    id: session.id,
    title: session.title,
    provider: session.provider,
    graphPath: session.graphPath,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    turnCount: session.turns.length,
  };
}

async function ensureRoot(graphPath?: string): Promise<string> {
  const root = sessionRoot(graphPath);
  await mkdir(root, { recursive: true });
  return root;
}

export async function listSessions(graphPath?: string): Promise<AgentSessionSummary[]> {
  const root = await ensureRoot(graphPath);
  const files = await readdir(root).catch(() => []);
  const sessions = await Promise.all(files
    .filter((file) => file.endsWith('.json'))
    .map(async (file) => {
      try {
        return summarize(JSON.parse(await readFile(join(root, file), 'utf8')) as AgentSession);
      } catch {
        return null;
      }
    }));

  return sessions
    .filter((session): session is AgentSessionSummary => !!session)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadSession(id: string, graphPath?: string): Promise<AgentSession | null> {
  const root = await ensureRoot(graphPath);
  try {
    return JSON.parse(await readFile(sessionPath(root, id), 'utf8')) as AgentSession;
  } catch {
    return null;
  }
}

async function saveSession(session: AgentSession): Promise<void> {
  const root = await ensureRoot(session.graphPath);
  await writeFile(sessionPath(root, session.id), `${JSON.stringify(session, null, 2)}\n`, 'utf8');
}

export async function getOrCreateSession(request: AgentRequest): Promise<AgentSession> {
  const graphPath = request.settings.graphPath || request.context.graphPath;
  if (request.sessionId) {
    const existing = await loadSession(request.sessionId, graphPath);
    if (existing) return existing;
  }

  const createdAt = now();
  const session: AgentSession = {
    id: randomUUID(),
    title: titleFromPrompt(request.prompt),
    provider: request.provider as AgentProviderId,
    graphPath,
    createdAt,
    updatedAt: createdAt,
    turns: [],
  };
  await saveSession(session);
  return session;
}

export async function appendSessionTurn(
  session: AgentSession,
  request: AgentRequest,
  events: AgentEvent[],
): Promise<AgentSession> {
  const createdAt = now();
  const completedAt = now();
  const response = events
    .filter((event): event is Extract<AgentEvent, { type: 'message' }> => event.type === 'message')
    .map((event) => event.text)
    .join('\n\n');

  const turn: AgentSessionTurn = {
    id: randomUUID(),
    prompt: request.prompt,
    response,
    intent: request.intent,
    createdAt,
    completedAt,
    events,
  };

  const next: AgentSession = {
    ...session,
    updatedAt: completedAt,
    turns: [...session.turns, turn],
  };
  await saveSession(next);
  return next;
}

export function toSessionSummary(session: AgentSession): AgentSessionSummary {
  return summarize(session);
}
