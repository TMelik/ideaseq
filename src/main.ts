import '@logseq/libs';
import './style.css';

import { registerBlockCommands } from './logseq/commands';
import { registerSettings } from './logseq/settings';
import type { PanelOpenOptions } from './shared/types';
import type { ChatPanel } from './ui/ChatPanel';

const MAIN_UI_ID = 'ideaseq-main';
let panel: ChatPanel | null = null;

type IdeaseqRuntimeState = {
  bootstrapped?: boolean;
  unregisters?: Array<() => void>;
};

const runtimeState = globalThis as typeof globalThis & {
  __ideaseqRuntimeState__?: IdeaseqRuntimeState;
};

type ThemeMode = 'light' | 'dark';

const THEME_VARIABLES = [
  '--ls-primary-background-color',
  '--ls-secondary-background-color',
  '--ls-tertiary-background-color',
  '--ls-quaternary-background-color',
  '--ls-primary-text-color',
  '--ls-secondary-text-color',
  '--ls-title-text-color',
  '--ls-border-color',
  '--ls-secondary-border-color',
  '--ls-link-text-color',
  '--ls-link-text-hover-color',
  '--ls-active-primary-color',
  '--ls-active-secondary-color',
  '--ls-menu-hover-color',
  '--ls-success-background-color',
  '--ls-success-text-color',
  '--ls-error-background-color',
  '--ls-error-text-color',
  '--ls-warning-background-color',
  '--ls-warning-text-color',
];

const IDEASEQ_THEME_LINK_ATTR = 'data-ideaseq-theme-link';
const IDEASEQ_THEME_STYLE_ATTR = 'data-ideaseq-theme-style';
const IDEASEQ_MIRRORED_CLASSES_ATTR = 'data-ideaseq-mirrored-classes';
const THEME_LINK_MARKERS = ['theme', 'plugins', 'plugin'];
const THEME_ATTRIBUTE_NAMES = ['data-theme', 'data-color-scheme'];
const THEME_CLASS_MARKERS = ['dark', 'light', 'theme', 'color-scheme'];
const HOST_BACKGROUND_SELECTORS = [
  '.cp__sidebar-main-content',
  '.ls-block',
  '#app-container',
  '#root',
  'main',
  'body',
];
const HOST_SURFACE_SELECTORS = [
  '.ls-block',
  '.cp__right-sidebar',
  '.ui__modal-panel',
  '.menu-link',
  'textarea',
  'button',
];

function getRuntimeState(): IdeaseqRuntimeState {
  if (!runtimeState.__ideaseqRuntimeState__) {
    runtimeState.__ideaseqRuntimeState__ = {};
  }
  return runtimeState.__ideaseqRuntimeState__;
}

function registerCleanup(unregisters: Array<() => void>): void {
  const state = getRuntimeState();
  state.unregisters = [...(state.unregisters ?? []), ...unregisters];
}

async function cleanupRuntimeState(): Promise<void> {
  const state = getRuntimeState();
  for (const unregister of state.unregisters ?? []) {
    unregister();
  }
  state.unregisters = [];
  state.bootstrapped = false;
}

function applyThemeMode(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode;
  document.body.classList.toggle('dark-theme', mode === 'dark');
  document.body.classList.toggle('light-theme', mode === 'light');
}

