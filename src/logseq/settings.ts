import '@logseq/libs';

import type { SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin';

import { DEFAULT_SETTINGS, type IdeaseqSettings } from '../shared/types';

const settingsSchema: SettingSchemaDesc[] = [
  {
    key: 'bridgeUrl',
    type: 'string',
    title: 'Bridge URL',
    description: 'Local Ideaseq bridge URL.',
    default: DEFAULT_SETTINGS.bridgeUrl,
  },
  {
    key: 'codexCommand',
    type: 'string',
    title: 'Codex command',
    description: 'Command or absolute path used by the bridge.',
    default: DEFAULT_SETTINGS.codexCommand,
  },
  {
    key: 'model',
    type: 'string',
    title: 'Model',
    description: 'Optional Codex model override.',
    default: DEFAULT_SETTINGS.model,
  },
  {
    key: 'graphPath',
    type: 'string',
    title: 'Graph path',
    description: 'Absolute path to the Logseq graph. Leave empty to use context path when available.',
    default: DEFAULT_SETTINGS.graphPath,
  },
  {
    key: 'sandbox',
    type: 'enum',
    title: 'Sandbox',
    description: 'Codex sandbox mode.',
    enumChoices: ['read-only', 'workspace-write'],
    default: DEFAULT_SETTINGS.sandbox,
  },
  {
    key: 'approvalMode',
    type: 'enum',
    title: 'Approval mode',
    description: 'Codex approval policy.',
    enumChoices: ['on-request', 'never'],
    default: DEFAULT_SETTINGS.approvalMode,
  },
];

export function registerSettings(): void {
  logseq.useSettingsSchema(settingsSchema);
}

export function getSettings(): IdeaseqSettings {
  const settings = (logseq.settings ?? {}) as Record<string, unknown>;
  return {
    ...DEFAULT_SETTINGS,
    bridgeUrl: String(settings.bridgeUrl || DEFAULT_SETTINGS.bridgeUrl),
    provider: 'codex',
    codexCommand: String(settings.codexCommand || DEFAULT_SETTINGS.codexCommand),
    model: String(settings.model || DEFAULT_SETTINGS.model),
    graphPath: String(settings.graphPath || DEFAULT_SETTINGS.graphPath),
    sandbox: settings.sandbox === 'read-only' ? 'read-only' : 'workspace-write',
    approvalMode: settings.approvalMode === 'never' ? 'never' : 'on-request',
  };
}
