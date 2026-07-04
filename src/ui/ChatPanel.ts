import { checkBridgeHealth, streamAgentEvents } from '../bridgeClient/client';
import { insertBlockAfter, replaceBlockContent } from '../logseq/blockEditor';
import { getGraphContext, summarizeContext } from '../logseq/graphAdapter';
import { getSettings } from '../logseq/settings';
import { appendAssistantText } from '../shared/agentText';
import type { EditIntent, PanelOpenOptions } from '../shared/types';
import { EditPreview } from './EditPreview';

export class ChatPanel {
  private readonly root: HTMLElement;
  private readonly prompt: HTMLTextAreaElement;
  private readonly output: HTMLDivElement;
  private readonly status: HTMLElement;
  private readonly context: HTMLElement;
  private readonly healthIndicator: HTMLElement;
  private readonly sendBtn: HTMLButtonElement;
  private readonly stopBtn: HTMLButtonElement;
  private readonly refreshBtn: HTMLButtonElement;
  private readonly copyBridgeCommandBtn: HTMLButtonElement;

  private busy = false;
  private abortController: AbortController | null = null;
  private intent: EditIntent = 'chat';
  private targetBlockUuid: string | undefined;
  private originalText = '';

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.className = 'ideaseq';
    this.root.innerHTML = '';

    const header = document.createElement('header');
    header.className = 'ideaseq-header';

    const title = document.createElement('span');
    title.className = 'ideaseq-title';
    title.textContent = 'Ideaseq';

    this.healthIndicator = document.createElement('span');
    this.healthIndicator.className = 'ideaseq-health-indicator offline';
    this.healthIndicator.textContent = 'Offline';

