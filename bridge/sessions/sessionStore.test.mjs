import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  appendSessionTurn,
  getOrCreateSession,
  listSessions,
  loadSession,
} from '../../dist-bridge/bridge/sessions/sessionStore.js';

const baseRequest = {
  provider: 'codex',
  prompt: 'Develop this idea',
  context: {},
  settings: {
    codexCommand: 'codex',
    model: '',
    graphPath: '',
    sandbox: 'workspace-write',
    approvalMode: 'on-request',
  },
};

test('creates, lists, loads, and appends session turns', async () => {
  const graphPath = await mkdtemp(join(tmpdir(), 'ideaseq-session-'));
  const request = {
    ...baseRequest,
    context: { graphPath },
    settings: { ...baseRequest.settings, graphPath },
  };

  const session = await getOrCreateSession(request);
  assert.equal(session.turns.length, 0);

  const updated = await appendSessionTurn(session, request, [
    { type: 'message', text: 'Draft response' },
    { type: 'done', exitCode: 0 },
  ]);

  assert.equal(updated.turns.length, 1);
  assert.equal(updated.turns[0].response, 'Draft response');

  const sessions = await listSessions(graphPath);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, session.id);
  assert.equal(sessions[0].turnCount, 1);

  const loaded = await loadSession(session.id, graphPath);
  assert.equal(loaded?.turns[0].response, 'Draft response');
});
