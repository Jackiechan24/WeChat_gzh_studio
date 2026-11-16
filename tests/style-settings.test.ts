import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {DEFAULTS,STYLE_KEYS,BUILTIN_STYLES,normalizeSettings,getStyleSettings,normalizeStyleProfiles,applyStyleSettings,activeStyle,getArticleColors,getPreset,migrateStyleSelection,presetSettingsFor,type PluginData} from '../src/settings';
import {renderArticle} from '../src/renderer';
import {prepareArticle} from '../src/images';
const document=new JSDOM().window.document as unknown as Document;
const dom=(html:string)=>{const e=document.createElement('div');e.innerHTML=html;return e;};
const render=(text:string,settings={})=>renderArticle(text,{document,sourcePath:'测试.md',settings,resolveImage:async path=>({path,previewUrl:'app://local/image.png'})});
const fixture='## 章节\n正文 **加粗** ==高亮== [链接](https://example.org)。\n\n### 小节\n- 第一项\n- 第二项\n\n> [!tip] 提示\n> 提示正文\n\n![[图.png]]\n\n|A|B|\n|---|---|\n|1|2|\n|3|4|\n\n```js\nconst x=1;\n```\n\n---';
function visual(html:string):string{const e=dom(html);for(const n of e.querySelectorAll('*')){for(const a of Array.from(n.attributes))if(a.name.startsWith('data-')||a.name==='id'||a.name==='class')n.removeAttribute(a.name);if(n.tagName==='IMG')n.setAttribute('src','IMAGE');const attrs=Array.from(n.attributes).map(a=>[a.name,a.value]).sort((a,b)=>a[0].localeCompare(b[0]));for(const a of Array.from(n.attributes))n.removeAttribute(a.name);for(const[k,v]of attrs)n.setAttribute(k,v);}return e.innerHTML;}

test('旧版设置迁移保持原值，新参数有兼容默认值',()=>{
 const s=normalizeSettings({font:'serif',fontSize:17,theme:'blue',footer:'我的结尾',hideTitle:false});
 assert.equal(s.font,'serif');assert.equal(s.fontSize,17);assert.equal(s.theme,'blue');assert.equal(s.footer,'我的结尾');assert.equal(s.hideTitle,false);
 assert.equal(s.letterSpacing,.2);assert.equal(s.imageRadius,0);assert.equal(s.listGap,8);assert.equal(s.codeTheme,'light');
 assert.equal(Object.keys(s).length,Object.keys(DEFAULTS).length);
});

test('应用风格只覆盖视觉参数，标题规则、章节编号与结尾不会被替换',()=>{
 const current=normalizeSettings({footer:'**保留结尾**',hideTitle:false,numberChapters:false});
 for(const profile of BUILTIN_STYLES){const next=applyStyleSettings(current,profile);assert.equal(next.footer,current.footer);assert.equal(next.hideTitle,false);assert.equal(next.numberChapters,false);assert.equal(activeStyle(next)?.id,profile.id);}
 const patch=getStyleSettings(current);assert.ok(!('footer'in patch)&&!('hideTitle'in patch)&&!('numberChapters'in patch));assert.equal(Object.keys(patch).length,STYLE_KEYS.length);
});

test('个人风格持久化会校验参数、去重并剔除文章专属字段',()=>{
 const list=normalizeStyleProfiles([{id:'user-abc',name:' 我的风格 ',settings:{...DEFAULTS,footer:'私有结尾',imageRadius:999,textColor:'red;display:none'}},{id:'user-abc',name:'重复',settings:{}},{id:'bad',name:'非法',settings:{}}]);
 assert.equal(list.length,1);assert.equal(list[0].name,'我的风格');assert.equal(list[0].settings.imageRadius,20);assert.equal(list[0].settings.textColor,'');assert.doesNotMatch(JSON.stringify(list),/私有结尾/);
 assert.deepEqual(normalizeStyleProfiles(JSON.parse(JSON.stringify(list))),list);
});

test('无效枚举和越界数值不能成为任意 CSS',()=>{
 const s=normalizeSettings(JSON.parse('{"font":"evil","chapter":"evil","accentColor":"url(x)","letterSpacing":99,"contentInset":-9,"imageMaxWidth":400,"codeFontSize":0,"listGap":null}'));
 assert.equal(s.font,'sans');assert.equal(s.chapter,'line');assert.equal(s.accentColor,'');assert.equal(s.letterSpacing,2);assert.equal(s.contentInset,0);assert.equal(s.imageMaxWidth,100);assert.equal(s.codeFontSize,11);assert.equal(s.listGap,8);
});