function parseRgb(color: string): [number, number, number] | null {
  const match = color.match(/rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)(?:,\s*(\d*(?:\.\d+)?))?\)/i);
  if (!match) return null;

  const alpha = match[4] === undefined || match[4] === '' ? 1 : Number(match[4]);
  if (alpha === 0) return null;

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function getColorLuminance(color: string): number | null {
  const rgb = parseRgb(color);
  if (!rgb) return null;

  const [red, green, blue] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function isUsableColor(color: string): boolean {
  return Boolean(color) && color !== 'transparent' && parseRgb(color) !== null;
}

function pickReadableColor(...colors: string[]): string {
  return colors.find(isUsableColor) ?? '';
}

function findHostElement(parentDocument: Document, selectors: string[]): Element | null {
  for (const selector of selectors) {
    const element = selector === 'body' ? parentDocument.body : parentDocument.querySelector(selector);
    if (element) return element;
  }
  return parentDocument.body;
}

function readHostThemeValue(name: string): string {
  const parentDocument = window.parent?.document;
  if (!parentDocument) return '';

  const rootValue = getComputedStyle(parentDocument.documentElement).getPropertyValue(name).trim();
  if (rootValue) return rootValue;

  return getComputedStyle(parentDocument.body).getPropertyValue(name).trim();
}

function syncHostThemeVariables(): void {
  try {
    for (const name of THEME_VARIABLES) {
      const value = readHostThemeValue(name);
      if (value) {
        document.documentElement.style.setProperty(name, value);
      }
    }
  } catch {
    // Keep local light/dark fallbacks when host theme variables are not readable.
  }
}

function getLinkMatchText(link: HTMLLinkElement): string {
  return [
    link.href,
    link.id,
    link.className,
    ...Object.entries(link.dataset).flatMap(([key, value]) => [key, value ?? '']),
  ].join(' ').toLowerCase();
}

function isIdeaseqStylesheet(href: string): boolean {
  const currentPath = new URL(window.location.href).pathname;
  const targetPath = new URL(href, window.location.href).pathname;

  return href.toLowerCase().includes('ideaseq') || (
    currentPath.includes('/dist/') &&
    targetPath.startsWith(currentPath.slice(0, currentPath.lastIndexOf('/') + 1))
  );
}

function isLikelyThemeStylesheet(link: HTMLLinkElement): boolean {
  if (!link.relList.contains('stylesheet') || !link.href) {
    return false;
  }
  if (!link.href.toLowerCase().includes('.css') || isIdeaseqStylesheet(link.href)) {
    return false;
  }

  const matchText = getLinkMatchText(link);
  return THEME_LINK_MARKERS.some((marker) => matchText.includes(marker));
}

function getStyleMatchText(style: HTMLStyleElement): string {
  return [
    style.id,
    style.className,
    ...Object.entries(style.dataset).flatMap(([key, value]) => [key, value ?? '']),
    style.textContent?.slice(0, 2000) ?? '',
  ].join(' ').toLowerCase();
}

function isLikelyThemeStyle(style: HTMLStyleElement): boolean {
  const matchText = getStyleMatchText(style);
  return THEME_LINK_MARKERS.some((marker) => matchText.includes(marker)) || (
    matchText.includes('--ls-') &&
    (matchText.includes('background') || matchText.includes('color') || matchText.includes('dark'))
  );
}

function syncHostThemeStyles(parentDocument: Document): void {
  try {
    for (const link of document.head.querySelectorAll<HTMLLinkElement>(`link[${IDEASEQ_THEME_LINK_ATTR}="true"]`)) {
      link.remove();
    }
    for (const style of document.head.querySelectorAll<HTMLStyleElement>(`style[${IDEASEQ_THEME_STYLE_ATTR}="true"]`)) {
      style.remove();
    }

    for (const hostLink of parentDocument.head.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]')) {
      if (!isLikelyThemeStylesheet(hostLink)) continue;

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = hostLink.href;
      link.setAttribute(IDEASEQ_THEME_LINK_ATTR, 'true');
      document.head.append(link);
    }

    for (const hostStyle of parentDocument.head.querySelectorAll<HTMLStyleElement>('style')) {
      if (!isLikelyThemeStyle(hostStyle)) continue;

      const style = document.createElement('style');
      style.textContent = hostStyle.textContent;
      style.setAttribute(IDEASEQ_THEME_STYLE_ATTR, 'true');
      document.head.append(style);
    }
  } catch {
    // Parent document access can fail; CSS variable sync below remains the fallback.
  }
}

