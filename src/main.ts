import { createDetachedElement } from './dom';
import { DEVICE_PREVIEWS } from './device-preview';
import { App, ItemView, MarkdownView, Notice, Plugin, PluginSettingTab, TFile, WorkspaceLeaf, type Editor, type MarkdownFileInfo, type SettingDefinitionItem, parseYaml, requestUrl, setIcon } from 'obsidian';
import { prepareArticle, normalizeImage, type PreparedArticle } from './images';
import { renderArticle, type ArticleResult } from './renderer';
import { BUILTIN_STYLES, getArticleColors, getPreset, normalizePluginData, presetSettingsFor, type LayoutSettings, type PluginData, type PreviewMode } from './settings';
import { buildStylePicker } from './settings-panel';
import {buildFooterEditor} from './footer-panel';
import {buildMorePanel} from './more-panel';

export const VIEW_TYPE = 'wechat-layout-preview';
interface SourceSnapshot { path: string; text: string; selection: boolean; metadata: Record<string, unknown> }

async function copyHtml(result: PreparedArticle, hostWindow: Window): Promise<void> {
  try {
    const electron = await import('electron');
    if (electron.clipboard) {
      electron.clipboard.write({ html: result.html, text: result.text });
      return;
    }
  } catch { /* Browser clipboard is the fallback when Electron clipboard isn't exposed. */ }
  await hostWindow.navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob([result.html], { type: 'text/html' }),
    'text/plain': new Blob([result.text], { type: 'text/plain' })
  })]);
}

export default class WeChatLayoutPlugin extends Plugin {
  data: PluginData = normalizePluginData();
  lastMarkdown: MarkdownView | null = null;
  private timer: number | undefined;

  async onload(): Promise<void> {
    const stored: unknown = await this.loadData();
    this.data = normalizePluginData(stored);
    this.lastMarkdown = this.app.workspace.getActiveViewOfType(MarkdownView);
    this.registerView(VIEW_TYPE, leaf => new WeChatPreviewView(leaf, this));
    this.addRibbonIcon('newspaper', '公众号排版预览', () => { void this.openPreview(); });
    this.addCommand({ id: 'open-preview', name: '打开公众号排版预览', callback: () => this.openPreview() });
    this.addCommand({
      id: 'preview-selection', name: '排版当前选区',
      editorCallback: (editor, view) => {
        if (!editor.getSelection().trim()) { new Notice('请先选中要排版的内容'); return; }
        if (!view.file) return;
        void this.openPreview({ path: view.file.path, text: editor.getSelection(), selection: true, metadata: {} });
      }
    });
    this.addCommand({ id: 'copy-article', name: '复制公众号正文', callback: async () => { const view = await this.openPreview(); await view?.copy(); } });
    this.addCommand({id:'export-html',name:'导出完整 HTML',callback:async()=>{const view=await this.openPreview();await view?.download();}});
    this.addSettingTab(new LayoutSettingsTab(this.app, this));
    this.registerEvent(this.app.workspace.on('active-leaf-change', leaf => {
      if (leaf?.view instanceof MarkdownView) {
        this.lastMarkdown = leaf.view;
        this.schedule();
      }
    }));
    this.registerEvent(this.app.workspace.on('file-open', file => {
      if (file?.extension === 'md') {
        const md = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (md) this.lastMarkdown = md;
        this.schedule();
      }
    }));
    this.registerEvent(this.app.workspace.on('editor-change', (editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
      if (!info.file) return;
      if (info instanceof MarkdownView) this.lastMarkdown = info;
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
        const view = leaf.view;
        if (!(view instanceof WeChatPreviewView))continue;
        if (!view.source?.selection && (!view.source || view.source.path === info.file.path)) {
          view.source = { path: info.file.path, text: editor.getValue(), selection: false, metadata: this.metadata(info.file, editor.getValue()) };
        }
      }
      this.schedule(false);
    }));
    this.registerEvent(this.app.vault.on('modify', file => {
      if (file instanceof TFile && file.path === this.lastMarkdown?.file?.path) this.schedule();
    }));
    this.register(() => window.clearTimeout(this.timer));
  }

  metadata(file: TFile, text?: string): Record<string, unknown> {
    if (text !== undefined) {
      const frontmatter = text.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)(?:\r?\n|$)/);
      if (!frontmatter) return {};
      try { const value: unknown = parseYaml(frontmatter[1]); return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
      catch { return {}; }
    }
    return { ...this.app.metadataCache.getFileCache(file)?.frontmatter };
  }
  async snapshot(): Promise<SourceSnapshot | null> {
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active) this.lastMarkdown = active;
    else {
      const recent = this.app.workspace.getMostRecentLeaf();
      if (recent?.view instanceof MarkdownView) this.lastMarkdown = recent.view;
    }
    let md = this.lastMarkdown;
    if (!md?.file || !this.app.workspace.getLeavesOfType('markdown').some(leaf => leaf.view === md)) {
      const views = this.app.workspace.getLeavesOfType('markdown').map(leaf => leaf.view).filter((view): view is MarkdownView => view instanceof MarkdownView && Boolean(view.file));
      const recent = this.app.workspace.getLastOpenFiles();
      md = recent.map(path => views.find(view => view.file?.path === path)).find((view): view is MarkdownView => Boolean(view)) || views[views.length - 1] || null;
      this.lastMarkdown = md;
    }
    if (md?.file) return { path: md.file.path, text: md.editor.getValue(), selection: false, metadata: this.metadata(md.file, md.editor.getValue()) };
    return null;
  }
  private schedule(capture = true): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
        const view = leaf.view;
        if (!(view instanceof WeChatPreviewView))continue;
        if (!view.source?.selection) void (capture ? view.refresh() : view.render());
      }
    }, 350);
  }
  settingsFor(path = ''): LayoutSettings { return presetSettingsFor(this.data,path); }
  styleIdFor(path=''):string {return getPreset(this.data.articleStyleIds[path]||this.data.defaultStyleId).id;}
  async persist(): Promise<void> { await this.saveData(this.data); }
  async openPreview(source?: SourceSnapshot): Promise<WeChatPreviewView | undefined> {
    const snapshot = source || await this.snapshot();
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      const right = this.app.workspace.getRightLeaf(false);
      if (!right) return undefined;
      leaf = right;
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await leaf.loadIfDeferred?.();
    await this.app.workspace.revealLeaf(leaf);
    const view=leaf.view;
    if(!(view instanceof WeChatPreviewView)){new Notice('排版预览正在加载，请重新打开');return undefined;}
    if(snapshot)view.source=snapshot;
    await view.refresh(false);
    return view;
  }
}

