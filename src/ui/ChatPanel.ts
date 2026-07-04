import {
  checkBridgeHealth,
  getAgentSession,
  listAgentSessions,
  readGraphFile,
  streamAgentEvents,
} from '../bridgeClient/client';
import {
  insertBlockAfter,
  replaceBlockContent,
  replaceBlocks,
  replaceSelectedTextInBlock,
} from '../logseq/blockEditor';
import { getGraphContext, getPageAttachment, summarizeContext } from '../logseq/graphAdapter';
import { getSettings } from '../logseq/settings';
import { appendAssistantText } from '../shared/agentText';
import type {
  AgentEvent,
  AgentSessionSummary,
  BlockContext,
  ContextAttachment,
  EditIntent,
  GraphContext,
  PanelOpenOptions,
} from '../shared/types';
import { EditPreview } from './EditPreview';

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function fileUrlToPath(url: URL): string {
  const path = decodeURIComponent(url.pathname);
  if (/^\/[A-Za-z]:\//.test(path)) {
    return path.slice(1);
  }
  return path;
}

function pluginRootPathFromLocation(): string | null {
  const url = new URL(window.location.href);
  if (url.protocol !== 'file:') return null;

  const path = fileUrlToPath(url);
  const distIndexMatch = /[/\\]dist[/\\]index\.html$/;
  if (distIndexMatch.test(path)) {
    return path.replace(distIndexMatch, '');
  }
  return path.replace(/[/\\][^/\\]*$/, '');
}

function bridgeCommand(): string {
  const pluginRootPath = pluginRootPathFromLocation();
  return pluginRootPath ? `npm --prefix ${shellQuote(pluginRootPath)} run bridge` : 'npm run bridge';
}

export class ChatPanel {
  private readonly root: HTMLElement;
  private readonly prompt: HTMLTextAreaElement;
  private readonly output: HTMLDivElement;
  private readonly status: HTMLElement;
  private readonly context: HTMLElement;
  private readonly contextList: HTMLElement;
  private readonly healthIndicator: HTMLElement;
  private readonly sendBtn: HTMLButtonElement;
  private readonly stopBtn: HTMLButtonElement;
  private readonly refreshBtn: HTMLButtonElement;
  private readonly sessionSelect: HTMLSelectElement;
  private readonly contextModeSelect: HTMLSelectElement;
  private readonly newSessionBtn: HTMLButtonElement;
  private readonly copyBridgeCommandBtn: HTMLButtonElement;

  private busy = false;
  private abortController: AbortController | null = null;
  private intent: EditIntent = 'chat';
  private targetBlockUuid: string | undefined;
  private originalText = '';
  private sessionId: string | undefined;
  private contextMode: 'follow' | 'locked' = 'follow';
  private lastContext: GraphContext = {};
  private autoAttachments: ContextAttachment[] = [];
  private manualAttachments: ContextAttachment[] = [];

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

    this.contextList = document.createElement('div');
    this.contextList.className = 'ideaseq-context-list';

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

    this.sessionSelect = document.createElement('select');
    this.sessionSelect.className = 'ideaseq-session-select';
    this.sessionSelect.title = 'Session history';
    this.sessionSelect.addEventListener('change', () => void this.openSelectedSession());

    this.contextModeSelect = document.createElement('select');
    this.contextModeSelect.className = 'ideaseq-mode-select';
    this.contextModeSelect.title = 'Page context mode';
    const followOption = document.createElement('option');
    followOption.value = 'follow';
    followOption.textContent = 'Follow page';
    const lockedOption = document.createElement('option');
    lockedOption.value = 'locked';
    lockedOption.textContent = 'Lock page';
    this.contextModeSelect.append(followOption, lockedOption);
    this.contextModeSelect.value = this.contextMode;
    this.contextModeSelect.addEventListener('change', () => {
      this.contextMode = this.contextModeSelect.value === 'locked' ? 'locked' : 'follow';
      this.status.textContent = this.contextMode === 'follow'
        ? 'Following current page.'
        : 'Page context locked.';
      if (this.contextMode === 'follow') {
        void this.refreshContext();
      } else {
        this.renderContextSummary();
        this.renderContextList();
      }
    });

