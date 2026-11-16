import { createDetachedElement } from './dom';
import { getArticleColors, type LayoutSettings } from './settings';

// Article styles must travel with the generated HTML when pasted into WeChat.
function applyInlineStyles(element: HTMLElement, declarations: Record<string, string>): void {
  for (const [property, value] of Object.entries(declarations)) {
    element.style.setProperty(property, value);
  }
}

function replaceInlineStyle(element: HTMLElement, cssText: string): void {
  element.style.cssText = cssText;
}

function appendInlineStyle(element: HTMLElement, cssText: string): void {
  replaceInlineStyle(element, element.style.cssText + cssText);
}

function retag(element: Element, tag: 'section' | 'span'): HTMLElement {
  const replacement = createDetachedElement(element.ownerDocument, tag);
  for (const attr of Array.from(element.attributes)) replacement.setAttribute(attr.name, attr.value);
  replacement.append(...Array.from(element.childNodes)); element.replaceWith(replacement); return replacement;
}

// Give images their own valid block, even when Markdown puts text and an image
// in the same paragraph. Range cloning retains surrounding inline formatting.
function separateImages(root: HTMLElement): void {
  const doc = root.ownerDocument;
  for (const paragraph of Array.from(root.querySelectorAll('p'))) {
    const images = Array.from(paragraph.querySelectorAll('img'));
    if (!images.length) continue;
    const output: Node[] = [];
    const range = doc.createRange(); range.setStart(paragraph, 0);
    const appendText = () => {
      const fragment = range.cloneContents();
      if (!(fragment.textContent || '').trim() && !fragment.querySelector('code')) return;
      const p = paragraph.cloneNode(false) as HTMLElement; p.append(fragment); output.push(p);
    };
    for (const image of images) {
      range.setEndBefore(image); appendText();
      const block = createDetachedElement(doc, 'section'); block.dataset.wxBlock = 'image'; block.append(image.cloneNode(true)); output.push(block);
      range.setStartAfter(image);
    }
    range.setEnd(paragraph, paragraph.childNodes.length); appendText(); paragraph.replaceWith(...output);
  }
}

