import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAgentPrompt } from '../../dist-bridge/src/shared/prompt.js';

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

test('returns the user prompt when no Logseq context exists', () => {
  assert.equal(buildAgentPrompt(baseRequest), 'Develop this idea');
});

test('includes current page context', () => {
  const prompt = buildAgentPrompt({
    ...baseRequest,
    context: {
      currentPage: { name: 'Project Plan', originalName: 'Project Plan' },
    },
  });

  assert.match(prompt, /Use the following Logseq context/);
  assert.match(prompt, /Current page: Project Plan/);
  assert.match(prompt, /User request:\nDevelop this idea/);
});

test('includes current block context', () => {
  const prompt = buildAgentPrompt({
    ...baseRequest,
    context: {
      currentBlock: { uuid: 'block-1', content: 'Draft opening paragraph' },
    },
  });

  assert.match(prompt, /Current block:\nDraft opening paragraph/);
});

test('includes selected text context', () => {
  const prompt = buildAgentPrompt({
    ...baseRequest,
    context: {
      selectedText: 'Selected sentence',
    },
  });

  assert.match(prompt, /Selected text:\nSelected sentence/);
});
