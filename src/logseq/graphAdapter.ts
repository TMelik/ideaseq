import '@logseq/libs';

import type { GraphContext } from '../shared/types';

type CurrentGraph = {
  path?: string;
};

type CurrentPage = {
  name?: string;
  originalName?: string;
};

type CurrentBlock = {
  uuid?: string;
  content?: string;
};

export async function getGraphContext(): Promise<GraphContext> {
  const [graph, page, block] = await Promise.all([
    logseq.App.getCurrentGraph() as Promise<CurrentGraph | null>,
    logseq.Editor.getCurrentPage() as Promise<CurrentPage | null>,
    logseq.Editor.getCurrentBlock() as Promise<CurrentBlock | null>,
  ]);

  return {
    graphPath: graph?.path,
    currentPage: page?.name
      ? { name: page.name, originalName: page.originalName }
      : undefined,
    currentBlock: block?.uuid
      ? { uuid: block.uuid, content: block.content ?? '' }
      : undefined,
  };
}

export function summarizeContext(context: GraphContext): string {
  const parts: string[] = [];
  if (context.currentPage?.name) parts.push(`page: ${context.currentPage.name}`);
  if (context.currentBlock?.content) parts.push('current block');
  if (context.graphPath) parts.push('graph path available');
  return parts.length > 0 ? parts.join(', ') : 'no active Logseq context';
}
