import { streamAgentEvents } from '../bridgeClient/client';
import { getGraphContext, summarizeContext } from '../logseq/graphAdapter';
import { getSettings } from '../logseq/settings';
import type { AgentEvent } from '../shared/types';

function eventText(event: AgentEvent): string {
  switch (event.type) {
    case 'start':
      return `Started ${event.provider}`;
    case 'stdout':
    case 'stderr':
      return event.text;
    case 'codex-event':
      return JSON.stringify(event.event);
    case 'error':
      return `Error: ${event.message}`;
    case 'done':
      return `Done: exit ${event.exitCode ?? 'unknown'}`;
  }
}

export class ChatPanel {
  private readonly root: HTMLElement;
  private readonly prompt: HTMLTextAreaElement;
  private readonly output: HTMLPreElement;
  private readonly status: HTMLElement;
  private readonly context: HTMLElement;
  private busy = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.className = 'ideaseq';
    this.root.innerHTML = '';

    const header = document.createElement('header');
    header.className = 'ideaseq-header';
    header.textContent = 'Ideaseq';

    this.context = document.createElement('div');
    this.context.className = 'ideaseq-context';
    this.context.textContent = 'Loading context...';

    this.prompt = document.createElement('textarea');
    this.prompt.className = 'ideaseq-prompt';
    this.prompt.placeholder = 'Brainstorm, develop, or rewrite with the current Logseq context...';
    this.prompt.rows = 5;

    const actions = document.createElement('div');
    actions.className = 'ideaseq-actions';

    const send = document.createElement('button');
    send.type = 'button';
    send.textContent = 'Send';
    send.addEventListener('click', () => void this.submit());

    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.textContent = 'Refresh context';
    refresh.addEventListener('click', () => void this.refreshContext());

    actions.append(refresh, send);

    this.status = document.createElement('div');
    this.status.className = 'ideaseq-status';
    this.status.textContent = 'Ready';

    this.output = document.createElement('pre');
    this.output.className = 'ideaseq-output';

    this.root.append(header, this.context, this.prompt, actions, this.status, this.output);
    void this.refreshContext();
  }

  async refreshContext(): Promise<void> {
    this.context.textContent = summarizeContext(await getGraphContext());
  }

  private append(line: string): void {
    this.output.textContent += `${line}\n`;
    this.output.scrollTop = this.output.scrollHeight;
  }

  private async submit(): Promise<void> {
    if (this.busy) return;

    const prompt = this.prompt.value.trim();
    if (!prompt) {
      this.status.textContent = 'Enter a prompt first.';
      return;
    }

    this.busy = true;
    this.output.textContent = '';
    this.status.textContent = 'Sending...';

    try {
      const settings = getSettings();
      const context = await getGraphContext();
      const request = {
        provider: settings.provider,
        prompt,
        context,
        settings,
      };

      for await (const event of streamAgentEvents(settings.bridgeUrl, request)) {
        this.append(eventText(event));
        if (event.type === 'done') {
          this.status.textContent = 'Ready';
        }
      }
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : 'Unknown error';
    } finally {
      this.busy = false;
    }
  }
}