    this.newSessionBtn = document.createElement('button');
    this.newSessionBtn.type = 'button';
    this.newSessionBtn.textContent = 'New';
    this.newSessionBtn.title = 'Start a new session';
    this.newSessionBtn.addEventListener('click', () => {
      this.sessionId = undefined;
      this.output.innerHTML = '';
      this.status.textContent = 'New session';
      this.sessionSelect.value = '';
    });

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
    this.refreshBtn.textContent = 'Reload context';
    this.refreshBtn.title = 'Reload the current Logseq context';
    this.refreshBtn.addEventListener('click', () => void this.refreshContext());

    this.copyBridgeCommandBtn = document.createElement('button');
    this.copyBridgeCommandBtn.type = 'button';
    this.copyBridgeCommandBtn.textContent = 'Copy bridge command';
    this.copyBridgeCommandBtn.style.display = 'none';
    this.copyBridgeCommandBtn.addEventListener('click', () => void this.copyBridgeCommand());

    const attachPageBtn = document.createElement('button');
    attachPageBtn.type = 'button';
    attachPageBtn.textContent = '+Page';
    attachPageBtn.title = 'Attach current page';
    attachPageBtn.addEventListener('click', () => this.attachCurrentPage());

    actions.append(
      this.sessionSelect,
      this.contextModeSelect,
      this.newSessionBtn,
      attachPageBtn,
      this.copyBridgeCommandBtn,
      this.refreshBtn,
      this.stopBtn,
      this.sendBtn,
    );

    this.status = document.createElement('div');
    this.status.className = 'ideaseq-status';
    this.status.textContent = 'Ready';

    this.output = document.createElement('div');
    this.output.className = 'ideaseq-output';

