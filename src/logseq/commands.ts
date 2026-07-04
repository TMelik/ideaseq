import '@logseq/libs';

import type { BlockContext, PanelOpenOptions } from '../shared/types';

type SlashCommandArgs = {
  uuid?: string;
};

type OpenPanel = (options?: PanelOpenOptions) => Promise<void>;

type LogseqBlock = {
  uuid?: string;
  content?: string;
};

async function resolveTargetBlock(args?: SlashCommandArgs): Promise<BlockContext | null> {
  const block = args?.uuid
    ? await logseq.Editor.getBlock(args.uuid) as LogseqBlock | null
    : await logseq.Editor.getCurrentBlock() as LogseqBlock | null;

  if (!block?.uuid) return null;
  return {
    uuid: block.uuid,
    content: block.content ?? '',
  };
}

async function openForBlock(
  openPanel: OpenPanel,
  args: SlashCommandArgs | undefined,
  options: Omit<PanelOpenOptions, 'targetBlockUuid' | 'originalText'>,
): Promise<void> {
  const block = await resolveTargetBlock(args);
  await openPanel({
    ...options,
    targetBlockUuid: block?.uuid,
    originalText: block?.content ?? '',
  });
}

export function registerBlockCommands(openPanel: OpenPanel): void {
  logseq.Editor.registerSlashCommand('Ideaseq: Insert below', async (args?: SlashCommandArgs) => {
    await openForBlock(openPanel, args, {
      intent: 'insert-below',
      presetPrompt: 'Generate text to insert below this block.',
    });
  });

  logseq.Editor.registerSlashCommand('Ideaseq: Rewrite block', async (args?: SlashCommandArgs) => {
    await openForBlock(openPanel, args, {
      intent: 'rewrite-block',
      presetPrompt: 'Rewrite this block while preserving its meaning.',
    });
  });
}
