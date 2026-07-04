import type { EditIntent } from '../shared/types';

type EditPreviewOptions = {
  container: HTMLElement;
  intent: Exclude<EditIntent, 'chat'>;
  originalText?: string;
  generatedText: string;
  onAccept: () => void | Promise<void>;
  onReject: () => void;
};

function appendBlock(parent: HTMLElement, title: string, text: string): void {
  const section = document.createElement('section');
  section.className = 'ideaseq-preview-section';

  const heading = document.createElement('div');
  heading.className = 'ideaseq-preview-heading';
  heading.textContent = title;

  const body = document.createElement('pre');
  body.className = 'ideaseq-preview-text';
  body.textContent = text;

  section.append(heading, body);
  parent.append(section);
}

export class EditPreview {
  constructor(options: EditPreviewOptions) {
    options.container.innerHTML = '';

    const root = document.createElement('div');
    root.className = 'ideaseq-preview';

    const title = document.createElement('div');
    title.className = 'ideaseq-preview-title';
    title.textContent = options.intent === 'rewrite-block' ? 'Rewrite preview' : 'Insert preview';
    root.append(title);

    if (options.intent === 'rewrite-block') {
      appendBlock(root, 'Original', options.originalText ?? '');
    }
    appendBlock(root, 'Generated', options.generatedText);

    const actions = document.createElement('div');
    actions.className = 'ideaseq-preview-actions';

    const reject = document.createElement('button');
    reject.type = 'button';
    reject.textContent = 'Reject';
    reject.addEventListener('click', options.onReject);

    const accept = document.createElement('button');
    accept.type = 'button';
    accept.textContent = 'Accept';
    accept.className = 'primary';
    accept.addEventListener('click', async () => {
      accept.disabled = true;
      reject.disabled = true;
      try {
        await options.onAccept();
      } catch {
        accept.disabled = false;
        reject.disabled = false;
      }
    });

    actions.append(reject, accept);
    root.append(actions);
    options.container.append(root);
  }
}