test('六套成品风格都产生不同排版，且最终复制与预览样式保持一致',async()=>{
 const data=await readFile('examples/排版示意.png');const bytes=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength) as ArrayBuffer;
 const outputs=new Set<string>();
 for(const profile of BUILTIN_STYLES){const r=await render(fixture,profile.settings);outputs.add(r.previewHtml);const p=await prepareArticle(r,{document,readLocal:async()=>({bytes})});assert.equal(visual(p.html),visual(r.previewHtml),profile.name);}
 assert.equal(outputs.size,6);
});

test('正文的字体、字距、对齐与缩进不会污染列表和标题层级',async()=>{
 const e=dom((await render('正文段落\n\n## 章节\n- 列表\n\n> 引用',{font:'kai',letterSpacing:1.2,textAlign:'justify',paragraphIndent:true,contentInset:12,fontWeight:500})).previewHtml);
 const root=e.firstElementChild as HTMLElement;assert.equal(root.style.paddingLeft,'12px');assert.match(root.style.fontFamily,/KaiTi/);
 const p=e.querySelector('p')!;assert.equal(p.style.letterSpacing,'1.2px');assert.equal(p.style.textAlign,'justify');assert.equal(p.style.textIndent,'2em');
 assert.equal((e.querySelector('[role=listitem] p') as HTMLElement).style.textAlign,'left');assert.equal((e.querySelector('h2') as HTMLElement).style.textAlign,'left');
});

test('标题外观与层级参数改变可见结果，章节间距仍只计算一次',async()=>{
 const e=dom((await render('导语\n\n## 章节\n正文\n\n### 小节',{chapter:'outline',headingScale:'large',headingAlign:'center',headingColor:'accent',headingWeight:600,h3Style:'line',chapterGap:40,subheadingGap:30,headingAfterGap:18})).previewHtml);
 const h=e.querySelector('h2')!;assert.equal(h.style.fontSize,'23px');assert.equal(h.style.textAlign,'center');assert.equal(h.style.borderLeftWidth,'1px');assert.equal(h.style.fontWeight,'600');
 assert.equal(h.parentElement!.style.paddingTop,'40px');assert.equal((e.querySelector('h3') as HTMLElement).style.borderLeftWidth,'2px');
 const flows=Array.from(e.firstElementChild!.children) as HTMLElement[];assert.equal(flows[2].style.paddingTop,'18px');assert.equal(flows[3].style.paddingTop,'30px');
});

test('品牌主题色用于强调、列表和引用，正文色仍可单独指定',async()=>{
 const s=normalizeSettings({accentColor:'#7040a0',textColor:'#222222',strongStyle:'accent',highlightStyle:'underline',linkStyle:'subtle'});const colors=getArticleColors(s);assert.equal(colors.accent,'#7040a0');assert.notEqual(colors.soft,'#edf8f5');
 const e=dom((await render(fixture,s)).previewHtml);assert.equal((e.querySelector('p strong') as HTMLElement).style.color,'rgb(112, 64, 160)');
 assert.equal((e.querySelector('[data-wx-highlight]') as HTMLElement).style.borderBottomWidth,'2px');assert.equal((e.querySelector('a') as HTMLElement).style.borderBottomWidth,'1px');assert.match((e.querySelector('[data-wx-marker]') as HTMLElement).style.color,/112, 64, 160/);
});

test('图片的宽度上限、圆角、衬底和上下间距生效',async()=>{
 const e=dom((await render('前文\n\n![[图.png|240]]\n\n后文',{imageRadius:10,imageMaxWidth:80,imageAlign:'left',imageFrame:'card',imageGap:28})).previewHtml);
 const img=e.querySelector('img')!;assert.equal(img.style.width,'240px');assert.equal(img.style.maxWidth,'80%');assert.equal(img.style.borderRadius,'10px');assert.equal(img.style.height,'auto');
 assert.equal((e.querySelector('[data-wx-block=image]') as HTMLElement).style.paddingLeft,'8px');assert.equal((e.querySelector('[data-wx-flow=image]') as HTMLElement).style.paddingTop,'28px');
});