export function applyArticleLayout(root: HTMLElement, s: LayoutSettings): { chapters: number } {
  const doc = root.ownerDocument, theme = getArticleColors(s);
  const size = s.fontSize, line = Math.round(size * s.lineHeight * 100) / 100;
  const color = s.textColor || theme.text;
  const font = s.composition==='apple'?'"SF Pro SC","SF Pro Display","PingFang SC",-apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif':s.font === 'kai' ? 'KaiTi,"STKaiti","Kaiti SC",serif' : s.font === 'serif' ? '"Noto Serif SC","Source Han Serif SC","Songti SC",SimSun,serif' : '-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif';
  const common = `box-sizing:border-box;font-family:${font};font-size:${size}px;line-height:${line}px;color:${color};font-weight:${s.fontWeight};letter-spacing:${s.letterSpacing}px;text-align:${s.textAlign};text-indent:0;white-space:normal;word-wrap:break-word;overflow-wrap:break-word;word-break:normal;`;
  const block = `${common}margin:0;padding:0;`;
  root.setAttribute('style', `${block}display:block;width:100%;max-width:100%;background-color:#ffffff;`);
  applyInlineStyles(root, { padding: `0 ${s.contentInset}px` });
  separateImages(root);
  for (const mark of Array.from(root.querySelectorAll('mark'))) retag(mark, 'span').dataset.wxHighlight = 'true';
  const codeColor=s.codeTheme==='dark'?'#e5e7eb':'#243042';
  const codeBackground=s.codeTheme==='dark'?(s.composition==='technical'?'#172636':'#1f2937'):'#f5f7f9';
  const codeLine=Math.round(s.codeFontSize*1.7);
  const quoteFrame=s.quoteStyle==='card'?`border:1px solid #dce4e2;border-radius:6px;background-color:${theme.soft};`:`border:0;border-left:3px solid ${theme.accent};background-color:${s.quoteStyle==='line'?'transparent':theme.soft};`;
  const styles: Record<string,string> = {
    p: block,
    strong: `box-sizing:border-box;font-family:inherit;font-size:inherit;line-height:inherit;font-weight:700;color:${s.strongStyle==='accent'?theme.accent:'inherit'};${s.strongStyle==='underline'?`text-decoration:underline;text-decoration-color:${theme.accent};text-underline-offset:3px;`:''}`,
    em: 'font-family:inherit;font-size:inherit;line-height:inherit;font-style:italic;',
    s: 'font-size:inherit;text-decoration:line-through;', del: 'font-size:inherit;text-decoration:line-through;',
    a: `font-family:inherit;font-size:inherit;line-height:inherit;color:${s.linkStyle==='subtle'?'inherit':theme.accent};text-decoration:${s.linkStyle==='underline'?'underline':'none'};${s.linkStyle==='subtle'?'border-bottom:1px solid #a7b3ad;':''}word-break:break-all;`,
    blockquote: `${block}padding:14px 16px;${quoteFrame}`,
    ul: `${block}list-style:none;`, ol: `${block}list-style:none;`, li: `${block}display:block;list-style:none;`,
    table: `${block}width:100%;max-width:100%;border-collapse:collapse;border-spacing:0;table-layout:auto;font-size:${Math.max(12,size-2)}px;line-height:1.65;`,
    th: `${block}border:1px solid #dce4e2;background-color:${theme.soft};padding:10px 9px;vertical-align:top;text-align:left;font-size:${Math.max(12,size-2)}px;line-height:1.65;font-weight:700;`,
    td: `${block}border:1px solid #dce4e2;padding:10px 9px;vertical-align:top;text-align:left;font-size:${Math.max(12,size-2)}px;line-height:1.65;`,
    pre: `${block}border:1px solid #e5e9ed;border-radius:4px;background-color:${codeBackground};color:${codeColor};padding:14px;font-family:Consolas,Menlo,monospace;font-size:${s.codeFontSize}px;line-height:${codeLine}px;text-align:left;white-space:pre-wrap;word-break:break-word;`,
    code: `box-sizing:border-box;font-family:Consolas,Menlo,monospace;font-size:${Math.max(12,size-2)}px;line-height:inherit;background-color:${theme.soft};color:${theme.accent};padding:2px 4px;border-radius:3px;word-break:break-word;`,
    hr: `box-sizing:border-box;display:block;width:100%;height:0;margin:0;padding:0;border:0;border-top:${s.dividerStyle==='dots'?`2px dotted ${theme.accent}`:s.dividerStyle==='dashed'?'1px dashed #b8c5be':'1px solid #dce4e2'};`,
    sup: 'font-size:12px;line-height:0;vertical-align:super;', sub: 'font-size:11px;line-height:0;vertical-align:sub;'
  };
  for (const element of root.querySelectorAll<HTMLElement>('*')) {
    const style = styles[element.tagName.toLowerCase()];
    if (style) element.setAttribute('style', style);
    else applyInlineStyles(element, { 'box-sizing': 'border-box' });
    if (element.dataset.wxHighlight) element.setAttribute('style', `box-sizing:border-box;font-size:inherit;line-height:inherit;background-color:${s.highlightStyle==='underline'?'transparent':theme.soft};color:${s.highlightStyle==='underline'?'inherit':theme.accent};padding:1px 2px;${s.highlightStyle==='marker'?`border-bottom:3px solid ${theme.accent};`:s.highlightStyle==='underline'?`border-bottom:2px solid ${theme.accent};`:''}`);
    if (element.dataset.wxBlock === 'image') element.setAttribute('style', `box-sizing:border-box;display:block;width:100%;max-width:100%;margin:0;padding:${s.imageFrame==='card'?8:0}px;line-height:0;font-size:0;text-align:${s.imageAlign};${s.imageFrame==='card'?`background-color:${theme.soft};border:1px solid #dce4e2;border-radius:${s.imageRadius}px;`:''}`);
    if (element.dataset.wxError) element.setAttribute('style', `${block}padding:12px;color:#9a530c;background-color:#fff6e8;font-size:13px;line-height:21px;`);
  }
  for (const code of root.querySelectorAll('pre code')) code.setAttribute('style', `font-family:Consolas,Menlo,monospace;font-size:${s.codeFontSize}px;line-height:${codeLine}px;background-color:transparent;color:${codeColor};margin:0;padding:0;white-space:pre-wrap;word-break:break-word;`);
  for (const image of root.querySelectorAll('img')) {
    const width = Number(image.getAttribute('width'));
    image.removeAttribute('width'); image.removeAttribute('height');
    image.setAttribute('style', `box-sizing:border-box;display:block;max-width:${s.imageMaxWidth}%;width:${width > 0 ? `${Math.min(1600,width)}px` : 'auto'};height:auto;margin:${s.imageAlign==='left'?'0':'0 auto'};padding:0;border:${s.imageFrame==='border'?'1px solid #dce4e2':'0'};border-radius:${s.imageRadius}px;vertical-align:middle;`);
  }
  let chapters = 0;
  for (const heading of root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')) {
    const level = Number(heading.tagName[1]);
    const offsets={compact:[6,3,1,0,-1,-2],balanced:[8,4,2,0,-1,-2],large:[12,7,4,2,0,-1]};
    const headingSize=Math.min(36,Math.max(12,size+offsets[s.headingScale][level-1]));
    const headingColor = level >= 5 ? '#64716c' : s.headingColor==='accent'?theme.accent:color;
    heading.setAttribute('style', `${block}font-size:${headingSize}px;line-height:1.5;font-weight:${s.headingWeight};color:${headingColor};text-align:${level<=2?s.headingAlign:'left'};`);
    if (level === 2&&!heading.closest('[data-wx-footer]')) {
      chapters++;
      if (s.chapter === 'line') { applyInlineStyles(heading, { 'border-left': `3px solid ${theme.accent}`, 'padding-left': '11px' }); }
      else if (s.chapter === 'underline') { applyInlineStyles(heading, { 'border-bottom': `3px solid ${theme.accent}`, 'padding-bottom': '8px' }); }
      else if(s.chapter==='soft'){applyInlineStyles(heading, { 'background-color': theme.soft, padding: '8px 12px', 'border-radius': '4px' });}
      else if(s.chapter==='outline'){applyInlineStyles(heading, { border: `1px solid ${theme.accent}`, padding: '7px 10px', 'border-radius': '2px' });}
      const hasNumber = /^(?:\d+[.、．\s]|[一二三四五六七八九十百]+[、.．]|第.+[章节])/.test(heading.textContent?.trim() || '');
      const existing=s.numberChapters&&s.composition==='editorial'&&hasNumber?takeHeadingNumber(heading):null;
      if (s.numberChapters && (!hasNumber||existing)) {
        const number = createDetachedElement(doc, 'span');number.dataset.wxChapterNumber='true'; number.textContent = existing||`${String(chapters).padStart(2,'0')} `;
        number.setAttribute('style', `font-family:${font};font-size:${s.chapter === 'number' ? headingSize+4 : headingSize}px;line-height:1.5;font-weight:700;color:${theme.accent};padding-right:8px;`);
        heading.prepend(number);
      }
    }
  }
  for(const h of root.querySelectorAll<HTMLElement>('h3')){if(s.h3Style==='line'){applyInlineStyles(h, { 'border-left': `2px solid ${theme.accent}`, 'padding-left': '8px' });}else if(s.h3Style==='underline'){applyInlineStyles(h, { 'border-bottom': '1px solid #dce4e2', 'padding-bottom': '6px' });}}
  for(const p of root.querySelectorAll<HTMLElement>(':scope > p'))if(s.paragraphIndent)applyInlineStyles(p, { 'text-indent': '2em' });
  for(const table of root.querySelectorAll<HTMLTableElement>('table'))for(const [index,row]of Array.from(table.rows).entries())for(const cell of Array.from(row.cells)){
    if(s.tableStyle==='striped'&&cell.tagName==='TD'&&index%2===0)applyInlineStyles(cell, { 'background-color': theme.soft });
    if(s.tableStyle==='minimal'){applyInlineStyles(cell, { 'border-left': '0', 'border-right': '0', 'border-top': '0' });if(cell.tagName==='TH')applyInlineStyles(cell, { 'border-bottom': `2px solid ${theme.accent}` });}
  }
  for (const quote of root.querySelectorAll<HTMLElement>('blockquote')) {
    const caution = /^(warning|danger|caution|failure|error)$/.test(quote.dataset.wxCallout || '');
    if (caution) { applyInlineStyles(quote, { 'border-left-color': '#b45309', 'background-color': s.quoteStyle==='line'?'transparent':'#fff6e8' }); }
    const title = quote.querySelector<HTMLElement>(':scope > p[data-wx-callout-title]');
    if (title) { applyInlineStyles(title, { color: caution ? '#9a530c' : theme.accent, 'font-weight': '700' }); }
  }

  stylePresetComposition(root,s,block);
  stylePresetHeadings(root,s);
  const footer=root.querySelector<HTMLElement>(':scope > [data-wx-footer]');
  if(footer){
    replaceInlineStyle(footer, `${block}display:block;width:100%;border-top:1px solid ${s.composition==='bulletin'?'#d9a4a7':s.composition==='journal'?'#d8bea4':s.composition==='apple'?'#d2d2d7':'#dce4e2'};padding-top:18px;`);
    if(s.composition==='cards'){applyInlineStyles(footer, { 'background-color': '#ffffff', padding: '16px', 'border-radius': '6px' });}
    for(const p of footer.querySelectorAll<HTMLElement>('p')){applyInlineStyles(p, { 'font-size': `${Math.max(13,s.fontSize-2)}px`, 'line-height': '1.8', 'text-indent': '0' });}
  }

  // Static visible markers avoid browser/WeChat differences in native list bullets.
  // Semantic roles remain available to assistive technology in the preview.
  for (const list of Array.from(root.querySelectorAll<HTMLElement>('ul,ol'))) {
    const items = Array.from(list.children).filter(e => e.tagName === 'LI') as HTMLElement[];
    const ordered = list.tagName === 'OL';
    const start = Number(list.getAttribute('start')) || 1;
    let depth=0; for(let node=list.parentElement;node && node!==root;node=node.parentElement) if(node.tagName==='UL'||node.tagName==='OL') depth++;
    const indent = ordered ? Math.max(s.listIndent+2,String(start+items.length-1).length*8+10) : s.listIndent;
    for (let i=0;i<items.length;i++) {
      const item=items[i];
      const first = createDetachedElement(doc, 'p'); first.setAttribute('style', block);
      while (item.firstChild && !(item.firstChild.nodeType===1 && /^(P|UL|OL|SECTION|BLOCKQUOTE|PRE|TABLE|H[1-6])$/.test((item.firstChild as Element).tagName))) first.append(item.firstChild);
      let lineElement: HTMLElement;
      if ((first.textContent||'').trim() || first.querySelector('img,code')) { item.prepend(first); lineElement=first; }
      else if (item.firstElementChild?.tagName==='P') lineElement=item.firstElementChild as HTMLElement;
      else { item.prepend(first); lineElement=first; }
      const n=start+i;
      let marker = ordered ? (s.orderedStyle==='paren'?`${n})`:s.orderedStyle==='circle'&&n>=1&&n<=20?String.fromCharCode(0x2460+n-1):`${n}.`) : (s.listStyle==='dash'?['—','–','·']:s.listStyle==='square'?['▪','▫','▪']:['•','◦','▪'])[Math.min(depth,2)];
      const walker = doc.createTreeWalker(lineElement, 4); let node: Node|null;
      while ((node=walker.nextNode())) {
        if (!node.textContent?.trim()) continue;
        const task = node.textContent.match(/^\s*([☐☑])\s*/);
        if (task) { marker=task[1];node.textContent=node.textContent.replace(/^\s*[☐☑]\s*/,''); }
        break;
      }
      applyInlineStyles(lineElement, { 'text-align': 'left', 'padding-left': `${indent}px`, 'text-indent': `-${indent}px` });
      const symbol=createDetachedElement(doc, 'span');symbol.dataset.wxMarker='true';symbol.textContent=`${marker} `;
      symbol.setAttribute('style', `display:inline-block;box-sizing:border-box;width:${indent}px;font-family:${font};font-size:${ordered ? size : Math.max(14,size-1)}px;line-height:${line}px;text-indent:0;text-align:left;font-weight:500;color:${theme.accent};`);
      lineElement.prepend(symbol);
      const children=Array.from(item.children) as HTMLElement[];
      for(const child of children) if(child!==lineElement) {
        const inset=createDetachedElement(doc, 'section');inset.setAttribute('style',`${block}display:block;width:100%;padding-left:${indent}px;padding-top:${s.listGap}px;`);
        child.replaceWith(inset);inset.append(child);
      }
      if(i) applyInlineStyles(item, { 'padding-top': `${s.listGap}px` });
      item.setAttribute('role','listitem');
    }
  }
  for(const list of Array.from(root.querySelectorAll('ul,ol')).reverse()) { const replacement=retag(list,'section');replacement.setAttribute('role','list'); }
  for(const item of Array.from(root.querySelectorAll('li'))) retag(item,'section').setAttribute('role','listitem');

  const notePrefix = /^(?:图注|图说|备注|注|来源|图源|图片来源|资料来源|数据来源|参考来源)\s*[:：]/;
  for (const paragraph of root.querySelectorAll<HTMLElement>('p')) {
    const firstText = paragraph.textContent?.trim() || '';
    if (paragraph.closest('[data-wx-footnotes]') || notePrefix.test(firstText)) {
      applyInlineStyles(paragraph, { 'font-size': '13px', 'line-height': '1.6', 'text-indent': '0' });
      for (const inline of paragraph.querySelectorAll<HTMLElement>('code,[data-wx-marker]')) {
        applyInlineStyles(inline, { 'font-size': 'inherit', 'line-height': 'inherit' });
      }
    }
  }

  function flow(container: HTMLElement, insideQuote = false): void {
    const elements=Array.from(container.children) as HTMLElement[];
    let previous: HTMLElement|undefined;
    const kind=(el:HTMLElement)=>el.dataset.wxFooter?'footer':el.dataset.wxBlock==='image'?'image':el.tagName.toLowerCase();
    for(const element of elements) {
      const next=kind(element),prev=previous?kind(previous):'';
      let gap=0;
      if(previous) {
        if(insideQuote) gap=12;
        else if(next==='footer')gap=32;
        else if(s.composition!=='classic'&&next==='h1')gap=s.chapterGap+10;
        else if(s.composition!=='classic'&&prev==='h1')gap=s.headingAfterGap+6;
        else if(s.composition!=='classic'&&next==='h4')gap=Math.max(16,s.subheadingGap-6);
        else if(next==='h1'||next==='h2') gap=s.chapterGap;
        else if(next==='h3') gap=s.subheadingGap;
        else if(/^h[4-6]$/.test(next)) gap=20;
        else if(/^h[1-2]$/.test(prev)) gap=s.headingAfterGap;
        else if(/^h[3-6]$/.test(prev)) gap=Math.max(6,s.headingAfterGap-4);
        else if(next==='hr'||prev==='hr') gap=26;
        else if(next==='image'||prev==='image')gap=s.imageGap;
        else if(['pre','table','blockquote'].includes(next)||['pre','table','blockquote'].includes(prev)) gap=20;
        else gap=s.paragraphGap;
      }
      if(previous&&!insideQuote&&(next==='image'||prev==='image'))gap=/^h[1-6]$/.test(next)?Math.max(gap,s.imageGap):s.imageGap;
      const wrapper=createDetachedElement(doc, 'section');wrapper.dataset.wxFlow=next;
      wrapper.setAttribute('style', `${block}display:block;width:100%;max-width:100%;padding-top:${gap}px;`);
      element.replaceWith(wrapper);wrapper.append(element); previous=element;
    }
  }
  for(const quote of Array.from(root.querySelectorAll<HTMLElement>('blockquote')).reverse()) flow(quote,true);
  if(footer)flow(footer,true);
  flow(root);
  if(s.composition==='cards')groupChapterCards(root,block);
  return {chapters};
}

// Presets own structure as well as typography. All decorations stay inline in
// the article itself, so the clipboard uses the same visual output.
function stylePresetComposition(root:HTMLElement,s:LayoutSettings,block:string):void {
  const lead=root.firstElementChild?.tagName==='P'?root.firstElementChild as HTMLElement:null;
  if(s.composition==='classic'||s.composition==='reading'){
    if(lead){applyInlineStyles(lead, { color: '#46625b', 'padding-bottom': '18px', 'border-bottom': '1px solid #e1ece7' });}
    return;
  }
  if(s.composition==='editorial'){
    for(const h of root.querySelectorAll<HTMLElement>('h2')){
      appendInlineStyle(h, `border:0;border-top:3px solid #191919;border-bottom:1px solid #191919;padding:20px 0 18px;text-align:center;`);
      const n=h.querySelector<HTMLElement>('[data-wx-chapter-number]');if(n)replaceInlineStyle(n, 'display:block;font-family:Georgia,"Times New Roman",serif;font-size:inherit;font-weight:400;line-height:1;color:#191919;padding:0 0 8px;margin:0;');
    }
    if(lead){applyInlineStyles(lead, { 'font-style': 'italic', color: '#555555', 'padding-bottom': '22px', 'border-bottom': '1px solid #d8d8d8' });}
    for(const quote of root.querySelectorAll<HTMLElement>('blockquote')){
      if(quote.dataset.wxCallout)continue;
      appendInlineStyle(quote, `border:0;border-top:1px solid #8b8b8b;border-bottom:1px solid #8b8b8b;background-color:transparent;padding:20px 8px;font-style:italic;`);
      for(const p of quote.querySelectorAll<HTMLElement>('p')){applyInlineStyles(p, { 'text-align': 'center' });}
    }
  }else if(s.composition==='cards'){
    applyInlineStyles(root, { 'background-color': '#f1f5fb', padding: `12px ${s.contentInset}px` });
    for(const h of root.querySelectorAll<HTMLElement>('h2')){
      appendInlineStyle(h, `border:0;background-color:#2458ab;color:#ffffff;padding:10px 12px;border-radius:5px;`);
      const n=h.querySelector<HTMLElement>('[data-wx-chapter-number]');if(n)applyInlineStyles(n, { color: '#c5d9ff' });
    }
  }else if(s.composition==='apple'){
    applyInlineStyles(root, { 'background-color': '#ffffff' });
    const intro=lead||(root.firstElementChild?.tagName==='H1'&&root.firstElementChild.nextElementSibling?.tagName==='P'?root.firstElementChild.nextElementSibling as HTMLElement:null);
    if(intro){applyInlineStyles(intro, { 'font-weight': '500', 'text-align': 'center', color: '#6e6e73', 'padding-bottom': '20px' });}
    for(const strong of root.querySelectorAll<HTMLElement>('strong'))applyInlineStyles(strong, { color: '#1d1d1f' });
    for(const image of root.querySelectorAll<HTMLElement>('[data-wx-block="image"]')){applyInlineStyles(image, { 'background-color': '#f5f5f7', border: '0', 'border-radius': '14px', padding: '16px' });}
    for(const quote of root.querySelectorAll<HTMLElement>('blockquote'))if(!quote.dataset.wxCallout){applyInlineStyles(quote, { border: '0', 'border-radius': '14px', 'background-color': '#f5f5f7', padding: '20px' });}
    for(const code of root.querySelectorAll<HTMLElement>('pre')){applyInlineStyles(code, { border: '0', 'border-radius': '12px', 'background-color': '#f5f5f7' });}
    for(const code of root.querySelectorAll<HTMLElement>('code'))applyInlineStyles(code, { color: '#1d1d1f' });
    for(const th of root.querySelectorAll<HTMLElement>('th')){applyInlineStyles(th, { 'background-color': '#f5f5f7', color: '#1d1d1f' });}
    for(const rule of root.querySelectorAll<HTMLElement>('hr'))applyInlineStyles(rule, { 'border-top': '1px solid #d2d2d7' });
  }else if(s.composition==='journal'){
    applyInlineStyles(root, { 'background-color': '#fffaf2', padding: '18px 14px' });
    for(const h of root.querySelectorAll<HTMLElement>('h2'))appendInlineStyle(h, 'border:0;border-bottom:1px dashed #c39b76;padding:0 0 10px;text-align:left;');
    for(const quote of root.querySelectorAll<HTMLElement>('blockquote')){
      if(quote.dataset.wxCallout)continue;
      appendInlineStyle(quote, 'border:1px dashed #c9aa89;background-color:#fffdf8;border-radius:3px;padding:16px;');
    }
    for(const image of root.querySelectorAll<HTMLElement>('[data-wx-block="image"]'))appendInlineStyle(image, 'background-color:#ffffff;border:1px solid #e6d3bb;padding:7px;');
  }else if(s.composition==='technical'){
    for(const h of root.querySelectorAll<HTMLElement>('h2')){
      appendInlineStyle(h, 'background-color:#183047;color:#ffffff;border:0;border-left:4px solid #71c9d0;padding:12px;');
      const n=h.querySelector<HTMLElement>('[data-wx-chapter-number]');if(n)replaceInlineStyle(n, 'font-family:Consolas,monospace;font-size:inherit;font-weight:700;line-height:1.5;color:#86d2da;padding-right:10px;');
    }
    for(const cell of root.querySelectorAll<HTMLElement>('th')){applyInlineStyles(cell, { 'background-color': '#183047', color: '#ffffff' });}
    for(const code of root.querySelectorAll<HTMLElement>('pre')){applyInlineStyles(code, { border: '0', 'border-radius': '0' });}
    if(lead){appendInlineStyle(lead, 'background-color:#f0f5f9;border-top:3px solid #183047;padding:14px;');}
  }
}
function groupChapterCards(root:HTMLElement,block:string):void {
  const nodes=Array.from(root.children) as HTMLElement[];root.replaceChildren();
  let card:HTMLElement|null=null;
  for(const node of nodes){
    const kind=node.dataset.wxFlow;
    if(kind==='h1'||kind==='hr'||kind==='footer'){card=null;root.append(node);continue;}
    if(kind==='h2'||!card){
      card=createDetachedElement(root.ownerDocument, 'section');card.dataset.wxChapterCard='true';
      card.setAttribute('style',`${block}display:block;width:100%;max-width:100%;background-color:#ffffff;border:1px solid #dfe7f1;border-radius:9px;padding:16px 8px;margin-top:${root.childElementCount?18:0}px;`);
      root.append(card);applyInlineStyles(node, { 'padding-top': '0' });
    }
    card.append(node);
  }
}

function takeHeadingNumber(heading:HTMLElement):string|null {
  const text=heading.textContent||'';
  const match=text.match(/^\s*((?:\d+[.、．]?|[一二三四五六七八九十百]+[、.．]|第.+?[章节]))\s*/);
  if(!match)return null;
  let remaining=match[0].length;
  const walker=heading.ownerDocument.createTreeWalker(heading,4);let node:Node|null;
  while((node=walker.nextNode())){
    const length=node.textContent?.length||0;
    if(remaining<=length){const range=heading.ownerDocument.createRange();range.setStart(heading,0);range.setEnd(node,remaining);range.deleteContents();return match[1].replace(/[.、．]$/,'');}
    remaining-=length;
  }
  return null;
}


function stylePresetHeadings(root:HTMLElement,s:LayoutSettings):void {
  if(s.composition==='classic')return;
  const sizes = [20, 19, 17, 16, 15, 14];
  const accent = s.accentColor || '#087f72';
  for(const h of root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')){
    const level=Number(h.tagName[1]);applyInlineStyles(h, { 'font-size': `${sizes[level-1]}px`, 'font-weight': level===1?'800':level===4?'600':'700', 'text-indent': '0' });
    if(level===1){applyInlineStyles(h, { 'line-height': '1.4', 'text-align': s.composition==='editorial'||s.composition==='journal'?'center':'left', 'padding-bottom': '14px', 'border-bottom': `${s.composition==='journal'?1:3}px solid ${accent}`, color: accent });}
    if(level===3){
      applyInlineStyles(h, { 'line-height': '1.55', border: '0', 'text-align': 'left' });
      if(s.composition==='cards'){applyInlineStyles(h, { 'border-left': `2px solid ${accent}`, 'padding-left': '8px' });}
      else{applyInlineStyles(h, { 'border-bottom': `1px ${s.composition==='journal'||s.composition==='bulletin'?'dashed':'solid'} ${s.composition==='editorial'?'#b5b5b5':accent}`, padding: '0 0 7px' });}
    }
    if(level===4){
      applyInlineStyles(h, { 'line-height': '1.6', border: '0', 'text-align': 'left', 'letter-spacing': '0.2px' });
      if(s.composition==='editorial'){applyInlineStyles(h, { 'border-left': '2px solid #191919', 'padding-left': '9px' });}
      else if(s.composition==='journal'){applyInlineStyles(h, { 'border-bottom': '1px dotted #d6b99a', 'padding-bottom': '5px' });}
      else{applyInlineStyles(h, { 'background-color': s.composition==='bulletin'?'#fff1f1':s.composition==='technical'?'#edf3f7':s.composition==='cards'?'#eff4fc':'#f1f7f4', padding: '5px 8px', 'border-radius': '3px' });}
    }
    if(s.composition==='apple'){
      applyInlineStyles(h, { color: level<=3?'#1d1d1f':'#6e6e73', border: '0', 'background-color': 'transparent', 'border-radius': '0', padding: '0', 'letter-spacing': '0', 'line-height': level<=2?'1.3':'1.45', 'text-align': level===1?'center':'left' });
    }
    if(s.composition==='bulletin'){
      if(level===2){appendInlineStyle(h, 'border:0;border-bottom:2px solid #b22d35;padding:0 0 10px;color:#292b30;text-align:left;');
        const n=h.querySelector<HTMLElement>('[data-wx-chapter-number]');if(n)replaceInlineStyle(n, 'display:inline-block;font-family:Arial,sans-serif;font-size:inherit;line-height:1.4;font-weight:700;background-color:#b22d35;color:#ffffff;padding:3px 7px;margin-right:9px;border-radius:2px;');
      }else if(level===3)applyInlineStyles(h, { color: '#a32630' });
    }
  }
  if(s.composition==='bulletin'){
    for(const th of root.querySelectorAll<HTMLElement>('th')){applyInlineStyles(th, { 'background-color': '#b22d35', color: '#ffffff' });}
    for(const quote of root.querySelectorAll<HTMLElement>('blockquote'))if(!quote.dataset.wxCallout){applyInlineStyles(quote, { 'border-left': '4px solid #b22d35', 'background-color': '#fff5f4' });}
  }
}
