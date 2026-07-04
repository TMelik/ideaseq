import '@logseq/libs';

export async function insertBlockAfter(siblingUuid: string, content: string): Promise<void> {
  await logseq.Editor.insertBlock(siblingUuid, content, { sibling: true });
}

export async function replaceBlockContent(uuid: string, content: string): Promise<void> {
  await logseq.Editor.updateBlock(uuid, content);
}
