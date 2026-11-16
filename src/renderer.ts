import MarkdownIt from 'markdown-it';
import { applyArticleLayout } from './typography';
import { countArticleText } from './statistics';
import footnote from 'markdown-it-footnote';
import createDOMPurify from 'dompurify';
import type Token from 'markdown-it/lib/token.mjs';
import { DEFAULTS, normalizeSettings, type LayoutSettings } from './settings';

export interface ImageResolution { path: string; previewUrl: string; exportUrl?: string }
export interface ArticleImage { source: string; path: string; alt: string; status: 'external' | 'embedded' | 'mapped' | 'local' | 'missing' | 'unsupported'; previewUrl?: string; exportUrl?: string }
export interface ArticleResult {
  title: string; previewHtml: string; exportHtml: string; text: string;
  images: ArticleImage[]; warnings: string[]; characters: number; wechatWords: number; minutes: number;
  codeBlocks: number; chapters: number;
}
export interface RenderOptions {
  document: Document;
  sourcePath: string;
  metadata?: Record<string, unknown>;
  selection?: boolean;
  settings?: Partial<LayoutSettings>;
  resolveImage?: (path: string) => Promise<ImageResolution | null>;
}
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const httpsUrl = (s: string) => { try { const u = new URL(s); return u.protocol === 'https:'; } catch { return false; } };
const webUrl = (s: string) => /^https?:\/\//i.test(s);

