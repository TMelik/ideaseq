import type { AgentRequest, GraphContext } from './types.js';

function formatContext(context: GraphContext): string {
  const lines: string[] = [];

  if (context.currentPage?.name) {
    lines.push(`Current page: ${context.currentPage.name}`);
  }

  if (context.currentBlock?.content) {
    lines.push('Current block:');
    lines.push(context.currentBlock.content);
  }

  if (context.selectedText) {
    lines.push('Selected text:');
    lines.push(context.selectedText);
  }

  return lines.join('\n');
}

export function buildAgentPrompt(request: AgentRequest): string {
  const contextText = formatContext(request.context);
  if (!contextText) {
    return request.prompt;
  }

  return [
    'Use the following Logseq context while brainstorming.',
    '',
    contextText,
    '',
    'User request:',
    request.prompt,
  ].join('\n');
}
