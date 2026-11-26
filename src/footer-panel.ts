import { setIcon } from 'obsidian';
import { setControlName } from './dom';

interface FooterEditorOptions {
  value: string;
  override: boolean;
  article: boolean;
  input: (value: string) => void;
  flush: () => Promise<void>;
  close: () => void;
  setCommon: () => Promise<void>;
  restore: () => Promise<void>;
}

export function buildFooterEditor(panel: HTMLElement, ctx: FooterEditorOptions): HTMLElement {
  const head = panel.createDiv({ cls: 'wx-picker-head' });
  const intro = head.createDiv();
  const titleId = `${panel.id}-title`;
  intro.createEl('strong', { text: '固定结尾', attr: { id: titleId } });
  intro.createEl('p', { text: '署名、关注语等，支持 Markdown。留空即可不添加。' });
  const close = head.createEl('button', { cls: 'wx-icon-button', attr: { type: 'button' } });
  setIcon(close, 'x');
  setControlName(close, '关闭固定结尾');
  close.onclick = ctx.close;

  const scope = !ctx.article ? '常用结尾' : ctx.override ? '此文结尾 · 修改后自动保存' : '沿用常用结尾 · 修改仅用于此文';
  panel.createEl('p', { cls: 'wx-footer-scope', text: scope });
  const input = panel.createEl('textarea', {
    cls: 'wx-footer-input',
    attr: { rows: 6, placeholder: '例如：感谢阅读，欢迎关注。', 'aria-labelledby': titleId }
  });
  input.value = ctx.value;
  input.oninput = () => ctx.input(input.value);
  input.onchange = () => { void ctx.flush(); };
  const status = panel.createDiv({
    cls: 'wx-footer-save-state', text: '修改会自动保存，并随正文一起复制', attr: { role: 'status' }
  });

  const actions = panel.createDiv({ cls: 'wx-footer-actions' });
  if (ctx.article) {
    const common = actions.createEl('button', { text: '设为常用结尾', attr: { type: 'button' } });
    common.onclick = () => { void ctx.setCommon(); };
    const reset = actions.createEl('button', { text: '恢复常用', attr: { type: 'button', 'data-footer-restore': 'true' } });
    reset.disabled = !ctx.override;
    reset.onclick = () => { void ctx.restore(); };
  }
  return status;
}