// Remove comments across paragraphs, while preserving fenced, indented and inline code.
function stripComments(source: string, warnings: Set<string>): string {
  const lines = source.split('\n');
  const offsets = [0];
  for (const line of lines) offsets.push(offsets[offsets.length - 1] + line.length + 1);
  const ranges = new Map<number, number>();
  const visit = (tokens: Token[]) => {
    for (const token of tokens) {
      if ((token.type === 'fence' || token.type === 'code_block') && token.map) ranges.set(offsets[token.map[0]], Math.min(source.length, offsets[token.map[1]]));
      if (token.children) visit(token.children);
    }
  };
  visit(new MarkdownIt().parse(source, {}));
  let output = '', inComment = false;
  for (let i = 0; i < source.length;) {
    if (!inComment) {
      const end = ranges.get(i);
      if (end !== undefined) { output += source.slice(i, end); i = end; continue; }
      if (source[i] === '\\' && i + 1 < source.length) { output += source.slice(i, i + 2); i += 2; continue; }
      if (source[i] === '`') {
        const run = source.slice(i).match(/^`+/)![0];
        let next = source.indexOf(run, i + run.length);
        while (next >= 0 && (source[next - 1] === '`' || source[next + run.length] === '`')) next = source.indexOf(run, next + run.length);
        if (next >= 0) { output += source.slice(i, next + run.length); i = next + run.length; continue; }
      }
    }
    if (source.slice(i, i + 2) === '%%') { inComment = !inComment; i += 2; continue; }
    if (!inComment || source[i] === '\n') output += source[i];
    i++;
  }
  if (inComment) warnings.add('有未闭合的 %% 注释；从注释起始位置到文末未导出。');
  return output;
}

function makeParser(warnings: Set<string>): MarkdownIt {
  const md = new MarkdownIt({ html: false, breaks: true, linkify: false, typographer: false }).use(footnote as unknown as (parser: MarkdownIt) => void);
  const renderFootnotes = md.renderer.rules.footnote_block_open;
  if (renderFootnotes) {
    md.renderer.rules.footnote_block_open = (...args) =>
      renderFootnotes(...args).replace('class="footnotes"', 'data-wx-footnotes="true"');
  }
  md.inline.ruler.before('image', 'obsidian-inline', (state, silent) => {
    const start = state.pos;
    const rest = state.src.slice(start);
    if (/^<br\s*\/?\s*>/i.test(rest)) {
      const match = rest.match(/^<br\s*\/?\s*>/i)![0];
      if (!silent) state.push('hardbreak', 'br', 0);
      state.pos += match.length; return true;
    }
    if (rest.startsWith('%%')) {
      const end = state.src.indexOf('%%', start + 2);
      if (end === -1) return false;
      state.pos = end + 2; return true;
    }
    if (rest.startsWith('![[') || rest.startsWith('[[')) {
      const embed = rest.startsWith('!');
      const prefix = embed ? 3 : 2;
      const end = state.src.indexOf(']]', start + prefix);
      if (end === -1) return false;
      if (!silent) {
        const inside = state.src.slice(start + prefix, end);
        const divider = inside.indexOf('|');
        const target = (divider < 0 ? inside : inside.slice(0, divider)).trim();
        const label = divider < 0 ? '' : inside.slice(divider + 1);
        const file = target.split('#')[0];
        if (embed && /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(file)) {
          const token = state.push('image', 'img', 0);
          token.attrSet('src', file); token.attrSet('alt', ''); token.content = label && !/^\d+(x\d+)?$/.test(label) ? label : file.split('/').pop() || file;
          const width = label.match(/^(\d+)(?:x\d+)?$/);
          if (width) token.attrSet('width', String(Math.max(1, Math.min(1600, Number(width[1])))));
          token.children = [];
          const text = new state.Token('text', '', 0); text.content = token.content; token.children.push(text);
        } else if (embed) {
          warnings.add('存在笔记、PDF、音视频或 Canvas 嵌入，首版保留占位说明，请展开为正文或图片。');
          const token = state.push('text', '', 0); token.content = `【待展开嵌入：${target}】`;
        } else {
          const token = state.push('text', '', 0); token.content = label || target;
        }
      }
      state.pos = end + 2; return true;
    }
    if (rest.startsWith('==')) {
      const end = state.src.indexOf('==', start + 2);
      if (end <= start + 2) return false;
      if (!silent) {
        state.push('mark_open', 'mark', 1);
        const children: Token[] = [];
        state.md.inline.parse(state.src.slice(start + 2, end), state.md, state.env, children);
        state.tokens.push(...children);
        state.push('mark_close', 'mark', -1);
      }
      state.pos = end + 2; return true;
    }
    if (rest[0] === '^' && (start === 0 || /\s/.test(state.src[start - 1]))) {
      const block = rest.match(/^\^[a-z0-9-]+(?=\s*$)/i);
      if (block) { state.pos += block[0].length; return true; }
    }
    return false;
  });
  md.block.ruler.before('fence', 'obsidian-comment', (state, startLine, endLine, silent) => {
    const pos = state.bMarks[startLine] + state.tShift[startLine];
    if (state.src.slice(pos, pos + 2) !== '%%') return false;
    // Only consume standalone comment blocks; inline comments are handled above.
    const end = state.src.indexOf('%%', pos + 2);
    if (end < 0) {
      if (!silent) warnings.add('有未闭合的 %% 注释；从注释起始行到文末未导出。');
      if (!silent) state.line = endLine;
      return true;
    }
    let last = startLine;
    while (last < endLine && state.eMarks[last] < end + 2) last++;
    if (state.src.slice(end + 2, state.eMarks[last]).trim()) return false;
    if (!silent) state.line = last + 1;
    return true;
  });
  md.block.ruler.before('paragraph', 'obsidian-block-id', (state, start, _end, silent) => {
    const line = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]);
    if (!/^\^[a-z0-9-]+\s*$/i.test(line)) return false;
    if (!silent) state.line = start + 1;
    return true;
  });
  md.core.ruler.after('inline', 'obsidian-callout-and-tasks', state => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'blockquote_open') {
        const inline = tokens[i + 2];
        if (tokens[i + 1]?.type !== 'paragraph_open' || inline?.type !== 'inline') continue;
        const match = inline.content.match(/^\[!([\w-]+)\][+-]?(?:[ \t]+([^\n]*))?(?:\n|$)/);
        if (!match) continue;
        const type = match[1].toLowerCase();
        const labels: Record<string, string> = { note: '笔记', tip: '提示', info: '信息', warning: '注意', danger: '警告', quote: '引用', question: '问题', success: '完成', example: '示例', abstract: '摘要' };
        tokens[i].attrSet('data-wx-callout', type);
        tokens[i + 1].attrSet('data-wx-callout-title', 'true');
        // Keep a separate title and body paragraph, including inline formatting.
        const title = match[2]?.trim() || labels[type] || type;
        const body = inline.content.slice(match[0].length);
        inline.content = `**${title}**`;
        inline.children = []; md.inline.parse(inline.content, md, state.env, inline.children);
        if (body) {
          const open = new state.Token('paragraph_open', 'p', 1);
          const content = new state.Token('inline', '', 0); content.content = body; content.children = [];
          md.inline.parse(body, md, state.env, content.children);
          const close = new state.Token('paragraph_close', 'p', -1);
          tokens.splice(i + 4, 0, open, content, close);
        }
      }
      if (tokens[i].type === 'inline' && tokens[i - 2]?.type === 'list_item_open') {
        const children = tokens[i].children || [];
        const first = children[0];
        if (first?.type === 'text' && /^\[[ xX]\] /.test(first.content)) {
          first.content = first.content.replace(/^\[([ xX])\] /, (_m, checked) => checked === ' ' ? '☐ ' : '☑ ');
        }
      }
      if (tokens[i].type === 'fence' && /^(mermaid|dataview|dataviewjs|query|base|math)\b/i.test(tokens[i].info)) {
        warnings.add('存在图表、公式或动态查询代码块，首版按源码显示；发布前请替换成结果文字或图片。');
      }
      if (tokens[i].type === 'inline' && /(^|\s)\${1,2}[^$\n]+\${1,2}/.test(tokens[i].content)) {
        warnings.add('检测到数学公式语法，首版保留源码；需要公式外观时请替换成图片。');
      }
    }
  });
  return md;
}

export async function renderArticle(source: string, options: RenderOptions): Promise<ArticleResult> {
  const warnings = new Set<string>();
  const settings = normalizeSettings(options.settings || DEFAULTS);
  const doc = options.document;
  let markdown = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!options.selection && markdown.startsWith('---\n')) {
    const end = markdown.slice(4).search(/^(?:---|\.\.\.)\s*$/m);
    if (end >= 0) {
      const after = markdown.indexOf('\n', end + 4);
      markdown = after < 0 ? '' : markdown.slice(after + 1);
    } else warnings.add('YAML 属性未闭合，首版保留原文，请检查文首 ---。');
  }
  markdown = stripComments(markdown, warnings);
  const md = makeParser(warnings);
  const tokens = md.parse(markdown, {});
  let firstH1 = -1;
  for (let i = 0; i < tokens.length; i++) if (tokens[i].type === 'heading_open' && tokens[i].tag === 'h1') { firstH1 = i; break; }
  const titleToken = firstH1 >= 0 ? tokens[firstH1 + 1] : undefined;
  const titleText = titleToken?.children?.map(t => t.type === 'image' ? t.content : t.type === 'text' || t.type === 'code_inline' ? t.content : '').join('');
  const metaTitle = !options.selection && typeof options.metadata?.title === 'string' ? options.metadata.title.trim() : '';
  const filename = options.sourcePath.split('/').pop()?.replace(/\.md$/i, '') || '未命名文章';
  const title = metaTitle || titleText || filename;
  // A frontmatter title differing from H1 leaves that H1 in the body.
  if (!options.selection && settings.hideTitle && firstH1 >= 0 && (!metaTitle || metaTitle === titleText)) tokens.splice(firstH1, 3);
  const purifier = createDOMPurify(doc.defaultView as unknown as Parameters<typeof createDOMPurify>[0]);
  const sanitize=(html:string)=>purifier.sanitize(html, {
    ALLOWED_TAGS: ['p','br','h1','h2','h3','h4','h5','h6','strong','em','s','del','a','img','blockquote','ul','ol','li','table','thead','tbody','tr','th','td','pre','code','hr','mark','sup','sub','section','span'],
    ALLOWED_ATTR: ['href','src','alt','title','width','start','id','data-wx-callout','data-wx-callout-title','data-wx-footnotes'],
    ALLOW_DATA_ATTR: false
  });
  const root = doc.createElement('section');root.innerHTML=sanitize(md.renderer.render(tokens,md.options,{}));
  if(settings.footer.trim()){const footer=doc.createElement('section');footer.dataset.wxFooter='true';footer.innerHTML=sanitize(md.render(stripComments(settings.footer,warnings)));root.append(footer);}
  const images: ArticleImage[] = [];
  const imageElements = Array.from(root.querySelectorAll<HTMLImageElement>('img'));
  const resolved = new Map<string, Promise<ImageResolution | null>>();
  for (let index = 0; index < imageElements.length; index++) {
    const image = imageElements[index];
    const source = image.getAttribute('src') || '';
    const item: ArticleImage = { source, path: source, alt: image.alt || source, status: 'missing' };
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(source)) {
      item.status = 'embedded'; item.previewUrl = source; item.exportUrl = source;
    } else if (webUrl(source)) {
      item.status = 'external'; item.previewUrl = source; item.exportUrl = source;
      if (/^http:/i.test(source)) warnings.add('存在 HTTP 图片地址，建议改为 HTTPS，并检查公众号是否能成功转存。');
    } else if (/^[a-z][\w+.-]*:/i.test(source)) {
      item.status = 'unsupported';
    } else {
      let path = source;
      try { path = decodeURIComponent(source); } catch { /* Preserve malformed paths for a useful missing-image report. */ }
      if (!resolved.has(path)) resolved.set(path, options.resolveImage?.(path) || Promise.resolve(null));
      const local = await resolved.get(path)!;
      if (local) {
        item.path = local.path; item.previewUrl = local.previewUrl;
        item.status = local.exportUrl && httpsUrl(local.exportUrl) ? 'mapped' : 'local';
        if (item.status === 'mapped') item.exportUrl = local.exportUrl;
      }
    }
    if (/\.svg(?:[?#]|$)/i.test(source)) warnings.add('SVG 图片会在复制时自动转换为 PNG。');
    image.dataset.wxImage = String(index);
    image.removeAttribute('src');
    if (item.previewUrl) image.setAttribute('src', item.previewUrl);
    if (!item.previewUrl) {
      const placeholder = doc.createElement('p'); placeholder.dataset.wxImage = String(index);
      placeholder.dataset.wxError = 'true';
      placeholder.textContent = `【图片${item.status === 'unsupported' ? '格式待处理' : '未找到'}：${item.alt}】`;
      placeholder.setAttribute('style', 'color:#9a530c;background-color:#fff6e8;padding:14px;font-size:13px;');
      image.replaceWith(placeholder);
    }
    images.push(item);
  }
  const { chapters } = applyArticleLayout(root, settings);
  const exportRoot = root.cloneNode(true) as HTMLElement;
  // Keep every image's position. Binary embedding is performed only on copy/export.
  for (const element of exportRoot.querySelectorAll<HTMLElement>('[data-wx-image]')) {
    const item = images[Number(element.dataset.wxImage)];
    if (element.tagName === 'IMG') {
      if (item.status === 'external' || item.status === 'embedded') element.setAttribute('src', item.source);
      else element.removeAttribute('src');
    }
  }
  for (const element of exportRoot.querySelectorAll<HTMLElement>('*')) {
    for (const attr of Array.from(element.attributes)) if ((attr.name.startsWith('data-') && attr.name !== 'data-wx-image') || attr.name === 'id') element.removeAttribute(attr.name);
    if (element.tagName === 'A' && (element.getAttribute('href') || '').startsWith('#')) element.removeAttribute('href');
  }
  const plain = exportRoot.cloneNode(true) as HTMLElement;
  for (const br of plain.querySelectorAll('br')) br.replaceWith(doc.createTextNode('\n'));
  for (const el of plain.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,pre,tr,blockquote')) el.append(doc.createTextNode('\n'));
  for (const el of plain.querySelectorAll('td,th')) el.append(doc.createTextNode('\t'));
  const text = (plain.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  const { characters, wechatWords } = countArticleText(root.textContent || '');
  if (images.some(i => i.status === 'missing')) warnings.add('存在找不到的图片，请检查附件路径。');
  if (images.some(i => i.status === 'unsupported')) warnings.add('存在不支持的图片地址，复制前需要修复。');
  if (root.querySelector('a[href^="http"]')) warnings.add('外部链接保留地址；公众号中的可点击性需在后台检查。');
  return {
    title, previewHtml: root.outerHTML, exportHtml: exportRoot.outerHTML, text,
    images, warnings: [...warnings], characters, wechatWords, minutes: Math.max(1, Math.ceil(wechatWords / 450)),
    codeBlocks: root.querySelectorAll('pre').length, chapters
  };
}