test('列表、引用、表格、代码和分隔线可以组合设置',async()=>{
 const e=dom((await render(fixture,{listStyle:'dash',listGap:12,listIndent:28,quoteStyle:'line',tableStyle:'minimal',codeTheme:'dark',codeFontSize:15,dividerStyle:'dots'})).previewHtml);
 assert.equal(e.querySelector('[data-wx-marker]')!.textContent!.trim(),'—');assert.equal((e.querySelector('[role=listitem] p') as HTMLElement).style.paddingLeft,'28px');
 assert.equal((e.querySelectorAll('[role=listitem]')[1] as HTMLElement).style.paddingTop,'12px');assert.equal((e.querySelector('blockquote') as HTMLElement).style.backgroundColor,'transparent');
 assert.equal((e.querySelector('td') as HTMLElement).style.borderLeftWidth,'0px');assert.equal((e.querySelector('pre code') as HTMLElement).style.fontSize,'15px');assert.equal((e.querySelector('pre') as HTMLElement).style.backgroundColor,'rgb(31, 41, 55)');assert.equal((e.querySelector('hr') as HTMLElement).style.borderTopStyle,'dotted');
 const numbered=dom((await render('1. 一\n2. 二',{orderedStyle:'circle'})).previewHtml);assert.deepEqual(Array.from(numbered.querySelectorAll('[data-wx-marker]')).map(e=>e.textContent?.trim()),['①','②']);
});


test('完整风格不受旧版零散参数影响，文章结尾和标题规则保留',()=>{
 const legacy=normalizeSettings({fontSize:24,lineHeight:2.6,letterSpacing:2,accentColor:'#ff00aa',footer:'原结尾',hideTitle:false,numberChapters:false});
 const data:PluginData={defaults:legacy,articles:{'A.md':{textColor:'#ff0000',chapter:'outline',footer:'本文结尾'}},defaultStyleId:'reader',articleStyleIds:{'A.md':'magazine'},savedStyles:[],imageUrls:{},previewMode:'pad'};
 const s=presetSettingsFor(data,'A.md');
 assert.equal(s.fontSize,16);assert.equal(s.lineHeight,1.75);assert.equal(s.composition,'editorial');assert.equal(s.footer,'本文结尾');assert.equal(s.hideTitle,false);assert.equal(s.numberChapters,true);
 assert.equal(presetSettingsFor(data,'B.md').composition,'reading');assert.equal(data.defaults.fontSize,24);
});

test('旧配置自动映射成品风格，已选风格优先，失效 ID 有可用回退',()=>{
 const result=migrateStyleSelection({defaults:normalizeSettings({theme:'ink'}),articles:{'知识.md':{theme:'blue'},'故事.md':{theme:'amber'},'代码.md':{codeTheme:'dark'}},articleStyleIds:{'知识.md':'reader','旧版.md':'business','失效.md':'missing'}});
 assert.equal(result.defaultStyleId,'magazine');assert.equal(result.articleStyleIds['知识.md'],'reader');assert.equal(result.articleStyleIds['故事.md'],'apple');assert.equal(result.articleStyleIds['代码.md'],'technical');assert.equal(result.articleStyleIds['旧版.md'],'cards');assert.equal(result.articleStyleIds['失效.md'],'reader');
 assert.equal(getPreset('essay').id,'apple');assert.deepEqual(migrateStyleSelection(),{defaultStyleId:'reader',articleStyleIds:{}});
});

test('风格具有不同的章节结构与容器，而非只改变颜色和字号',async()=>{
 const source='导语内容。\n\n## 第一章节\n第一段正文。\n\n### 小节\n正文 **重点**。\n\n> 引用内容\n\n## 第二章节\n最后一段。\n\n```js\nconst n=1;\n```\n\n|A|B|\n|---|---|\n|1|2|';
 const results=await Promise.all(BUILTIN_STYLES.map(async p=>[p.id,dom((await render(source,p.settings)).previewHtml)] as const));
 const map=Object.fromEntries(results);
 const h=(id:string)=>map[id].querySelector('h2') as HTMLElement;
 assert.equal(h('reader').style.borderLeftWidth,'3px');assert.equal(map.reader.querySelector('[data-wx-chapter-number]'),null);
 assert.equal(h('magazine').style.borderTopWidth,'3px');assert.equal(h('magazine').style.borderBottomWidth,'1px');assert.equal(h('magazine').style.textAlign,'center');assert.equal((h('magazine').querySelector('span') as HTMLElement).style.display,'block');assert.equal((h('magazine').querySelector('span') as HTMLElement).style.fontSize,'inherit');
 assert.equal(map.cards.querySelectorAll('[data-wx-chapter-card]').length,3);assert.equal(h('cards').style.backgroundColor,'rgb(36, 88, 171)');assert.equal(h('cards').style.color,'rgb(255, 255, 255)');
 assert.equal((map.apple.firstElementChild as HTMLElement).style.backgroundColor,'rgb(255, 255, 255)');assert.match((map.apple.querySelector('p') as HTMLElement).style.fontFamily,/SF Pro/);assert.equal(parseFloat((map.apple.querySelector('p') as HTMLElement).style.textIndent),0);assert.equal((map.apple.querySelector('blockquote') as HTMLElement).style.backgroundColor,'rgb(245, 245, 247)');assert.equal(parseFloat((map.apple.querySelector('blockquote') as HTMLElement).style.borderTopWidth),0);
 assert.equal(h('technical').style.backgroundColor,'rgb(24, 48, 71)');assert.equal((map.technical.querySelector('pre') as HTMLElement).style.backgroundColor,'rgb(23, 38, 54)');assert.equal((map.technical.querySelector('th') as HTMLElement).style.color,'rgb(255, 255, 255)');
});