function syncThemeAttributes(source: HTMLElement, target: HTMLElement): void {
  for (const name of THEME_ATTRIBUTE_NAMES) {
    const value = source.getAttribute(name);
    if (value) {
      target.setAttribute(name, value);
    } else {
      target.removeAttribute(name);
    }
  }
}

function getThemeClasses(element: HTMLElement): string[] {
  return [...element.classList].filter((className) => {
    const normalized = className.toLowerCase();
    return THEME_CLASS_MARKERS.some((marker) => normalized.includes(marker));
  });
}

function replaceMirroredThemeClasses(target: HTMLElement, classes: string[]): void {
  const previous = target.getAttribute(IDEASEQ_MIRRORED_CLASSES_ATTR);
  if (previous) {
    for (const className of previous.split(' ').filter(Boolean)) {
      target.classList.remove(className);
    }
  }

  if (classes.length > 0) {
    target.classList.add(...classes);
    target.setAttribute(IDEASEQ_MIRRORED_CLASSES_ATTR, classes.join(' '));
  } else {
    target.removeAttribute(IDEASEQ_MIRRORED_CLASSES_ATTR);
  }
}

function syncHostThemeSelectors(parentDocument: Document): void {
  syncThemeAttributes(parentDocument.documentElement, document.documentElement);
  syncThemeAttributes(parentDocument.body, document.body);
  replaceMirroredThemeClasses(document.documentElement, getThemeClasses(parentDocument.documentElement));
  replaceMirroredThemeClasses(document.body, getThemeClasses(parentDocument.body));
}

function readHostComputedPalette(parentDocument: Document): Partial<Record<string, string>> {
  const hostRoot = parentDocument.documentElement;
  const hostBody = parentDocument.body;
  const backgroundElement = findHostElement(parentDocument, HOST_BACKGROUND_SELECTORS);
  const surfaceElement = findHostElement(parentDocument, HOST_SURFACE_SELECTORS);
  const linkElement = parentDocument.querySelector('a');
  const buttonElement = parentDocument.querySelector('button');

  if (!backgroundElement) return {};

  const backgroundStyle = getComputedStyle(backgroundElement);
  const surfaceStyle = surfaceElement ? getComputedStyle(surfaceElement) : backgroundStyle;
  const bodyStyle = getComputedStyle(hostBody);
  const rootStyle = getComputedStyle(hostRoot);
  const linkStyle = linkElement ? getComputedStyle(linkElement) : null;
  const buttonStyle = buttonElement ? getComputedStyle(buttonElement) : null;

  const background = pickReadableColor(
    backgroundStyle.backgroundColor,
    bodyStyle.backgroundColor,
    rootStyle.backgroundColor,
  );
  const text = pickReadableColor(backgroundStyle.color, bodyStyle.color, rootStyle.color);
  const surface = pickReadableColor(surfaceStyle.backgroundColor, background);
  const muted = pickReadableColor(
    bodyStyle.getPropertyValue('--ls-secondary-text-color').trim(),
    surfaceStyle.color,
    text,
  );
  const border = pickReadableColor(
    surfaceStyle.borderColor,
    bodyStyle.getPropertyValue('--ls-border-color').trim(),
    buttonStyle?.borderColor ?? '',
    text,
  );
  const accent = pickReadableColor(
    linkStyle?.color ?? '',
    buttonStyle?.backgroundColor ?? '',
    bodyStyle.getPropertyValue('--ls-link-text-color').trim(),
    text,
  );

  return {
    '--ls-primary-background-color': background,
    '--ls-secondary-background-color': surface,
    '--ls-tertiary-background-color': surface,
    '--ls-primary-text-color': text,
    '--ls-title-text-color': text,
    '--ls-secondary-text-color': muted,
    '--ls-border-color': border,
    '--ls-secondary-border-color': border,
    '--ls-link-text-color': accent,
    '--ls-link-text-hover-color': accent,
    '--ls-active-primary-color': accent,
    '--ls-active-secondary-color': accent,
  };
}