    const headerActions = document.createElement('div');
    headerActions.className = 'ideaseq-header-actions';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'ideaseq-close-button';
    closeButton.title = 'Close Ideaseq';
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => {
      if (this.busy) {
        this.cancel();
      }
      logseq.hideMainUI();
    });

    headerActions.append(this.healthIndicator, closeButton);
    header.append(title, headerActions);

    this.context = document.createElement('div');
    this.context.className = 'ideaseq-context';
    this.context.textContent = 'Loading context...';

    this.prompt = document.createElement('textarea');
    this.prompt.className = 'ideaseq-prompt';
    this.prompt.placeholder = 'Brainstorm, develop, or rewrite with the current Logseq context...\n(Ctrl+Enter to send)';
    this.prompt.rows = 5;
    this.prompt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void this.submit();
      }
    });

    const actions = document.createElement('div');
    actions.className = 'ideaseq-actions';

    this.sendBtn = document.createElement('button');
    this.sendBtn.type = 'button';
    this.sendBtn.textContent = 'Send';
    this.sendBtn.addEventListener('click', () => void this.submit());

    this.stopBtn = document.createElement('button');
    this.stopBtn.type = 'button';
    this.stopBtn.textContent = 'Stop';
    this.stopBtn.className = 'stop-button';
    this.stopBtn.style.display = 'none';
    this.stopBtn.addEventListener('click', () => this.cancel());

    this.refreshBtn = document.createElement('button');
    this.refreshBtn.type = 'button';
    this.refreshBtn.textContent = 'Refresh context';
    this.refreshBtn.addEventListener('click', () => void this.refreshContext());

    this.copyBridgeCommandBtn = document.createElement('button');
    this.copyBridgeCommandBtn.type = 'button';
    this.copyBridgeCommandBtn.textContent = 'Copy bridge command';
    this.copyBridgeCommandBtn.style.display = 'none';
    this.copyBridgeCommandBtn.addEventListener('click', () => void this.copyBridgeCommand());

    actions.append(this.copyBridgeCommandBtn, this.refreshBtn, this.stopBtn, this.sendBtn);

    this.status = document.createElement('div');
    this.status.className = 'ideaseq-status';
    this.status.textContent = 'Ready';

    this.output = document.createElement('div');
    this.output.className = 'ideaseq-output';

    this.root.append(header, this.context, this.prompt, actions, this.status, this.output);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.busy) {
          e.preventDefault();
          this.cancel();
        } else {
          try {
            logseq.hideMainUI();
          } catch {
            // Not running inside Logseq iframe (e.g. testing)
          }
        }
      }
    });

    void this.refreshContext();
  }

  open(options: PanelOpenOptions = {}): void {
    this.intent = options.intent ?? 'chat';
    this.targetBlockUuid = options.targetBlockUuid;
    this.originalText = options.originalText ?? '';
    if (options.presetPrompt !== undefined) {
      this.prompt.value = options.presetPrompt;
    }
    this.output.innerHTML = '';
    if (this.intent === 'chat') {
      this.status.textContent = 'Ready';
      if (options.targetBlockUuid === undefined && options.originalText !== undefined) {
        this.appendMessage('error', 'Place the cursor in a Logseq block before using this command.');
      }
    } else {
      this.status.textContent = this.targetBlockUuid
        ? 'Ready to generate edit preview.'
        : 'No current block target.';
    }
    void this.refreshContext();
  }

  async checkHealth(): Promise<boolean> {
    const settings = getSettings();
    const ok = await checkBridgeHealth(settings.bridgeUrl);
    if (ok) {
      this.healthIndicator.className = 'ideaseq-health-indicator online';
      this.healthIndicator.textContent = 'Online';
      this.sendBtn.removeAttribute('disabled');
      this.copyBridgeCommandBtn.style.display = 'none';
      if (this.status.textContent?.startsWith('Bridge offline')) {
        this.status.textContent = 'Ready';
      }
    } else {
      this.healthIndicator.className = 'ideaseq-health-indicator offline';
      this.healthIndicator.textContent = 'Offline';
      this.sendBtn.setAttribute('disabled', 'true');
      this.copyBridgeCommandBtn.style.display = 'inline-block';
      this.status.textContent = 'Bridge offline. Run npm run bridge, then refresh.';
    }
    return ok;
  }

  async refreshContext(): Promise<void> {
    this.context.textContent = summarizeContext(await getGraphContext());
    void this.checkHealth();
  }

  private appendMessage(type: string, text: string): void {
    const el = document.createElement('div');
    el.className = `msg-${type}`;
    el.textContent = text;
    this.output.append(el);
    this.output.scrollTop = this.output.scrollHeight;
  }

  private cancel(): void {
    if (this.abortController && !this.abortController.signal.aborted) {
      this.abortController.abort();
      this.appendMessage('status', 'Execution cancelled by user.');
      this.status.textContent = 'Cancelled';
    }
  }

  private async copyBridgeCommand(): Promise<void> {
    try {
      await navigator.clipboard.writeText('npm run bridge');
      this.status.textContent = 'Copied: npm run bridge';
    } catch {
      this.status.textContent = 'Bridge command: npm run bridge';
    }
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    if (busy) {
      this.sendBtn.style.display = 'none';
      this.refreshBtn.style.display = 'none';
      this.copyBridgeCommandBtn.style.display = 'none';
      this.stopBtn.style.display = 'inline-block';
      this.prompt.setAttribute('disabled', 'true');
    } else {
      this.sendBtn.style.display = 'inline-block';
      this.refreshBtn.style.display = 'inline-block';
      this.stopBtn.style.display = 'none';
      this.prompt.removeAttribute('disabled');
      void this.checkHealth();
    }
  }

  private resetToChat(status: string): void {
    this.intent = 'chat';
    this.targetBlockUuid = undefined;
    this.originalText = '';
    this.status.textContent = status;
  }

  private renderEditPreview(generatedText: string): void {
    if (this.intent !== 'insert-below' && this.intent !== 'rewrite-block') return;

    const targetBlockUuid = this.targetBlockUuid;
    if (!targetBlockUuid) {
      this.appendMessage('error', 'No current block target.');
      this.status.textContent = 'Error';
      return;
    }

    const intent = this.intent;
    new EditPreview({
      container: this.output,
      intent,
      originalText: this.originalText,
      generatedText,
      onAccept: async () => {
        try {
          if (intent === 'insert-below') {
            await insertBlockAfter(targetBlockUuid, generatedText);
          } else {
            await replaceBlockContent(targetBlockUuid, generatedText);
          }
          this.output.innerHTML = '';
          this.appendMessage('status', intent === 'insert-below' ? 'Inserted below block.' : 'Block rewritten.');
          this.resetToChat('Applied');
          await this.refreshContext();
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown edit error';
          this.appendMessage('error', msg);
          this.status.textContent = 'Error';
          throw error;
        }
      },
      onReject: () => {
        this.output.innerHTML = '';
        this.appendMessage('status', 'Edit rejected.');
        this.resetToChat('Rejected');
      },
    });
    this.status.textContent = 'Review generated edit.';
  }

  private async submit(): Promise<void> {
    if (this.busy) return;

    const prompt = this.prompt.value.trim();
    if (!prompt) {
      this.status.textContent = 'Enter a prompt first.';
      return;
    }

    const online = await this.checkHealth();
    if (!online) {
      this.status.textContent = 'Bridge is offline.';
      return;
    }

    const isEditIntent = this.intent === 'insert-below' || this.intent === 'rewrite-block';
    if (isEditIntent && !this.targetBlockUuid) {
      this.status.textContent = 'No current block target.';
      this.output.innerHTML = '';
      this.appendMessage('error', 'Place the cursor in a Logseq block before using this command.');
      return;
    }

    this.setBusy(true);
    this.output.innerHTML = '';
    this.status.textContent = 'Sending...';

    this.abortController = new AbortController();
    let generatedText = '';
    let failed = false;

    try {
      const settings = getSettings();
      const context = await getGraphContext();
      const request = {
        provider: settings.provider,
        prompt,
        intent: this.intent,
        context,
        settings,
      };

      for await (const event of streamAgentEvents(settings.bridgeUrl, request, this.abortController.signal)) {
        if (event.type === 'start') {
          this.status.textContent = `Running on ${event.provider}...`;
          this.appendMessage('status', `Started ${event.provider}`);
        } else if (event.type === 'status') {
          this.appendMessage('status', event.text);
        } else if (event.type === 'message') {
          if (isEditIntent) {
            generatedText = appendAssistantText(generatedText, event.text);
          } else {
            this.appendMessage('assistant', event.text);
          }
        } else if (event.type === 'stderr') {
          this.appendMessage('stderr', event.text);
        } else if (event.type === 'error') {
          failed = true;
          this.appendMessage('error', event.message);
          this.status.textContent = 'Error';
        } else if (event.type === 'done') {
          const exitText = event.exitCode !== null ? ` (exit ${event.exitCode})` : '';
          if (event.exitCode && event.exitCode !== 0) {
            failed = true;
            this.appendMessage('error', `Codex exited with code ${event.exitCode}.`);
            this.status.textContent = 'Error';
          } else if (isEditIntent && !failed) {
            if (generatedText.trim()) {
              this.renderEditPreview(generatedText);
            } else {
              this.appendMessage('error', 'Codex did not return text for the edit preview.');
              this.status.textContent = 'Error';
            }
          } else {
            this.appendMessage('status', `Finished${exitText}`);
            this.status.textContent = 'Ready';
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Cancelled by user abort
      } else {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        this.appendMessage('error', msg);
        this.status.textContent = 'Error';
      }
    } finally {
      this.abortController = null;
      this.setBusy(false);
    }
  }
}
