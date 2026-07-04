import type { AgentRequest, GraphContext } from './types.js';

const EDIT_OUTPUT_INSTRUCTION = [
  'Return ONLY the text/markdown that should replace the block or be inserted.',
  'Do not include introductory or concluding remarks, conversational filler, or codeblock wraps.',
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

  return lines.join('\n');
}

export function buildAgentPrompt(request: AgentRequest): string {
  const contextText = formatContext(request.context);
  const isEditIntent = request.intent === 'insert-below' || request.intent === 'rewrite-block';
  const header = isEditIntent
    ? ['Use the following Logseq context while editing.', '', EDIT_OUTPUT_INSTRUCTION]
    : ['Use the following Logseq context while brainstorming.'];

  if (!contextText) {
    if (!isEditIntent) return request.prompt;
    return [
      EDIT_OUTPUT_INSTRUCTION,
      '',
      'User request:',
      request.prompt,
    ].join('\n');
  }

  return [
    ...header,
    '',
    contextText,
    '',
    'User request:',
    request.prompt,
  ].join('\n');
}
