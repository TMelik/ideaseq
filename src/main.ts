import '@logseq/libs';
import './style.css';

import { registerSettings } from './logseq/settings';

const MAIN_UI_ID = 'ideaseq-main';
let panelReady = false;

type IdeaseqRuntimeState = {
  bootstrapped?: boolean;
};

const runtimeState = globalThis as typeof globalThis & {
  __ideaseqRuntimeState__?: IdeaseqRuntimeState;
};

function getRuntimeState(): IdeaseqRuntimeState {
  if (!runtimeState.__ideaseqRuntimeState__) {
    runtimeState.__ideaseqRuntimeState__ = {};
  }
  return runtimeState.__ideaseqRuntimeState__;
}

function ensureAppRoot(): HTMLElement {
  const existing = document.getElementById('app');
  if (existing) return existing;

  const root = document.createElement('div');
  root.id = 'app';
  document.body.append(root);
  return root;
}

async function ensurePanel(): Promise<void> {
  if (panelReady) return;
  const { ChatPanel } = await import('./ui/ChatPanel');
  new ChatPanel(ensureAppRoot());
  panelReady = true;
}

async function showMainUI(): Promise<void> {
  await ensurePanel();
  logseq.showMainUI();
}

async function main(): Promise<void> {
  const state = getRuntimeState();
  if (state.bootstrapped) {
    return;
  }
  state.bootstrapped = true;

  registerSettings();

  logseq.setMainUIInlineStyle({
    position: 'fixed',
    zIndex: 11,
    right: '12px',
    top: '48px',
    width: '420px',
    maxWidth: 'calc(100vw - 24px)',
    height: 'calc(100vh - 72px)',
    boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18)',
    borderRadius: '8px',
    overflow: 'hidden',
  });

  logseq.App.registerUIItem('toolbar', {
    key: MAIN_UI_ID,
    template: '<a class="button" data-on-click="showIdeaseq" title="Ideaseq">Ideas</a>',
  });

  logseq.provideModel({
    showIdeaseq: () => {
      void showMainUI();
    },
  });

  logseq.App.registerCommandPalette(
    {
      key: 'ideaseq-open',
      label: 'Ideaseq: Open chat',
    },
    () => {
      void showMainUI();
    },
  );

  logseq.Editor.registerSlashCommand('Ideaseq brainstorm', async () => {
    await showMainUI();
  });
}

logseq.ready(main).catch((error) => {
  console.error('Ideaseq failed to start', error);
});