test('杂志风将已有编号移到章头，不重复添加序号或丢失强调文本',async()=>{
 const e=dom((await render('## **01** 标题一\n正文\n\n## 二、标题二\n内容',getPreset('magazine').settings)).previewHtml);
 const headings=[...e.querySelectorAll('h2')];assert.equal(headings[0].textContent,'01标题一');assert.equal(headings[1].textContent,'二标题二');assert.equal(e.querySelectorAll('[data-wx-chapter-number]').length,2);
});

test('知识卡片分组不丢失正文顺序，图片和固定结尾保持完整',async()=>{
 const s=getPreset('cards').settings,r=await render('开头\n\n## 章节甲\n段落甲\n\n![[图.png]]\n\n## 章节乙\n段落乙',{...s,footer:'固定签名'});
 const e=dom(r.previewHtml),text=e.textContent||'';
 assert.ok(text.indexOf('开头')<text.indexOf('章节甲'));assert.ok(text.indexOf('段落甲')<text.indexOf('章节乙'));assert.ok(text.indexOf('段落乙')<text.indexOf('固定签名'));assert.equal(e.querySelectorAll('img').length,1);assert.equal(e.querySelectorAll('[data-wx-chapter-card]').length,3);
 const image=e.querySelector('img')!;assert.ok(image.closest('[data-wx-chapter-card]'));
});


test('兼容旧数据时，关闭编号的杂志样式不会吞掉原有章节编号',async()=>{
 const e=dom((await render('## 01 标题',{...getPreset('magazine').settings,numberChapters:false})).previewHtml);
 assert.equal(e.querySelector('h2')!.textContent,'01 标题');assert.equal(e.querySelector('[data-wx-chapter-number]'),null);
});


test('六套成品的 H1–H4 有严格递减字号与独立样式，H4 不与正文混淆',async()=>{
 for(const preset of BUILTIN_STYLES){
  const e=dom((await render('# 一级标题\n正文\n\n## 二级标题\n正文\n\n### 三级标题\n正文\n\n#### 四级标题\n正文',{...preset.settings,hideTitle:false})).previewHtml);
  const headings=[...e.querySelectorAll<HTMLElement>('h1,h2,h3,h4')];assert.equal(headings.length,4);
  const sizes=headings.map(h=>parseFloat(h.style.fontSize));assert.ok(sizes.every((size,i)=>i===0||sizes[i-1]>size),preset.name);
  assert.equal(new Set(headings.map(h=>h.getAttribute('style'))).size,4);assert.ok(Number(headings[3].style.fontWeight)>=600);
  assert.notEqual(headings[3].getAttribute('style'),e.querySelector('p')!.getAttribute('style'));assert.equal(parseFloat(headings[3].style.textIndent),0);
 }
});

test('红黑简报有红底章号、细分标题和红色表头',async()=>{
 const e=dom((await render('## 章节\n正文\n\n### 小节\n内容\n\n#### 要点\n细节\n\n|A|B|\n|---|---|\n|1|2|',getPreset('bulletin').settings)).previewHtml);
 assert.equal((e.querySelector('[data-wx-chapter-number]') as HTMLElement).style.backgroundColor,'rgb(178, 45, 53)');assert.equal((e.querySelector('h2') as HTMLElement).style.borderBottomWidth,'2px');assert.equal((e.querySelector('h3') as HTMLElement).style.borderBottomStyle,'dashed');assert.equal((e.querySelector('h4') as HTMLElement).style.backgroundColor,'rgb(255, 241, 241)');assert.equal((e.querySelector('th') as HTMLElement).style.color,'rgb(255, 255, 255)');
});

test('固定结尾独立解析，不会变成文章标题，也不会被正文未闭合代码吞掉',async()=>{
 const r=await render('```md\n未闭合代码',{...getPreset('reader').settings,footer:'# 署名\n**谢谢阅读** ![[图.png]]'}),e=dom(r.previewHtml);
 assert.equal(r.title,'测试');assert.equal(e.querySelector('pre')!.textContent!.trim(),'未闭合代码');assert.equal(e.querySelectorAll('[data-wx-footer]').length,1);assert.match(e.querySelector('[data-wx-footer]')!.textContent!,/谢谢阅读/);assert.ok(e.querySelector('[data-wx-footer] img'));assert.equal(r.images.length,1);
});

