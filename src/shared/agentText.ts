export function appendAssistantText(current: string, next: string): string {
  if (!current) return next;
  return `${current}\n\n${next}`;
}
