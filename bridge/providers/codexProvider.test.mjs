import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { normalizeCodexEvent } from '../../dist-bridge/bridge/providers/codexProvider.js';

test('normalizes fixture Codex JSONL events', () => {
  const lines = readFileSync(new URL('../test-fixtures/codex-raw.jsonl', import.meta.url), 'utf8')
    .split('\n')
    .filter(Boolean);

  const events = lines
    .map((line) => normalizeCodexEvent(JSON.parse(line)))
    .filter(Boolean);

  assert.deepEqual(events[0], {
    type: 'status',
    text: 'Thread started: 019f2cf2-cf52-7c82-bda5-6644434cddcd',
  });
  assert.ok(events.some((event) => event.type === 'status' && event.text === 'Turn started'));
  assert.ok(events.some((event) => event.type === 'status' && event.text === 'Executing: /usr/bin/zsh -lc ls'));
  assert.ok(events.some((event) => event.type === 'message' && event.text.startsWith('Hello.')));
  assert.ok(events.some((event) => event.type === 'status' && event.text === 'Turn completed'));
});

test('normalizes Codex error events', () => {
  assert.deepEqual(normalizeCodexEvent({ type: 'error', message: 'bad request' }), {
    type: 'error',
    message: 'bad request',
  });
});

test('keeps unknown Codex event types visible as status', () => {
  assert.deepEqual(normalizeCodexEvent({ type: 'session.updated' }), {
    type: 'status',
    text: 'Codex event: session.updated',
  });
});

test('ignores invalid raw events', () => {
  assert.equal(normalizeCodexEvent(null), null);
  assert.equal(normalizeCodexEvent('not-json'), null);
});