function applyComputedHostPalette(parentDocument: Document): void {
  try {
    const palette = readHostComputedPalette(parentDocument);
    for (const [name, value] of Object.entries(palette)) {
      if (value) {
        document.documentElement.style.setProperty(name, value);
      }
    }

    const background = palette['--ls-primary-background-color'];
    const luminance = background ? getColorLuminance(background) : null;
    if (luminance !== null) {
      applyThemeMode(luminance < 0.45 ? 'dark' : 'light');
    }
  } catch {
    // Keep the mirrored stylesheet and variable fallback if computed sampling fails.
  }
}

function syncHostTheme(): void {
  let parentDocument: Document | null = null;
  try {
    parentDocument = window.parent?.document ?? null;
  } catch {
    parentDocument = null;
  }

  if (parentDocument) {
    syncHostThemeStyles(parentDocument);
    syncHostThemeSelectors(parentDocument);
  }
  syncHostThemeVariables();
  if (parentDocument) {
    applyComputedHostPalette(parentDocument);
  }
}

function scheduleHostThemeSync(): void {
  window.setTimeout(syncHostTheme, 100);
  window.setTimeout(syncHostTheme, 500);
}

async function syncThemeMode(): Promise<void> {
  try {
    const info = await logseq.App.getInfo() as { preferredThemeMode?: ThemeMode };
    applyThemeMode(info.preferredThemeMode === 'dark' ? 'dark' : 'light');
    syncHostTheme();
    scheduleHostThemeSync();
  } catch {
    applyThemeMode('light');
  }
}

function ensureAppRoot(): HTMLElement {
  const existing = document.getElementById('app');
  if (existing) return existing;

  const root = document.createElement('div');
  root.id = 'app';
  document.body.append(root);
  return root;
}

async function ensurePanel(): Promise<ChatPanel> {
  if (panel) return panel;
  const { ChatPanel } = await import('./ui/ChatPanel');
  panel = new ChatPanel(ensureAppRoot());
  return panel;
}

async function showMainUI(options?: PanelOpenOptions): Promise<void> {
  syncHostTheme();
  scheduleHostThemeSync();
  const chatPanel = await ensurePanel();
  chatPanel.open(options);
  logseq.showMainUI();
}

async function toggleMainUI(): Promise<void> {
  if (logseq.isMainUIVisible) {
    logseq.hideMainUI();
    return;
  }

  await showMainUI();
}

async function main(): Promise<void> {
  const state = getRuntimeState();
  if (state.bootstrapped) {
    return;
  }
  state.bootstrapped = true;

  registerSettings();
  registerCleanup(registerBlockCommands(showMainUI));
  logseq.beforeunload(cleanupRuntimeState);
  void syncThemeMode();
  logseq.App.onThemeModeChanged(({ mode }) => {
    applyThemeMode(mode);
    syncHostTheme();
    scheduleHostThemeSync();
  });

  logseq.setMainUIInlineStyle({
    position: 'fixed',
    zIndex: 4,
    right: '12px',
    left: 'auto',
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
    template: '<a class="button" data-on-click="showIdeaseq" title="Ideaseq" aria-label="Ideaseq"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M12 2a7 7 0 0 0-4 12.74V16h8v-1.26A7 7 0 0 0 12 2z"></path></svg></a>',
  });

  logseq.provideModel({
    showIdeaseq: () => {
      void toggleMainUI();
    },
  });

  const unregisterOpenCommand = logseq.Commands.register(
    'open-chat',
    {
      title: 'Ideaseq: Open chat',
      placement: 'palette',
    },
    () => {
      void showMainUI();
    },
  );
  if (unregisterOpenCommand) {
    registerCleanup([unregisterOpenCommand]);
  }

  const unregisterBrainstormCommand = logseq.Editor.registerSlashCommand('Ideaseq brainstorm', async () => {
    await showMainUI();
  });
  if (unregisterBrainstormCommand) {
    registerCleanup([unregisterBrainstormCommand]);
  }
}

logseq.ready(main).catch((error) => {
  console.error('Ideaseq failed to start', error);
});