export class WeChatPreviewView extends ItemView {
  source: SourceSnapshot | null = null;
  result: ArticleResult | null = null;
  private toolbar!:HTMLElement;
  private stylePanel!:HTMLElement;
  private styleButton!:HTMLButtonElement;
  private disposePicker:(()=>void)|null=null;
  private choiceRevision=0;
  private footerPanel!:HTMLElement;
  private footerButton!:HTMLButtonElement;
  private morePanel!:HTMLElement;
  private moreButton!:HTMLButtonElement;
  private footerState:HTMLElement|null=null;
  private footerDraft: { path: string | undefined; value: string; timer: number; hostWindow: Window } | null = null;
  private footerPending:Promise<void>=Promise.resolve();
  private preview!: HTMLElement;
  private previewLabel!: HTMLElement;
  private deviceReader!: HTMLElement;
  private deviceResizeObserver?: ResizeObserver;
  private title!: HTMLElement;
  private previewInfo!: HTMLElement;
  private status!: HTMLElement;
  private checks!: HTMLElement;
  private sourceLabel!: HTMLElement;
  private copyButton!: HTMLButtonElement;
  private shadow!: ShadowRoot;
  private revision = 0;
  private pending: Promise<void> = Promise.resolve();
  private lastPath = '';
  private disposed = false;
  private copying = false;


