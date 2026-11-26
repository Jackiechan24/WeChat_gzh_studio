import { setIcon } from 'obsidian';
import { createDetachedElement } from './dom';
import { BUILTIN_STYLES } from './settings';
import { renderArticle } from './renderer';

const PREVIEW_COPY: Record<string, { heading: string; caption: string }> = {
  reader: { heading: '把日常写成故事', caption: '青绿竖线 · 舒展留白' },
  magazine: { heading: '观点，值得细读', caption: '黑白细线 · 浅灰引用' },
  cards: { heading: '三步，掌握方法', caption: '蓝色章头 · 白卡分组' },
  apple: { heading: '好设计，少一点', caption: '黑灰文字 · 极简留白' },
  technical: { heading: '从问题到解决', caption: '深色章头 · 清晰步骤' },
  bulletin: { heading: '先说结论', caption: '红色章号 · 利落重点' }
};

export function buildStylePicker(body: HTMLElement, ctx: { selectedId: string; choose: (id: string) => Promise<void> }): () => void {
  const doc = body.ownerDocument;
  const grid = body.createDiv({ cls: 'wx-preset-grid' });
  let disposed = false;
  const fitPreview = (thumb: HTMLElement): void => {
    const canvas = thumb.querySelector<HTMLElement>('.wx-preset-canvas');
    const content = canvas?.shadowRoot?.firstElementChild;
    if (!canvas || !content || thumb.clientWidth <= 16 || thumb.clientHeight <= 16) return;
    const scale = Math.min((thumb.clientWidth - 16) / 320, (thumb.clientHeight - 16) / content.scrollHeight);
    canvas.setCssStyles({ transform: `scale(${scale})`, left: `${(thumb.clientWidth - 320 * scale) / 2}px` });
  };
  const observer = new ResizeObserver(entries => {
    for (const entry of entries) fitPreview(entry.target as HTMLElement);
  });
  const buttons: HTMLButtonElement[] = [];
  for (const profile of BUILTIN_STYLES) {
    const selected = profile.id === ctx.selectedId;
    const copy = PREVIEW_COPY[profile.id];
    const titleId = `${body.parentElement?.id}-${profile.id}`;
    const button = grid.createEl('button', {
      cls: 'wx-preset-card',
      attr: { type: 'button', 'data-preset-id': profile.id, 'aria-pressed': String(selected), 'aria-labelledby': titleId }
    });
    const meta = button.createDiv({ cls: 'wx-preset-meta' });
    meta.createEl('strong', { text: profile.name, attr: { id: titleId } });
    const check = meta.createSpan({ cls: 'wx-preset-check', attr: { 'aria-hidden': 'true' } });
    if (selected) setIcon(check, 'check');
    const thumb = button.createDiv({ cls: 'wx-preset-thumb', attr: { 'aria-hidden': 'true' } });
    const canvas = thumb.createDiv({ cls: 'wx-preset-canvas' });
    const shadow = canvas.attachShadow({ mode: 'open' });
    void renderArticle(`## ${copy.heading}\n一段文字，读出不同的节奏。\n\n> 留白，让重点更清楚。`, { document: doc, sourcePath: '风格示例.md', settings: profile.settings, resolveImage: async () => null }).then(result => {
      if (disposed) return;
      const content = createDetachedElement(doc, 'div');
      content.append(result.previewRoot);
      shadow.append(content);
      fitPreview(thumb);
    });
    button.createEl('p', { cls: 'wx-preset-caption', text: copy.caption });
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
