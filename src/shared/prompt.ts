import type { AgentRequest, GraphContext } from './types.js';

const EDIT_OUTPUT_INSTRUCTION = [
  'Return ONLY the text/markdown that should replace the block or be inserted.',
  'Do not include introductory or concluding remarks, conversational filler, or codeblock wraps.',
].join(' ');

const BATCH_EDIT_OUTPUT_INSTRUCTION = [
  'Return ONLY valid JSON in this exact shape: {"blocks":[{"uuid":"block uuid","content":"replacement markdown"}]}.',
  'Include every selected block that should change and do not wrap the JSON in a code block.',
].join(' ');

function formatContext(context: GraphContext): string {
  const lines: string[] = [];

  if (context.currentPage?.name) {
    lines.push(`Current page: ${context.currentPage.name}`);
  }

  if (context.currentBlock?.content) {
    lines.push('Current block:');
    lines.push(context.currentBlock.content);
  }

  if (context.selectedBlocks?.length) {
    lines.push('Selected blocks:');
    for (const block of context.selectedBlocks) {
      lines.push(`- ${block.content}`);
    }
  }

  if (context.childBlocks?.length) {
    lines.push('Child blocks:');
    for (const block of context.childBlocks) {
      lines.push(`- ${block.content}`);
    }
  }

  if (context.selectedText) {
    lines.push('Selected text:');
    lines.push(context.selectedText);
  }

  if (context.attachments?.length) {
    lines.push('Attached context:');
    for (const attachment of context.attachments) {
      lines.push(`[${attachment.kind}] ${attachment.label}`);
      if (attachment.path) lines.push(`Path: ${attachment.path}`);
      if (attachment.uuid) lines.push(`UUID: ${attachment.uuid}`);
      if (attachment.content) lines.push(attachment.content);
    }
  }

  return lines.join('\n');
}

export function buildAgentPrompt(request: AgentRequest): string {
  const contextText = formatContext(request.context);
  const isEditIntent = request.intent === 'insert-below'
    || request.intent === 'rewrite-block'
    || request.intent === 'rewrite-selection'
    || request.intent === 'rewrite-selected-blocks';
  const editInstruction = request.intent === 'rewrite-selected-blocks'
    ? BATCH_EDIT_OUTPUT_INSTRUCTION
    : EDIT_OUTPUT_INSTRUCTION;
  const header = isEditIntent
    ? ['Use the following Logseq context while editing.', '', editInstruction]
    : ['Use the following Logseq context while brainstorming.'];

  const history = (request.history ?? [])
    .slice(-6)
    .flatMap((turn) => [
      `User: ${turn.prompt}`,
      turn.response ? `Assistant: ${turn.response}` : '',
    ])
    .filter(Boolean)
    .join('\n\n');

  if (!contextText) {
    if (!isEditIntent && !history) return request.prompt;
    return [
      isEditIntent ? editInstruction : '',
      history ? ['Previous conversation:', history].join('\n') : '',
      '',
      'User request:',
      request.prompt,
    ].filter((part) => part !== '').join('\n');
  }

  return [
    ...header,
    history ? ['Previous conversation:', history, ''].join('\n') : '',
    '',
    contextText,
    '',
    'User request:',
    request.prompt,
  ].join('\n');
}
