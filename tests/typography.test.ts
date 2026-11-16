import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTestDocument } from './dom';
import { renderArticle } from '../src/renderer';
import { prepareArticle } from '../src/images';
const document=createTestDocument();
const dom=(html:string)=>{const e=document.createElement('div');e.innerHTML=html;return e;};
const fixture='# 文章标题\n\n导语 **重要结论**。\n\n## 章节\n正文 ==高亮==。\n\n### 小节\n- 第一项\n  - 嵌套项\n- 第二项\n\n> [!tip] 提示\n> 提示正文\n\n![示意](图.png)\n\n|类型|内容|\n|---|---|\n|表格|信息|\n\n```js\nconst value = 42;\n```\n\n----';
const render=(source:string,settings={})=>renderArticle(source,{document,sourcePath:'测试.md',settings,resolveImage:async p=>({path:p,previewUrl:'app://local/image.png'})});
function visualHtml(html:string):string {
 const e=dom(html);
 for(const node of e.querySelectorAll('*')) {
  for(const attr of Array.from(node.attributes))if(attr.name.startsWith('data-')||attr.name==='id')node.removeAttribute(attr.name);
  if(node.tagName==='IMG')node.setAttribute('src','IMAGE');
  if(node.tagName==='A' && (node.getAttribute('href')||'').startsWith('#'))node.removeAttribute('href');
  const attrs=Array.from(node.attributes).map(a=>[a.name,a.value]).sort((a,b)=>a[0].localeCompare(b[0]));
  for(const a of Array.from(node.attributes))node.removeAttribute(a.name);
  for(const [name,value]of attrs)node.setAttribute(name,value);
 }
 return e.innerHTML;
}

test('所有主题、章节样式与字体下，预览和最终剪贴板的结构与样式完全一致',async()=>{
 const b=await readFile('examples/排版示意.png');const bytes=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer;
 for(const theme of ['jade','blue','ink','amber'] as const)for(const chapter of ['line','underline','number','simple'] as const)for(const font of ['sans','serif'] as const){
  const r=await render(fixture,{theme,chapter,font});const p=await prepareArticle(r,{document,readLocal:async()=>({bytes})});
  assert.equal(visualHtml(r.previewHtml),visualHtml(p.html),`${theme}/${chapter}/${font}`);
  assert.doesNotMatch(p.html,/<style|class=|var\(--|app:\/\//);
 }
});

test('图片与文字混排被转换为合法的独立图块，保留前后加粗和图片宽度',async()=>{
 const r=await render('**图前 ![[图.png|240]] 图后**\n\n接下来的段落');const e=dom(r.previewHtml);
 assert.equal(e.querySelectorAll('p img').length,0);
 assert.equal(e.querySelectorAll('[data-wx-block=image] img').length,1);
 assert.match(e.querySelector('img')!.getAttribute('style')!,/width:240px/);
 const p=Array.from(e.querySelectorAll('p'));assert.equal(p[0].textContent,'图前 ');assert.equal(p[1].textContent,' 图后');
 assert.ok(p[0].querySelector('strong'));assert.ok(p[1].querySelector('strong'));
 assert.equal((e.querySelector('img') as HTMLElement).style.marginTop,'0px');
});

test('标题、段落、图片间距只由一个外层控制，不叠加段落和图片边距',async()=>{
 const r=await render('首段\n\n第二段\n\n## 章节\n章节正文\n\n![[图.png]]\n\n图后正文');const e=dom(r.previewHtml).firstElementChild!;
 const blocks=Array.from(e.children) as HTMLElement[];
 assert.deepEqual(blocks.map(b=>b.style.paddingTop),['0px','18px','32px','14px','20px','20px']);
 for(const p of e.querySelectorAll('p'))assert.equal(p.style.marginTop,'0px');
 for(const p of e.querySelectorAll('p'))assert.equal(p.style.marginBottom,'0px');
});

test('H1–H6 层级逐级收敛，正文加粗保持正文颜色，主题色用于章标和高亮',async()=>{
 const r=await render('# 一级\n## 二级\n### 三级\n#### 四级\n##### 五级\n###### 六级\n正文 **重点**',{hideTitle:false});const e=dom(r.previewHtml);
 assert.deepEqual(Array.from(e.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')).map(h=>h.style.fontSize),['24px','20px','18px','16px','15px','14px']);
 assert.equal(e.querySelector('p strong')!.getAttribute('style')!.includes('color:inherit'),true);
 for(const p of e.querySelectorAll('p')){assert.equal(p.style.fontSize,'16px');assert.equal(p.style.lineHeight,'30.4px');}
});

test('列表标记是真实内容，无原生项目符号依赖，支持起始序号、嵌套和任务清单',async()=>{
 const r=await render('3. 第三项\n4. 第四项\n\n- 父项\n  - 子项\n\n- [ ] 待办\n- [x] 完成');const e=dom(r.previewHtml);
 assert.equal(e.querySelectorAll('ul,ol,li').length,0);
 assert.equal(e.querySelectorAll('[role=list]').length,3);
 const markers=Array.from(e.querySelectorAll('[data-wx-marker]')).map(e=>e.textContent?.trim());
 assert.deepEqual(markers,['3.','4.','•','◦','☐','☑']);
 assert.equal(e.querySelectorAll('[role=listitem]').length,6);
});

test('图片保留比例，小图不强制拉满，图片与表格没有额外浏览器边距',async()=>{
 const e=dom((await render('![[图.png]]\n\n|A|B|\n|---|---|\n|1|2|')).previewHtml);
 const img=e.querySelector<HTMLImageElement>('img')!;assert.equal(img.style.width,'auto');assert.equal(img.style.maxWidth,'100%');assert.equal(img.style.height,'auto');
 const table=e.querySelector<HTMLTableElement>('table')!;assert.equal(table.style.width,'100%');assert.equal(table.style.marginTop,'0px');assert.equal(table.style.tableLayout,'auto');
});
