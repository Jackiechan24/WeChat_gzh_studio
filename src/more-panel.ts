import { setIcon } from 'obsidian';
import type { PreviewMode } from './settings';

interface MenuAction {
  text: string;
  icon: string;
  disabled?: boolean;
  checked?: boolean;
  run: () => void | Promise<void>;
}

interface MoreMenuOptions {
  selection: boolean;
  hasSource: boolean;
  busy: boolean;
  isCommon: boolean;
  mode: PreviewMode;
  reload: () => Promise<void>;
  footer: () => void;
  setCommon: () => Promise<void>;
  restore: () => Promise<void>;
  modeChange: (mode: PreviewMode) => Promise<void>;
}

export function buildMorePanel(panel: HTMLElement, ctx: MoreMenuOptions): void {
  const group = (title: string) => {
    const section = panel.createDiv({ cls: 'wx-more-group', attr: { role: 'group', 'aria-label': title } });
    section.createDiv({ cls: 'wx-more-label', text: title });
    return section;
  };
  const action = (parent: HTMLElement, item: MenuAction) => {
    const button = parent.createEl('button', { cls: 'wx-more-item', attr: { type: 'button', role: 'menuitem' } });
    button.disabled = Boolean(item.disabled);
    setIcon(button.createSpan({ cls: 'wx-more-icon' }), item.icon);
    button.createSpan({ cls: 'wx-more-text', text: item.text });
    const check = button.createSpan({ cls: 'wx-more-check' });
    if (item.checked) setIcon(check, 'check');
    button.onclick = () => { void item.run(); };
  };

  const article = group('文章');
  action(article, { text: ctx.selection ? '恢复全文预览' : '重新读取笔记', icon: 'refresh-cw', disabled: ctx.busy, run: ctx.reload });
  action(article, { text: '固定结尾', icon: 'signature', disabled: ctx.busy, run: ctx.footer });

  const style = group('风格');
  const styleDisabled = ctx.busy || !ctx.hasSource || ctx.isCommon;
  action(style, { text: ctx.isCommon ? '已是常用风格' : '设为常用风格', icon: 'bookmark', disabled: styleDisabled, checked: ctx.isCommon, run: ctx.setCommon });
  action(style, { text: '恢复常用风格', icon: 'rotate-ccw', disabled: styleDisabled, run: ctx.restore });

  const modes = group('设备预览').createDiv({ cls: 'wx-reading-modes' });
  for (const [value, text, icon] of [['mobile', '手机', 'smartphone'], ['pad', 'iPad', 'tablet']] as const) {
    const button = modes.createEl('button', {
      attr: { type: 'button', role: 'menuitemradio', 'aria-checked': String(ctx.mode === value) }
    });
    button.disabled = ctx.busy;
    setIcon(button.createSpan({ cls: 'wx-more-icon' }), icon);
    button.createSpan({ text });
    button.onclick = () => { void ctx.modeChange(value); };
  }

  panel.onkeydown = event => {
    const items = [...panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    if (!items.length) return;
    const index = items.findIndex(button => button === panel.ownerDocument.activeElement);
    let next: number | undefined;
    if (event.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (event.key === 'ArrowUp') next = (index + items.length - 1) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    items[next].focus();
  };
}
