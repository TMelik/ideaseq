import '@logseq/libs';

export async function insertBlockAfter(siblingUuid: string, content: string): Promise<void> {
  await logseq.Editor.insertBlock(siblingUuid, content, { sibling: true });
}

export async function replaceBlockContent(uuid: string, content: string): Promise<void> {
  await logseq.Editor.updateBlock(uuid, content);
}

export async function replaceSelectedTextInBlock(
  uuid: string,
  originalBlockText: string,
  selectedText: string,
  replacement: string,
): Promise<void> {
  const first = originalBlockText.indexOf(selectedText);
  if (!selectedText || first === -1 || originalBlockText.indexOf(selectedText, first + selectedText.length) !== -1) {
    throw new Error('Selected text must appear exactly once in the current block.');
  }

  await logseq.Editor.updateBlock(
    uuid,
    `${originalBlockText.slice(0, first)}${replacement}${originalBlockText.slice(first + selectedText.length)}`,
  );
}

export async function replaceBlocks(blocks: Array<{ uuid: string; content: string }>): Promise<void> {
  for (const block of blocks) {
    await logseq.Editor.updateBlock(block.uuid, block.content);
  }
}