    this.root.append(header, this.context, this.contextList, this.prompt, actions, this.status, this.output);

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
    } else if (this.intent === 'rewrite-selected-blocks') {
      this.status.textContent = 'Ready to generate selected blocks edit preview.';
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
      void this.loadSessionList();
    } else {
      this.healthIndicator.className = 'ideaseq-health-indicator offline';
      this.healthIndicator.textContent = 'Offline';
      this.sendBtn.setAttribute('disabled', 'true');
      this.copyBridgeCommandBtn.style.display = 'inline-block';
      this.status.textContent = `Bridge offline. Run ${bridgeCommand()}, then refresh.`;
    }
    return ok;
  }

  async refreshContext(): Promise<void> {
    await this.updateContextFromLogseq();
    this.renderContextSummary();
    this.renderContextList();
    void this.checkHealth();
  }

  async handleRouteChanged(): Promise<void> {
    if (this.contextMode !== 'follow') {
      this.renderContextSummary();
      this.renderContextList();
      return;
    }
    await this.refreshContext();
  }

  private async updateContextFromLogseq(): Promise<GraphContext> {
    this.lastContext = await getGraphContext();
    this.autoAttachments = await this.buildAutoAttachments(this.lastContext);
    return this.lastContext;
  }

  private renderContextSummary(): void {
    const prefix = this.contextMode === 'follow' ? 'Follow page' : 'Locked page';
    this.context.textContent = `${prefix}: ${summarizeContext(this.withAttachments(this.lastContext, []))}`;
  }

  private appendMessage(type: string, text: string): void {
    const el = document.createElement('div');
    el.className = `msg-${type}`;
    el.textContent = text;
    this.output.append(el);
    this.output.scrollTop = this.output.scrollHeight;
  }

  private appendTool(tool: Extract<AgentEvent, { type: 'tool' }>['tool']): void {
    const el = document.createElement('details');
    el.className = 'msg-tool';
    el.open = tool.phase === 'started';

    const summary = document.createElement('summary');
    const exitText = tool.exitCode !== undefined && tool.exitCode !== null ? ` exit ${tool.exitCode}` : '';
    summary.textContent = `${tool.phase === 'started' ? 'Running' : 'Finished'}: ${tool.command}${exitText}`;
    el.append(summary);

    if (tool.output) {
      const pre = document.createElement('pre');
      pre.textContent = tool.output;
      el.append(pre);
    }

    this.output.append(el);
    this.output.scrollTop = this.output.scrollHeight;
  }

  private renderContextList(extraAttachments: ContextAttachment[] = []): void {
    this.contextList.innerHTML = '';
    const attachments = [...this.autoAttachments, ...this.manualAttachments, ...extraAttachments];
    if (attachments.length === 0) {
      this.contextList.textContent = 'No active context. Use buttons or @page(...), @block(...), @file(...).';
      return;
    }

    for (const attachment of attachments) {
      const item = document.createElement('span');
      item.className = 'ideaseq-context-item';
      const isAuto = this.autoAttachments.some((auto) => auto.id === attachment.id);
      const prefix = isAuto ? (this.contextMode === 'follow' ? 'auto ' : 'locked ') : '';
      item.textContent = `${prefix}${attachment.kind}: ${attachment.label}`;

      if (this.manualAttachments.some((manual) => manual.id === attachment.id)) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '×';
        remove.title = 'Detach context';
        remove.addEventListener('click', () => {
          this.manualAttachments = this.manualAttachments.filter((manual) => manual.id !== attachment.id);
          this.renderContextList(extraAttachments);
        });
        item.append(remove);
      }

      this.contextList.append(item);
    }
  }

  private withAttachments(context: GraphContext, mentionAttachments: ContextAttachment[]): GraphContext {
    const seen = new Set<string>();
    const attachments = [...this.autoAttachments, ...this.manualAttachments, ...mentionAttachments].filter((attachment) => {
      if (seen.has(attachment.id)) return false;
      seen.add(attachment.id);
      return true;
    });
    return attachments.length > 0 ? { ...context, attachments } : context;
  }

  private async buildAutoAttachments(context: GraphContext): Promise<ContextAttachment[]> {
    const pageName = context.currentPage?.name;
    if (!pageName) return [];
    return [await getPageAttachment(pageName)];
  }

  private async attachCurrentPage(): Promise<void> {
    const context = await getGraphContext();
    const page = context.currentPage;
    if (!page?.name) {
      this.status.textContent = 'No current page to attach.';
      return;
    }
    this.addManualAttachment(await getPageAttachment(page.name));
  }

  private addManualAttachment(attachment: ContextAttachment): void {
    this.manualAttachments = [
      ...this.manualAttachments.filter((existing) => existing.id !== attachment.id),
      attachment,
    ];
    this.renderContextList();
    this.status.textContent = 'Context attached.';
  }

  private async resolveMentionAttachments(prompt: string, context: GraphContext): Promise<ContextAttachment[]> {
    const attachments: ContextAttachment[] = [];
    const settings = getSettings();
    const graphPath = settings.graphPath || context.graphPath;

    for (const match of prompt.matchAll(/@page\(([^)]+)\)/g)) {
      const name = match[1].trim();
      if (name) {
        const attachment = await getPageAttachment(name);
        attachments.push({ ...attachment, id: `mention:page:${name}` });
      }
    }

    for (const match of prompt.matchAll(/@block\(([^)]+)\)/g)) {
      const uuid = match[1].trim();
      if (!uuid) continue;
      const block = await logseq.Editor.getBlock(uuid).catch(() => null) as BlockContext | null;
      attachments.push({
        id: `mention:block:${uuid}`,
        kind: 'block',
        label: uuid,
        uuid,
        content: block?.content,
      });
    }

    for (const match of prompt.matchAll(/@file\(([^)]+)\)/g)) {
      const path = match[1].trim();
      if (!path || !graphPath) continue;
      const content = await readGraphFile(settings.bridgeUrl, graphPath, path);
      attachments.push({
        id: `mention:file:${path}`,
        kind: 'file',
        label: path,
        path,
        content: content ?? undefined,
      });
    }

    return attachments;
  }

  private async loadSessionList(): Promise<void> {
    const settings = getSettings();
    const graphPath = settings.graphPath || this.lastContext.graphPath;
    const sessions = await listAgentSessions(settings.bridgeUrl, graphPath);
    this.renderSessionOptions(sessions);
  }

  private renderSessionOptions(sessions: AgentSessionSummary[]): void {
    const currentValue = this.sessionId ?? '';
    this.sessionSelect.innerHTML = '';

    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'New session';
    this.sessionSelect.append(blank);

    for (const session of sessions) {
      const option = document.createElement('option');
      option.value = session.id;
      option.textContent = `${session.title} (${session.turnCount})`;
      this.sessionSelect.append(option);
    }

    this.sessionSelect.value = currentValue;
  }

  private async openSelectedSession(): Promise<void> {
    const id = this.sessionSelect.value;
    if (!id) {
      this.sessionId = undefined;
      this.output.innerHTML = '';
      return;
    }

    const settings = getSettings();
    const session = await getAgentSession(settings.bridgeUrl, id, settings.graphPath || this.lastContext.graphPath);
    if (!session) {
      this.status.textContent = 'Session not found.';
      return;
    }

    this.sessionId = session.id;
    this.output.innerHTML = '';
    for (const turn of session.turns) {
      this.appendMessage('user', turn.prompt);
      for (const event of turn.events) {
        this.renderEvent(event, false);
      }
    }
    this.status.textContent = `Loaded session: ${session.title}`;
  }

  private renderEvent(event: AgentEvent, collectAssistant: boolean): string {
    let generatedText = '';
    if (event.type === 'start') {
      this.status.textContent = `Running on ${event.provider}...`;
      this.appendMessage('status', `Started ${event.provider}`);
    } else if (event.type === 'session') {
      this.sessionId = event.session.id;
      this.sessionSelect.value = event.session.id;
    } else if (event.type === 'status') {
      this.appendMessage('status', event.text);
    } else if (event.type === 'tool') {
      this.appendTool(event.tool);
    } else if (event.type === 'message') {
      if (collectAssistant) {
        generatedText = event.text;
      } else {
        this.appendMessage('assistant', event.text);
      }
    } else if (event.type === 'stderr') {
      this.appendMessage('stderr', event.text);
    } else if (event.type === 'error') {
      this.appendMessage('error', event.message);
      this.status.textContent = 'Error';
    } else if (event.type === 'done') {
      const exitText = event.exitCode !== null ? ` (exit ${event.exitCode})` : '';
      this.appendMessage('status', `Finished${exitText}`);
      this.status.textContent = 'Ready';
    }
    return generatedText;
  }

  private cancel(): void {
    if (this.abortController && !this.abortController.signal.aborted) {
      this.abortController.abort();
      this.appendMessage('status', 'Execution cancelled by user.');
      this.status.textContent = 'Cancelled';
    }
  }

  private async copyBridgeCommand(): Promise<void> {
    const command = bridgeCommand();
    try {
      await navigator.clipboard.writeText(command);
      this.status.textContent = `Copied: ${command}`;
    } catch {
      this.status.textContent = `Bridge command: ${command}`;
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

  private isEditIntent(): boolean {
    return this.intent === 'insert-below'
      || this.intent === 'rewrite-block'
      || this.intent === 'rewrite-selection'
      || this.intent === 'rewrite-selected-blocks';
  }

  private parseBatchEdit(generatedText: string): Array<{ uuid: string; content: string }> {
    const parsed = JSON.parse(generatedText) as { blocks?: Array<{ uuid?: unknown; content?: unknown }> };
    if (!Array.isArray(parsed.blocks)) {
      throw new Error('Batch edit response must contain a blocks array.');
    }
    return parsed.blocks.map((block) => {
      if (typeof block.uuid !== 'string' || typeof block.content !== 'string') {
        throw new Error('Every batch edit block must include uuid and content strings.');
      }
      return { uuid: block.uuid, content: block.content };
    });
  }

  private renderBatchEditPreview(generatedText: string): void {
    let blocks: Array<{ uuid: string; content: string }>;
    try {
      blocks = this.parseBatchEdit(generatedText);
    } catch (error) {
      this.appendMessage('error', error instanceof Error ? error.message : 'Invalid batch edit response.');
      this.status.textContent = 'Error';
      return;
    }

    this.output.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'ideaseq-preview';

    const title = document.createElement('div');
    title.className = 'ideaseq-preview-title';
    title.textContent = `Selected blocks preview (${blocks.length})`;
    root.append(title);

    for (const block of blocks) {
      const section = document.createElement('section');
      section.className = 'ideaseq-preview-section';

      const heading = document.createElement('div');
      heading.className = 'ideaseq-preview-heading';
      heading.textContent = block.uuid;

      const body = document.createElement('pre');
      body.className = 'ideaseq-preview-text';
      body.textContent = block.content;

      section.append(heading, body);
      root.append(section);
    }

    const actions = document.createElement('div');
    actions.className = 'ideaseq-preview-actions';

    const reject = document.createElement('button');
    reject.type = 'button';
    reject.textContent = 'Reject';
    reject.addEventListener('click', () => {
      this.output.innerHTML = '';
      this.appendMessage('status', 'Edit rejected.');
      this.resetToChat('Rejected');
    });

    const accept = document.createElement('button');
    accept.type = 'button';
    accept.textContent = 'Accept';
    accept.className = 'primary';
    accept.addEventListener('click', async () => {
      accept.disabled = true;
      reject.disabled = true;
      try {
        await replaceBlocks(blocks);
        this.output.innerHTML = '';
        this.appendMessage('status', 'Selected blocks rewritten.');
        this.resetToChat('Applied');
        await this.refreshContext();
      } catch (error) {
        accept.disabled = false;
        reject.disabled = false;
        this.appendMessage('error', error instanceof Error ? error.message : 'Unknown batch edit error');
        this.status.textContent = 'Error';
      }
    });

    actions.append(reject, accept);
    root.append(actions);
    this.output.append(root);
    this.status.textContent = 'Review generated edit.';
  }

  private renderEditPreview(generatedText: string): void {
    if (!this.isEditIntent()) return;

    if (this.intent === 'rewrite-selected-blocks') {
      this.renderBatchEditPreview(generatedText);
      return;
    }

    const targetBlockUuid = this.targetBlockUuid;
    if (!targetBlockUuid) {
      this.appendMessage('error', 'No current block target.');
      this.status.textContent = 'Error';
      return;
    }

    const intent = this.intent;
    if (intent !== 'insert-below' && intent !== 'rewrite-block' && intent !== 'rewrite-selection') {
      return;
    }
    new EditPreview({
      container: this.output,
      intent,
      originalText: this.originalText,
      generatedText,
      onAccept: async () => {
        try {
          if (intent === 'insert-below') {
            await insertBlockAfter(targetBlockUuid, generatedText);
          } else if (intent === 'rewrite-selection') {
            await replaceSelectedTextInBlock(
              targetBlockUuid,
              this.originalText,
              this.lastContext.selectedText ?? '',
              generatedText,
            );
          } else {
            await replaceBlockContent(targetBlockUuid, generatedText);
          }
          this.output.innerHTML = '';
          this.appendMessage('status', intent === 'insert-below'
            ? 'Inserted below block.'
            : intent === 'rewrite-selection'
              ? 'Selected text rewritten.'
              : 'Block rewritten.');
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

    const isEditIntent = this.isEditIntent();
    if ((this.intent === 'insert-below' || this.intent === 'rewrite-block' || this.intent === 'rewrite-selection') && !this.targetBlockUuid) {
      this.status.textContent = 'No current block target.';
      this.output.innerHTML = '';
      this.appendMessage('error', 'Place the cursor in a Logseq block before using this command.');
      return;
    }

    const context = this.contextMode === 'follow'
      ? await this.updateContextFromLogseq()
      : this.lastContext;
    this.renderContextSummary();
    if (this.intent === 'rewrite-selection' && !context.selectedText) {
      this.status.textContent = 'No selected text.';
      this.output.innerHTML = '';
      this.appendMessage('error', 'Select text inside the current Logseq block before using this command.');
      return;
    }
    if (this.intent === 'rewrite-selected-blocks' && !context.selectedBlocks?.length) {
      this.status.textContent = 'No selected blocks.';
      this.output.innerHTML = '';
      this.appendMessage('error', 'Select one or more Logseq blocks before using this command.');
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
      const mentionAttachments = await this.resolveMentionAttachments(prompt, context);
      this.renderContextList(mentionAttachments);
      const request = {
        sessionId: this.sessionId,
        provider: settings.provider,
        prompt,
        intent: this.intent,
        context: this.withAttachments(context, mentionAttachments),
        settings,
      };

      for await (const event of streamAgentEvents(settings.bridgeUrl, request, this.abortController.signal)) {
        if (event.type === 'message') {
          if (isEditIntent) {
            generatedText = appendAssistantText(generatedText, event.text);
          } else {
            this.renderEvent(event, false);
          }
        } else if (event.type === 'error') {
          failed = true;
          this.renderEvent(event, false);
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
        } else {
          this.renderEvent(event, false);
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
