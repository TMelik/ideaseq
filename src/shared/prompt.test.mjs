import assert from 'node:assert/strict';
import test from 'node:test';

import { appendAssistantText } from '../../dist-bridge/src/shared/agentText.js';
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

test('includes selected and child block context', () => {
  const prompt = buildAgentPrompt({
    ...baseRequest,
    context: {
      selectedBlocks: [
        { uuid: 'selected-1', content: 'First selected block' },
        { uuid: 'selected-2', content: 'Second selected block' },
      ],
      childBlocks: [
        { uuid: 'child-1', content: 'Child block' },
      ],
    },
  });

  assert.match(prompt, /Selected blocks:\n- First selected block\n- Second selected block/);
  assert.match(prompt, /Child blocks:\n- Child block/);
});

test('includes attached context', () => {
  const prompt = buildAgentPrompt({
    ...baseRequest,
    context: {
      attachments: [
        { id: 'file:notes.md', kind: 'file', label: 'notes.md', path: 'notes.md', content: 'File notes' },
      ],
    },
  });

  assert.match(prompt, /Attached context:\n\[file\] notes.md/);
  assert.match(prompt, /Path: notes.md/);
  assert.match(prompt, /File notes/);
});

test('includes recent conversation history', () => {
  const prompt = buildAgentPrompt({
    ...baseRequest,
    history: [
      {
        id: 'turn-1',
        prompt: 'First question',
        response: 'First answer',
        createdAt: '2026-07-04T00:00:00.000Z',
        events: [],
      },
    ],
  });

  assert.match(prompt, /Previous conversation:\nUser: First question/);
  assert.match(prompt, /Assistant: First answer/);
});

test('adds edit output contract for edit intents', () => {
  const prompt = buildAgentPrompt({
    ...baseRequest,
    intent: 'rewrite-block',
    context: {
      currentBlock: { uuid: 'block-1', content: 'Original block' },
    },
  });

  assert.match(prompt, /Return ONLY the text\/markdown/);
  assert.match(prompt, /Do not include introductory or concluding remarks/);
  assert.match(prompt, /Current block:\nOriginal block/);
});

test('adds JSON output contract for selected block batch edits', () => {
  const prompt = buildAgentPrompt({
    ...baseRequest,
    intent: 'rewrite-selected-blocks',
    context: {
      selectedBlocks: [
        { uuid: 'block-1', content: 'Original block' },
      ],
    },
  });

  assert.match(prompt, /Return ONLY valid JSON/);
  assert.match(prompt, /"blocks":\[\{"uuid":"block uuid","content":"replacement markdown"\}\]/);
});

test('accumulates assistant message text for edit previews', () => {
  assert.equal(appendAssistantText('', 'First'), 'First');
  assert.equal(appendAssistantText('First', 'Second'), 'First\n\nSecond');
});
