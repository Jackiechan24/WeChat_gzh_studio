import { setIcon } from 'obsidian';
import { createDetachedElement } from './dom';
import { BUILTIN_STYLES } from './settings';
import { renderArticle } from './renderer';

const SAMPLE = '## 文章的阅读节奏\n把重要的内容，讲得清楚。\n\n> 一句值得记住的话。\n\n### 内容层次\n- 先给结论\n- 再给方法\n\n```js\nconst article = render(note);\n```';

export function buildStylePicker(body: HTMLElement, ctx: { selectedId: string; choose: (id: string) => Promise<void> }): () => void {
  const doc = body.ownerDocument;
  const grid = body.createDiv({ cls: 'wx-preset-grid' });
  let disposed = false;
  const observer = new ResizeObserver(entries => {
    for (const entry of entries) {
      const canvas = entry.target.querySelector<HTMLElement>('.wx-preset-canvas');
      canvas?.setCssStyles({ transform: `scale(${Math.max(.15, (entry.contentRect.width - 16) / 343)})` });
    }
  });
  const buttons: HTMLButtonElement[] = [];
  for (const profile of BUILTIN_STYLES) {
    const selected = profile.id === ctx.selectedId;
    const titleId = `${body.parentElement?.id}-${profile.id}`;
    const button = grid.createEl('button', {
      cls: 'wx-preset-card',
      attr: { type: 'button', 'data-preset-id': profile.id, 'aria-pressed': String(selected), 'aria-labelledby': titleId }
    });
    const thumb = button.createDiv({ cls: 'wx-preset-thumb', attr: { 'aria-hidden': 'true' } });
    const canvas = thumb.createDiv({ cls: 'wx-preset-canvas' });
    const shadow = canvas.attachShadow({ mode: 'open' });
    void renderArticle(SAMPLE, { document: doc, sourcePath: '风格示例.md', settings: profile.settings, resolveImage: async () => null }).then(result => {
      if (disposed) return;
      const content = createDetachedElement(doc, 'div');
      content.append(result.previewRoot);
      shadow.append(content);
    });
    const meta = button.createDiv({ cls: 'wx-preset-meta' });
    meta.createEl('strong', { text: profile.name, attr: { id: titleId } });
    if (selected) setIcon(meta.createSpan({ cls: 'wx-preset-check' }), 'check');
    button.createEl('p', { text: profile.description || '' });
    button.createEl('small', { text: profile.useCase });
    button.onclick = () => { void ctx.choose(profile.id); };
    button.onkeydown = event => {
      const index = buttons.indexOf(button);
      let next: number | undefined;
      if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
      else if (event.key === 'ArrowLeft') next = (index + buttons.length - 1) % buttons.length;
      else if (event.key === 'ArrowDown') next = Math.min(buttons.length - 1, index + 2);
      else if (event.key === 'ArrowUp') next = Math.max(0, index - 2);
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = buttons.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      buttons[next].focus({ preventScroll: true });
    };
    buttons.push(button);
    observer.observe(thumb);
  }
  return () => {
    disposed = true;
    observer.disconnect();
  };
}
