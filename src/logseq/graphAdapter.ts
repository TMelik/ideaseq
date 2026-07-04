import '@logseq/libs';

import type { BlockContext, ContextAttachment, GraphContext } from '../shared/types';

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
  children?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function toBlockContext(value: unknown): BlockContext | null {
  if (!isRecord(value)) return null;
  const uuid = value.uuid;
  const content = value.content;
  if (typeof uuid !== 'string') return null;
  return {
    uuid,
    content: typeof content === 'string' ? content : '',
  };
}

function toBlockContexts(value: unknown): BlockContext[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const blocks = value
    .map(toBlockContext)
    .filter((block): block is BlockContext => !!block);
  return blocks.length > 0 ? blocks : undefined;
}

function flattenBlocks(value: unknown): BlockContext[] {
  if (!Array.isArray(value)) return [];
  const blocks: BlockContext[] = [];
  for (const item of value) {
    const block = toBlockContext(item);
    if (block) blocks.push(block);
    if (isRecord(item)) {
      blocks.push(...flattenBlocks(item.children));
    }
  }
  return blocks;
}

function formatBlocks(blocks: BlockContext[]): string {
  return blocks.map((block) => `- ${block.content}`).join('\n');
}

async function getSelectedBlocks(): Promise<BlockContext[] | undefined> {
  const editor = logseq.Editor as typeof logseq.Editor & {
    getSelectedBlocks?: () => Promise<unknown>;
  };

  if (!editor.getSelectedBlocks) return undefined;

  try {
    return toBlockContexts(await editor.getSelectedBlocks());
  } catch {
    return undefined;
  }
}

async function getChildBlocks(blockUuid?: string): Promise<BlockContext[] | undefined> {
  if (!blockUuid) return undefined;

  try {
    const block = await logseq.Editor.getBlock(blockUuid, { includeChildren: true }) as CurrentBlock | null;
    return toBlockContexts(block?.children);
  } catch {
    return undefined;
  }
}

async function getPageBlocks(pageName: string): Promise<BlockContext[]> {
  const editor = logseq.Editor as typeof logseq.Editor & {
    getPageBlocksTree?: (pageName: string) => Promise<unknown>;
  };

  try {
    const blocks = editor.getPageBlocksTree
      ? await editor.getPageBlocksTree(pageName)
      : await logseq.Editor.getCurrentPageBlocksTree();
    return flattenBlocks(blocks);
  } catch {
    return [];
  }
}

export async function getPageAttachment(pageName: string): Promise<ContextAttachment> {
  const blocks = await getPageBlocks(pageName);
  return {
    id: `page:${pageName}`,
    kind: 'page',
    label: pageName,
    content: blocks.length > 0 ? formatBlocks(blocks) : undefined,
  };
}

function getSelectedText(): string | undefined {
  try {
    const ownSelection = window.getSelection()?.toString().trim();
    if (ownSelection) return ownSelection;
  } catch {
    // Ignore inaccessible selection APIs.
  }

  try {
    const parentSelection = window.parent?.getSelection()?.toString().trim();
    if (parentSelection) return parentSelection;
  } catch {
    // Parent document access can be unavailable.
  }

  return undefined;
}

export async function getGraphContext(): Promise<GraphContext> {
  const [graph, page, block] = await Promise.all([
    logseq.App.getCurrentGraph() as Promise<CurrentGraph | null>,
    logseq.Editor.getCurrentPage() as Promise<CurrentPage | null>,
    logseq.Editor.getCurrentBlock() as Promise<CurrentBlock | null>,
  ]);

  const currentBlock = block?.uuid
    ? { uuid: block.uuid, content: block.content ?? '' }
    : undefined;
  const [selectedBlocks, childBlocks] = await Promise.all([
    getSelectedBlocks(),
    getChildBlocks(currentBlock?.uuid),
  ]);

  return {
    graphPath: graph?.path,
    currentPage: page?.name
      ? { name: page.name, originalName: page.originalName }
      : undefined,
    currentBlock,
    selectedBlocks,
    childBlocks,
    selectedText: getSelectedText(),
  };
}

export function summarizeContext(context: GraphContext): string {
  const parts: string[] = [];
  if (context.currentPage?.name) parts.push(`page: ${context.currentPage.name}`);
  if (context.currentBlock?.content) parts.push('current block');
  if (context.selectedBlocks?.length) parts.push(`${context.selectedBlocks.length} selected block(s)`);
  if (context.selectedText) parts.push('selected text');
  if (context.childBlocks?.length) parts.push(`${context.childBlocks.length} child block(s)`);
  if (context.attachments?.length) parts.push(`${context.attachments.length} attachment(s)`);
  if (context.graphPath) parts.push('graph path available');
  return parts.length > 0 ? parts.join(', ') : 'no active Logseq context';
}