test('固定结尾不重复加入章节编号，清空后不残留分割空白',async()=>{
 const base=getPreset('magazine').settings;
 const a=await render('## 正文章节\n内容',{...base,footer:'## 结尾署名\n联系方式'}),e=dom(a.previewHtml);
 assert.equal(a.chapters,1);assert.equal(e.querySelectorAll('[data-wx-chapter-number]').length,1);assert.ok(e.querySelector('[data-wx-footer] h2'));
 const b=dom((await render('## 正文章节\n内容',{...base,footer:'  '})).previewHtml);assert.equal(b.querySelector('[data-wx-footer]'),null);
});

test('六套结尾含图片时，预览与复制的模块和样式仍相同',async()=>{
 const b=await readFile('examples/排版示意.png'),bytes=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer;
 for(const preset of BUILTIN_STYLES){const r=await render('正文内容',{...preset.settings,footer:'**感谢阅读**\n\n![[署名图片.png|120]]'});const p=await prepareArticle(r,{document,readLocal:async()=>({bytes})});assert.equal(visual(r.previewHtml),visual(p.html),preset.name);assert.equal(p.imageCount,1);assert.match(p.html,/data:image\/png;base64,/);}
});


test('苹果极简替换旧手记风格，并使用官网参考的黑灰层次与柔白图块',async()=>{
 assert.equal(getPreset('warm').id,'apple');assert.equal(migrateStyleSelection({defaultStyleId:'warm',articleStyleIds:{'A.md':'warm'}}).articleStyleIds['A.md'],'apple');
 const e=dom((await render('# 产品标题\n导语说明。\n\n## 章节标题\n正文 **重点**。\n\n### 小节标题\n内容\n\n#### 要点标题\n说明\n\n![[图片.png]]',{...getPreset('apple').settings,hideTitle:false})).previewHtml);
 const h=e.querySelector('h1')!;assert.equal(h.style.fontSize,'20px');assert.equal(h.style.fontWeight,'800');assert.equal(h.style.textAlign,'center');assert.equal(h.style.color,'rgb(29, 29, 31)');assert.equal(parseFloat(h.style.borderBottomWidth),0);
 assert.equal((e.querySelector('h4') as HTMLElement).style.color,'rgb(110, 110, 115)');assert.equal((e.querySelector('[data-wx-block=image]') as HTMLElement).style.backgroundColor,'rgb(245, 245, 247)');assert.equal(e.querySelectorAll('[data-wx-chapter-number]').length,0);
});


test('六套模板在预览和导出中统一正文、章节字号及注释层级', async () => {
  const source = [
    '导语内容。', '',
    '## 章节标题', '段落内容[^source]。', '',
    '### 小标题', '- 列表内容', '',
    '![[图片.png]]', '图注：图片说明', '',
    '**来源：** 测试资料', '',
    '备注：补充说明', '',
    '> 引用内容', '',
    '[^source]: 脚注内容',
  ].join('\n');
  for (const preset of BUILTIN_STYLES) {
    const result = await render(source, preset.settings);
    for (const html of [result.previewHtml, result.exportHtml]) {
      const article = dom(html);
      const paragraphs = [...article.querySelectorAll('p')];
      for (const content of ['导语内容。', '段落内容', '列表内容', '引用内容']) {
        const paragraph = paragraphs.find(p => p.textContent?.includes(content));
        assert.ok(paragraph, `${preset.name}缺少${content}`);
        assert.equal(paragraph.style.fontSize, '16px');
        assert.equal(paragraph.style.lineHeight, '28px');
        assert.ok(parseFloat(paragraph.style.letterSpacing) <= 0.5);
      }
      for (const content of ['图注：', '来源：', '备注：', '脚注内容']) {
        const paragraph = paragraphs.find(p => p.textContent?.includes(content));
        assert.ok(paragraph, `${preset.name}缺少${content}`);
        assert.equal(paragraph.style.fontSize, '13px');
      }
      assert.equal(article.querySelector('h2')?.style.fontSize, '19px');
      assert.equal(article.querySelector('h3')?.style.fontSize, '17px');
      assert.equal(article.querySelector('sup')?.style.fontSize, '12px');
      const root = article.firstElementChild as HTMLElement;
      assert.ok(parseFloat(root.style.paddingLeft) >= 8 && parseFloat(root.style.paddingRight) <= 16);
    }
  }
});