  constructor(leaf: WorkspaceLeaf, private plugin: WeChatLayoutPlugin) { super(leaf); }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return '公众号排版'; }
  getIcon(): string { return 'newspaper'; }
  async onOpen(): Promise<void> {
    this.disposed = false;
    const root = this.contentEl; root.empty(); root.addClass('wx-view');
    const header = root.createDiv({ cls: 'wx-header' });
    const heading = header.createDiv({ cls: 'wx-heading' });
    heading.createEl('h2', { text: '公众号排版' });
    this.sourceLabel = heading.createDiv({ cls: 'wx-source' });
    const actions = header.createDiv({ cls: 'wx-header-actions' });
    this.copyButton = actions.createEl('button', { text: '复制正文', cls: 'mod-cta wx-primary' });
    this.copyButton.onclick = () => { void this.copy(); };
    const more = this.moreButton=actions.createEl('button', { cls: 'wx-icon-button' });
    setIcon(more, 'ellipsis');
    more.setAttribute('aria-label', '更多操作');
    more.setAttribute('aria-haspopup','menu');more.setAttribute('aria-expanded','false');more.onclick=()=>this.toggleMore(this.morePanel.hidden);
    this.toolbar = header.createDiv({ cls: 'wx-quickbar' });
    this.stylePanel=header.createDiv({cls:'wx-style-popover'});
    this.stylePanel.hidden=true;
    this.stylePanel.id=`wx-style-picker-${Math.random().toString(36).slice(2)}`;
    this.stylePanel.setAttribute('role','dialog');
    this.stylePanel.setAttribute('aria-labelledby', `${this.stylePanel.id}-title`);
    this.footerPanel=header.createDiv({cls:'wx-footer-popover'});this.footerPanel.hidden=true;
    this.footerPanel.id=`wx-footer-${Math.random().toString(36).slice(2)}`;this.footerPanel.setAttribute('role','dialog');this.footerPanel.setAttribute('aria-label','固定结尾');
    this.morePanel=header.createDiv({cls:'wx-more-popover'});this.morePanel.hidden=true;this.morePanel.id=`wx-more-${Math.random().toString(36).slice(2)}`;this.moreButton.setAttribute('aria-controls',this.morePanel.id);this.morePanel.setAttribute('role','menu');this.morePanel.setAttribute('aria-label','更多操作');
    this.registerDomEvent(root.ownerDocument,'pointerdown',event=>{
      const target=event.target as Node;
      if(!this.stylePanel.hidden&&!this.stylePanel.contains(target)&&!this.styleButton.contains(target))this.toggleStylePicker(false,false);
      if(!this.footerPanel.hidden&&!this.footerPanel.contains(target)&&!this.footerButton.contains(target))this.toggleFooter(false,false);
      if(!this.morePanel.hidden&&!this.morePanel.contains(target)&&!this.moreButton.contains(target))this.toggleMore(false,false);
    });
    this.registerDomEvent(root.ownerDocument,'keydown',event=>{
      if(event.key!=='Escape')return;
      if(!this.stylePanel.hidden){event.preventDefault();event.stopPropagation();this.toggleStylePicker(false);}
      else if(!this.footerPanel.hidden){event.preventDefault();event.stopPropagation();this.toggleFooter(false);}
      else if(!this.morePanel.hidden){event.preventDefault();event.stopPropagation();this.toggleMore(false);}
    });
    const stage = root.createDiv({ cls: 'wx-device-stage' });
    this.previewLabel = stage.createDiv({ cls: 'wx-page-label' });
    const device = stage.createDiv({ cls: 'wx-device-frame' });
    const screen = device.createDiv({ cls: 'wx-device-screen' });
    this.deviceReader = screen.createDiv({
      cls: 'wx-device-reader',
      attr: { tabindex: '0', role: 'region' },
    });
    const page = this.deviceReader.createDiv({ cls: 'wx-page' });
    this.title=page.createEl('h1',{cls:'wx-article-title'});
    this.preview = page.createDiv({ cls: 'wx-preview-host' });
    this.shadow = this.preview.attachShadow({ mode: 'open' });
    this.previewInfo = root.createEl('footer', { cls: 'wx-preview-info' });
    this.status = this.previewInfo.createDiv({ cls: 'wx-status' });
    this.checks = this.previewInfo.createDiv({ cls: 'wx-checks' });
    this.applyPreviewMode();
    this.deviceResizeObserver = new ResizeObserver(() => this.fitDevicePreview());
    this.deviceResizeObserver.observe(root);
    this.deviceResizeObserver.observe(header);
    this.deviceResizeObserver.observe(this.previewInfo);
    await this.refresh();
    this.fitDevicePreview();
  }
  async onClose(): Promise<void> { this.deviceResizeObserver?.disconnect();await this.flushFooter();this.disposePicker?.();this.disposed = true; this.revision++; this.contentEl.empty(); }
  async refresh(capture = true): Promise<void> {
    await this.flushFooter();
    const oldPath = this.source?.path;
    if (capture || !this.source) this.source = await this.plugin.snapshot();
    if (oldPath !== this.source?.path || this.lastPath !== this.source?.path) {
      this.deviceReader.scrollTop = 0;
      this.buildControls();
    }
    else this.syncStyleControls();
    await this.render();
  }
  private toggleStylePicker(open:boolean,focus=true):void {
    if(open){this.toggleFooter(false,false);this.toggleMore(false,false);this.buildStylePanel();}
    this.stylePanel.hidden=!open;this.styleButton.setAttribute('aria-expanded',String(open));
    if(open)this.fitStylePanel();
    if(focus){if(open)this.stylePanel.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus({preventScroll:true});else this.styleButton.focus();}
  }
  onResize():void {this.fitDevicePreview();this.fitStylePanel();this.fitPopover(this.footerPanel);this.fitPopover(this.morePanel);}
  private fitStylePanel():void {
    if(!this.stylePanel||this.stylePanel.hidden)return;
    const win=this.contentEl.ownerDocument.defaultView;
    const bottom=Math.min(win?.innerHeight||Infinity,this.contentEl.getBoundingClientRect().bottom)-12;
    this.stylePanel.style.setProperty('--wx-picker-height',`${Math.max(80,Math.floor(bottom-this.stylePanel.getBoundingClientRect().top))}px`);
  }
  private fitPopover(panel:HTMLElement):void {
    if(!panel||panel.hidden)return;const win=this.contentEl.ownerDocument.defaultView;
    const bottom=Math.min(win?.innerHeight||Infinity,this.contentEl.getBoundingClientRect().bottom)-12;
    panel.style.setProperty('--wx-popup-height',`${Math.max(80,Math.floor(bottom-panel.getBoundingClientRect().top))}px`);
  }
  private toggleMore(open:boolean,focus=true):void {
    if(open){
      this.toggleStylePicker(false,false);this.toggleFooter(false,false);this.morePanel.empty();
      const close=()=>this.toggleMore(false);
      const current=this.plugin.styleIdFor(this.source?.path);
      buildMorePanel(this.morePanel,{selection:!!this.source?.selection,hasSource:!!this.source,busy:this.copying,isCommon:current===this.plugin.data.defaultStyleId,mode:this.plugin.data.previewMode,
        reload:async()=>{close();await this.refresh(true);},footer:()=>{close();this.toggleFooter(true);},
        setCommon:async()=>{this.plugin.data.defaultStyleId=current;await this.plugin.persist();close();new Notice('新文章将直接使用这套风格');},
        restore:async()=>{close();await this.flushFooter();if(this.source)delete this.plugin.data.articleStyleIds[this.source.path];await this.plugin.persist();this.syncStyleControls();await this.render();},
        modeChange:async mode=>{await this.setPreviewMode(mode);close();}
      });
    }
    this.morePanel.hidden=!open;this.moreButton.setAttribute('aria-expanded',String(open));if(open)this.fitPopover(this.morePanel);
    if(focus){if(open)this.morePanel.querySelector<HTMLElement>('button:not(:disabled)')?.focus();else this.moreButton.focus();}
  }
  private toggleFooter(open:boolean,focus=true):void {
    if(open){this.toggleStylePicker(false,false);this.toggleMore(false,false);this.buildFooterPanel();}
    else void this.flushFooter();
    this.footerPanel.hidden=!open;this.footerButton?.setAttribute('aria-expanded',String(open));if(open)this.fitPopover(this.footerPanel);
    if(focus){if(open)this.footerPanel.querySelector('textarea')?.focus({preventScroll:true});else this.footerButton.focus();}
  }
  private buildFooterPanel():void {
    const path=this.source?.path;this.footerPanel.empty();
    this.footerState=buildFooterEditor(this.footerPanel,{value:this.footerDraft&&this.footerDraft.path===path?this.footerDraft.value:this.plugin.settingsFor(path).footer,override:!!path&&Object.hasOwn(this.plugin.data.articles[path]||{},'footer'),article:!!path,
      close:()=>this.toggleFooter(false),input:value=>this.queueFooter(value,path),flush:()=>this.flushFooter(),setCommon:async()=>{
        await this.flushFooter();this.plugin.data.defaults.footer=this.plugin.settingsFor(path).footer;await this.plugin.persist();if(path===this.source?.path)this.buildFooterPanel();new Notice('已设为常用结尾');
      },restore:async()=>{
        await this.flushFooter();if(path&&this.plugin.data.articles[path])delete this.plugin.data.articles[path].footer;await this.plugin.persist();if(path===this.source?.path){this.buildFooterPanel();this.syncStyleControls();await this.render();}
      }
    });
  }
  private queueFooter(value:string,path=this.source?.path):void {
    const previous = this.footerDraft;
    previous?.hostWindow.clearTimeout(previous.timer);
    const hostWindow = this.contentEl.win;
    const timer = hostWindow.setTimeout(() => { void this.flushFooter(); }, 300);
    this.footerDraft = { value, path, timer, hostWindow };
    this.footerState?.setText('正在保存…');
  }
  private async flushFooter():Promise<void> {
    const draft=this.footerDraft;
    if(draft){this.footerDraft=null;draft.hostWindow.clearTimeout(draft.timer);this.footerPending=this.footerPending.then(()=>this.saveFooter(draft.value,draft.path));}
    await this.footerPending;
  }
  private async saveFooter(value:string,path?:string):Promise<void> {
    const previous=path?this.plugin.data.articles[path]?.footer:this.plugin.data.defaults.footer;
    if(path)this.plugin.data.articles[path]={...this.plugin.data.articles[path],footer:value};else this.plugin.data.defaults.footer=value;
    try{await this.plugin.persist();if(path===this.source?.path){this.footerState?.setText('已保存 · 随正文一起复制');if(path){this.footerPanel.querySelector('.wx-footer-scope')?.setText('此文结尾 · 修改后自动保存');const reset=this.footerPanel.querySelector<HTMLButtonElement>('[data-footer-restore]');if(reset)reset.disabled=false;}this.syncStyleControls();await this.render();}}
    catch(error){
      if(path&&this.plugin.data.articles[path]?.footer===value){if(previous===undefined)delete this.plugin.data.articles[path].footer;else this.plugin.data.articles[path].footer=previous;}
      else if(!path&&this.plugin.data.defaults.footer===value)this.plugin.data.defaults.footer=previous||'';
      this.footerState?.setText('保存失败，请重试');new Notice('固定结尾保存失败，请重试');console.error('WeChat Layout footer failed',error);
    }
  }
  private fitDevicePreview(): void {
    const headerHeight = this.contentEl.querySelector<HTMLElement>('.wx-header')?.offsetHeight ?? 0;
    const infoHeight = this.previewInfo.offsetHeight;
    // Reserve room for the device label and stage padding.
    const height = Math.max(240, this.contentEl.clientHeight - headerHeight - infoHeight - 52);
    const aspect = DEVICE_PREVIEWS[this.plugin.data.previewMode].aspect;
    this.contentEl.style.setProperty('--wx-device-fit', `${Math.floor(height * aspect)}px`);
  }
  private applyPreviewMode(): void {
    const mode = this.plugin.data.previewMode;
    const device = DEVICE_PREVIEWS[mode];
    const reader = this.deviceReader;
    const position = reader.scrollTop / Math.max(1, reader.scrollHeight - reader.clientHeight);
    this.contentEl.dataset.previewMode = mode;
    this.previewLabel.setText(`${device.label}预览`);
    reader.setAttribute('aria-label', `${device.label}公众号正文预览`);
    this.fitDevicePreview();
    reader.scrollTop = position * Math.max(0, reader.scrollHeight - reader.clientHeight);
  }
  private async setPreviewMode(mode: PreviewMode): Promise<void> {
    this.plugin.data.previewMode = mode; this.applyPreviewMode(); await this.plugin.persist();
  }
  private buildControls():void {
    this.lastPath=this.source?.path||'';
    this.toggleFooter(false,false);this.toggleMore(false,false);
    this.toolbar.empty();this.stylePanel.empty();this.stylePanel.hidden=true;this.disposePicker?.();this.disposePicker=null;
    this.styleButton=this.toolbar.createEl('button',{cls:'wx-style-button'});
    const icon=this.styleButton.createSpan({cls:'wx-button-icon'});setIcon(icon,'palette');
    this.styleButton.createSpan({cls:'wx-style-button-label'});
    const arrow=this.styleButton.createSpan({cls:'wx-button-icon'});setIcon(arrow,'chevron-down');
    this.styleButton.setAttribute('aria-haspopup','dialog');this.styleButton.setAttribute('aria-controls',this.stylePanel.id);this.styleButton.setAttribute('aria-expanded','false');
    this.styleButton.onclick=()=>this.toggleStylePicker(this.stylePanel.hidden);
    this.footerButton=this.toolbar.createEl('button',{cls:'wx-footer-button'});const footerIcon=this.footerButton.createSpan({cls:'wx-button-icon'});setIcon(footerIcon,'signature');this.footerButton.createSpan({text:'结尾'});
    this.footerButton.setAttribute('aria-haspopup','dialog');this.footerButton.setAttribute('aria-controls',this.footerPanel.id);this.footerButton.setAttribute('aria-expanded','false');this.footerButton.onclick=()=>this.toggleFooter(this.footerPanel.hidden);
    this.syncStyleControls();
  }
  private syncStyleControls():void {
    const profile=getPreset(this.plugin.styleIdFor(this.source?.path));
    this.contentEl.style.setProperty('--wx-accent',getArticleColors(profile.settings).accent);
    this.styleButton.querySelector('.wx-style-button-label')?.setText(profile.name);
    this.styleButton.disabled=this.copying;
    if(this.footerButton){this.footerButton.disabled=this.copying;const has=!!this.plugin.settingsFor(this.source?.path).footer.trim();this.footerButton.toggleClass('is-set',has);}
    this.moreButton.disabled=this.copying;
  }
  private buildStylePanel():void {
    this.disposePicker?.();this.stylePanel.empty();
    const head = this.stylePanel.createDiv({ cls: 'wx-picker-head' });
    head.createEl('strong', {
      text: '选择整套风格',
      attr: { id: `${this.stylePanel.id}-title` },
    });
    const close = head.createEl('button', { cls: 'wx-icon-button' });
    setIcon(close, 'x');
    close.setAttribute('aria-label', '关闭风格选择');
    close.onclick = () => this.toggleStylePicker(false);
    const body=this.stylePanel.createDiv({cls:'wx-picker-body'});
    const path=this.source?.path;
    this.disposePicker=buildStylePicker(body,{selectedId:this.plugin.styleIdFor(path),choose:id=>this.chooseStyle(id,path)});
  }
  private async chooseStyle(id:string,path=this.source?.path):Promise<void> {
    await this.flushFooter();
    const key=getPreset(id).id,previous=path?this.plugin.data.articleStyleIds[path]:this.plugin.data.defaultStyleId,choice=++this.choiceRevision;
    if(path)this.plugin.data.articleStyleIds[path]=key;else this.plugin.data.defaultStyleId=key;
    this.toggleStylePicker(false);this.syncStyleControls();
    const rendering=path===this.source?.path?this.render():Promise.resolve();
    try{await this.plugin.persist();await rendering;}
    catch(error){
      if(choice!==this.choiceRevision)return;
      if(path){if(previous===undefined)delete this.plugin.data.articleStyleIds[path];else this.plugin.data.articleStyleIds[path]=previous;}
      else this.plugin.data.defaultStyleId=previous||'reader';
      this.syncStyleControls();if(path===this.source?.path)await this.render();new Notice('风格保存失败，请重试');console.error('WeChat Layout style failed',error);
    }
  }
  render(): Promise<void> {
    const task = this.doRender(); this.pending = task; return task;
  }
  private async doRender(): Promise<void> {
    if (this.disposed || !this.shadow) return;
    const revision = ++this.revision;
    const source = this.source;
    this.copyButton.disabled = true;
    this.result = null;
    if (!source) {
      this.sourceLabel.setText('打开一篇 Markdown 笔记，然后点击“读取当前笔记”。');
      this.shadow.replaceChildren(); this.title.setText('等待文章'); this.status.setText('暂无文章'); this.checks.empty(); return;
    }
    this.sourceLabel.setText(`${source.selection ? '选区 · ' : ''}${source.path.split('/').pop() || source.path}`);
    this.sourceLabel.title = `${source.selection ? '选区快照' : '当前笔记'} · ${source.path}`;
    try {
      const result = await renderArticle(source.text, {
        document: this.contentEl.ownerDocument, sourcePath: source.path,
        metadata: source.metadata, selection: source.selection,
        settings: this.plugin.settingsFor(source.path),
        resolveImage: async link => {
          const file = this.app.metadataCache.getFirstLinkpathDest(link.split('#')[0], source.path);
          if (!(file instanceof TFile) || !/^(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(file.extension)) return null;
          return { path: file.path, previewUrl: this.app.vault.getResourcePath(file), exportUrl: this.plugin.data.imageUrls[file.path] };
        }
      });
      if (revision !== this.revision || this.disposed) return;
      this.result = result;
      const doc = this.contentEl.ownerDocument;
      const style = createDetachedElement(doc, 'style'); style.textContent = ':host{display:block;color-scheme:light}a{cursor:pointer}.wx-load-error{outline:2px solid #b45309;min-height:80px}';
      const body = createDetachedElement(doc, 'div');
      body.append(result.previewRoot.cloneNode(true));
      this.shadow.replaceChildren(style, body);
      body.addEventListener('click', event => { if ((event.target as Element).closest('a')) event.preventDefault(); });
      for (const image of body.querySelectorAll<HTMLImageElement>('img')) image.addEventListener('error', () => {
        if (revision !== this.revision) return;
        image.classList.add('wx-load-error');
        this.checks.createEl('p', { cls: 'wx-warning', text: `图片加载失败：${image.alt || image.getAttribute('src')}。请检查地址与文件。` });
      }, { once: true });
      this.title.setText(result.title);
      this.status.setText(`公众号参考 ${result.wechatWords.toLocaleString()} 字 · ${result.characters.toLocaleString()} 字符 · 约 ${result.minutes} 分钟 · ${result.chapters} 个章节 · ${result.codeBlocks} 个代码块 · ${result.images.length} 张图片`);
      this.status.setAttribute('title', '公众号参考字数：连续英文、连续数字分别按一组计算；字符数：逐个计算字母、数字和标点。均不计空白，最终以公众号显示为准。');
      this.buildChecks(result);
      this.copyButton.disabled = this.copying;
    } catch (error) {
      if (revision !== this.revision || this.disposed) return;
      this.shadow.replaceChildren(); this.status.setText('转换失败'); this.checks.empty();
      this.checks.createEl('p', { cls: 'wx-warning', text: `转换失败：${error instanceof Error ? error.message : String(error)}` });
      console.error('WeChat Layout render failed', error);
    }
  }
  private buildChecks(result: ArticleResult): void {
    this.checks.empty();
    for (const warning of result.warnings) {
      this.checks.createEl('p', { cls: 'wx-warning', text: warning });
    }
    if (!result.images.length) return;

    const details = this.checks.createEl('details');
    details.open = result.images.some(image => image.status === 'missing' || image.status === 'unsupported');
    details.createEl('summary', { text: `图片（${result.images.length}）` });
    const list = details.createEl('ul', { cls: 'wx-image-list' });
    for (const image of result.images) {
      let name = image.path.split(/[\\/]/).pop() || '';
      if (image.status === 'embedded') {
        name = image.alt !== image.source ? image.alt : '内嵌图片';
      } else if (image.status === 'external') {
        try {
          name = decodeURIComponent(new URL(image.path).pathname.split('/').pop() || '');
        } catch {
          name = name.split(/[?#]/)[0];
        }
      }
      list.createEl('li', {
        cls: 'wx-image-row',
        text: name || '未命名图片',
      });
    }
  }
  private async prepare(result: ArticleResult): Promise<PreparedArticle> {
    return prepareArticle(result, {
      document: this.contentEl.ownerDocument,
      readLocal: async image => {
        const file = this.app.vault.getAbstractFileByPath(image.path);
        if (!(file instanceof TFile)) throw new Error('附件未找到，请检查图片路径');
        return { bytes: await this.app.vault.readBinary(file) };
      },
      readRemote: async url => {
        const response = await requestUrl({ url, method: 'GET', throw: false });
        if (response.status < 200 || response.status >= 300) throw new Error(`图片服务器返回 ${response.status}`);
        return { bytes: response.arrayBuffer };
      },
      normalize: (bytes, mime) => normalizeImage(this.contentEl.ownerDocument, bytes, mime),
      progress: (done, total) => { if (this.copying&&!this.disposed) this.copyButton.setText(`正在准备图片 ${done}/${total}`); }
    });
  }
  async copy(): Promise<void> {
    if (this.copying) return;
    this.copying = true;
    this.copyButton.disabled = true;
    this.styleButton.disabled = true;
    try {
      await this.flushFooter();
      this.toggleFooter(false, false);
      this.toggleMore(false, false);
      this.toggleStylePicker(false, false);
      await this.refresh(!this.source?.selection);
      await this.pending;
      const result = this.result;
      if (!result) { new Notice('请先打开笔记并等待预览完成'); return; }
      const prepared = await this.prepare(result);
      // Keep a single HTML+text clipboard item: adding image/png would cause some
      // editors to prefer a single bitmap and discard the rest of the article.
      await copyHtml(prepared, this.contentEl.win);
      new Notice(`已复制完整正文${prepared.imageCount ? `和 ${prepared.imageCount} 张图片` : ''}，直接粘贴到公众号编辑器`);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : '图文复制失败，请重试', 12000);
      console.error('WeChat Layout copy failed', error);
    } finally {
      this.copying = false;
      if (!this.disposed) { this.syncStyleControls();this.copyButton.setText('复制正文'); this.copyButton.disabled = !this.result; }
    }
  }
  async download(): Promise<void> {
    if (this.copying) return;
    await this.refresh(!this.source?.selection);
    await this.pending;
    if (!this.result) return;
    const r = this.result;
    this.toggleStylePicker(false,false);this.copying = true;this.styleButton.disabled=true;this.copyButton.disabled = true;
    try {
    const prepared = await this.prepare(r);
    const doc = this.contentEl.ownerDocument;
    const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(r.title)}</title></head><body style="box-sizing:content-box;max-width:677px;margin:24px auto;padding:0 16px;background:#fff">${prepared.html}</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const link = createDetachedElement(doc, 'a'); link.href = url; link.download = `${r.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)}.html`;
    doc.body.append(link); link.click(); link.remove(); this.contentEl.win.setTimeout(() => URL.revokeObjectURL(url), 30000);
    new Notice(`HTML 已导出，包含 ${prepared.imageCount} 张内嵌图片`);
    } catch (error) { new Notice(error instanceof Error ? error.message : '图文导出失败', 12000); }
    finally { this.copying = false; if (!this.disposed) { this.syncStyleControls(); this.copyButton.setText('复制正文'); this.copyButton.disabled = !this.result; } }
  }
}

class LayoutSettingsTab extends PluginSettingTab {
  constructor(app:App,private plugin:WeChatLayoutPlugin){super(app,plugin);}
  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: '常用风格',
        desc: '没有单独选择风格的文章，将自动使用这一套。',
        render: setting => {
          setting.addDropdown(dropdown => {
            for (const preset of BUILTIN_STYLES) dropdown.addOption(preset.id, preset.name);
            dropdown.setValue(this.plugin.data.defaultStyleId).onChange(async id => {
              this.plugin.data.defaultStyleId = getPreset(id).id;
              await this.plugin.persist();
              this.refreshPreviews();
            });
          });
        },
      },
      {
        name: '固定结尾（可选）',
        desc: '例如署名或关注语，支持 Markdown。留空即可不添加。',
        render: setting => {
          setting.addTextArea(input => {
            input.setValue(this.plugin.data.defaults.footer).setPlaceholder('留空，不添加结尾').onChange(async value => {
              this.plugin.data.defaults.footer = value;
              await this.plugin.persist();
              this.refreshPreviews();
            });
          });
        }
      }
    ];
  }
  private refreshPreviews():void {for(const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE))if(leaf.view instanceof WeChatPreviewView)void leaf.view.refresh(false);}
}
