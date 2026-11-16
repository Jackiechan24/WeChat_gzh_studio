import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDocument } from './dom';
import { renderArticle, type RenderOptions } from '../src/renderer';
import { normalizeSettings } from '../src/settings';
const document = createTestDocument();
const render = (source: string, extra: Partial<RenderOptions> = {}) => renderArticle(source, { document, sourcePath: '文章/发布测试.md', ...extra });
const dom = (html: string) => { const el = document.createElement('div'); el.innerHTML = html; return el; };

test('完整文章保留多级列表、表格与每个代码块，属性和正文标题分离', async () => {
  const source = ['---', 'title: 首版测试', 'tags: [私有标签]', '---', '# 首版测试', '', '引言 **重点**。', '', '## 介绍功能', '- 一级', '  - 二级', '', '|A|B|', '|---|---|', '|1|2|', '', ...['js','python','bash'].flatMap(lang => ['```' + lang, 'const x = "[[保持代码]]";', '```', '']), '## 2、手写编号'].join('\n');
  const r = await render(source, { metadata: { title: '首版测试' } }); const el = dom(r.exportHtml);
  assert.equal(r.title, '首版测试'); assert.equal(el.querySelectorAll('h1').length, 0);
  assert.equal(r.codeBlocks, 3); assert.equal(el.querySelectorAll('pre code').length, 3);
  assert.equal(el.querySelectorAll('table tr').length, 2); assert.ok(el.querySelector('[role=list] [role=list]'));
  assert.equal(el.querySelectorAll('h2 span').length, 1); assert.equal(r.chapters, 2);
  assert.doesNotMatch(r.exportHtml, /私有标签/); assert.match(el.querySelector('pre')!.textContent!, /\[\[保持代码\]\]/);
});

test('双链、别名、高亮、内联注释与块标识按语义转换，代码不改写', async () => {
  const r = await render('正文 [[知识库|显示名]] ==高亮 **加粗**== %%不要发布%%。 ^block-id\n\n^standalone\n\n`==代码== %%保留%% [[链接]]`');
  const el = dom(r.exportHtml);
  assert.match(el.textContent!, /显示名/); assert.ok(el.querySelector('span strong'));
  assert.doesNotMatch(el.textContent!, /不要发布|block-id|standalone/);
  assert.equal(el.querySelector('code')!.textContent, '==代码== %%保留%% [[链接]]');
});

test('跨段注释不泄露内容，未闭合注释给出提醒', async () => {
  const r = await render('开头\n\n%%内部备注\n\n跨段隐私\n%%\n\n结尾');
  assert.doesNotMatch(r.text, /内部备注|跨段隐私/); assert.match(r.text, /开头/); assert.match(r.text, /结尾/);
  const broken = await render('正文\n\n%%没关\n内容'); assert.ok(broken.warnings.some(w => w.includes('未闭合'))); assert.doesNotMatch(broken.text, /没关|内容/);
});

test('Callout 保留独立标题、正文、内嵌列表与嵌套提示框', async () => {
  const r = await render('> [!tip]+ 自定提示\n> 第一行正文 **重点**\n>\n> - 提示一\n> - 提示二\n>\n> > [!warning] 内部警告\n> > 注意事项');
  const el = dom(r.exportHtml); assert.equal(el.querySelectorAll('blockquote').length, 2);
  assert.match(el.textContent!, /自定提示/); assert.match(el.textContent!, /第一行正文/);
  assert.match(el.textContent!, /注意事项/); assert.doesNotMatch(el.textContent!, /\[!tip\]|\[!warning\]/);
  assert.equal(el.querySelectorAll('[role=listitem]').length, 2); assert.ok(el.querySelector('blockquote strong'));
});

test('库内图片预览与导出分离，不把 app 资源地址复制出去', async () => {
  const r = await render('![[图 片.png|600]]\n\n![普通图片](../附件/%E5%9B%BE.png)', {
    resolveImage: async path => ({ path: '附件/' + path, previewUrl: 'app://local/image.png' })
  });
  const el = dom(r.previewHtml); assert.equal(el.querySelectorAll('img').length, 2);
  assert.match(el.querySelector('img')!.getAttribute('style')!, /width:600px/);
  assert.equal(r.images[1].source, '../%E9%99%84%E4%BB%B6/%E5%9B%BE.png');
  assert.equal(r.images[0].status, 'local'); assert.doesNotMatch(r.exportHtml, /app:/);
  assert.equal(dom(r.exportHtml).querySelectorAll('img[data-wx-image]').length, 2);
  assert.doesNotMatch(r.text, /图片待上传/);
});

test('已映射 HTTPS 图片可导出，失败图片保留对应位置和提示', async () => {
  const r = await render('![[有图.png]]\n\n![丢失](missing.png)\n\n![远程](https://example.org/x.png)', {
    resolveImage: async path => path === '有图.png' ? { path, previewUrl: 'app://local/x', exportUrl: 'https://example.org/uploaded.png' } : null
  });
  assert.deepEqual(r.images.map(i => i.status), ['mapped', 'missing', 'external']);
  const el = dom(r.exportHtml); assert.equal(el.querySelectorAll('img').length, 2);
  assert.equal(el.querySelector('img')!.getAttribute('src'), null); // Local bytes, not legacy URL mappings, are copied.
  assert.match(r.text, /丢失/); assert.ok(r.warnings.some(w => w.includes('找不到')));
});

test('笔记、块嵌入和动态代码不会静默消失', async () => {
  const r = await render('![[其他文章#^block]]\n\n```dataview\nTABLE title\n```\n\n$x + y$');
  assert.match(r.text, /待展开嵌入/); assert.match(r.text, /TABLE title/);
  assert.ok(r.warnings.some(w => w.includes('动态查询'))); assert.ok(r.warnings.some(w => w.includes('数学公式')));
});

test('选区保留 H1，属性标题与正文 H1 不同时不误删正文', async () => {
  const selection = await render('# 选区标题\n正文', { selection: true, metadata: { title: '全文标题' } });
  assert.equal(selection.title, '选区标题'); assert.equal(dom(selection.exportHtml).querySelectorAll('h1').length, 1);
  const mismatch = await render('# 正文章节\n正文', { metadata: { title: '发布标题' } });
  assert.equal(mismatch.title, '发布标题'); assert.ok(dom(mismatch.exportHtml).querySelector('h1'));
});

test('HTML 与危险链接不可执行，常用 br 能正常换行', async () => {
  const r = await render('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[危险](javascript:alert(1))\n\n甲<br>乙<br />丙\n\n[内部](file:///private.md)');
  const el = dom(r.previewHtml); assert.equal(el.querySelectorAll('script,[onerror],iframe').length, 0);
  assert.equal(el.querySelectorAll('a[href^="javascript:"],a[href^="file:"]').length, 0);
  assert.equal(el.querySelectorAll('br').length, 2); assert.match(el.textContent!, /alert\(1\)/);
});

test('所有主题输出关键元素的内联样式，设置范围有限且没有执行属性', async () => {
  for (const theme of ['jade','blue','ink','amber'] as const) {
    const r = await render('## 章节\n正文 **重点** `代码`\n\n> 引用\n\n- 列表', { settings: { theme, fontSize: 18, lineHeight: 2.1 } });
    const el = dom(r.exportHtml); assert.equal((el.firstElementChild as HTMLElement).style.fontSize, '18px');
    for (const node of el.querySelectorAll('h2,p,strong,code,blockquote,ul,li')) assert.ok(node.hasAttribute('style'), node.tagName);
    assert.doesNotMatch(r.exportHtml, /data-wx-|class=/);
  }
  const normalized = normalizeSettings({ fontSize: 999, lineHeight: NaN, textColor: 'red;display:none' });
  assert.equal(normalized.fontSize, 24); assert.equal(normalized.lineHeight, 1.9); assert.equal(normalized.textColor, '');
});

test('脚注内容、多个链接、固定结尾和清单均保留', async () => {
  const r = await render('正文[^1]\n\n- [ ] 待办\n- [x] 完成\n\n[^1]: 来源说明 [原文](https://example.org)', { settings: { footer: '**感谢阅读**' } });
  assert.match(r.text, /来源说明/); assert.match(r.text, /☐ 待办/); assert.match(r.text, /☑ 完成/);
  assert.match(r.text, /感谢阅读/); assert.ok(dom(r.exportHtml).querySelector('a[href="https://example.org"]'));
});

test('只有属性的文章可正常转换为空正文，代码中的属性分隔线不受影响', async () => {
  const r = await render('---\ntitle: 空文章\n---', { metadata: { title: '空文章' } }); assert.equal(r.title, '空文章'); assert.equal(r.characters, 0);
  const code = await render('```md\n---\ntitle: code\n---\n```'); assert.match(code.text, /title: code/);
});


test('段落中开始的跨段注释也被排除，代码与转义注释仍保留', async () => {
  const r = await render('开始 %%内部\n\n敏感内容%% 结束\n\n```md\n%%代码注释保留%%\n```\n\n    %%缩进代码保留%%\n\n`%%行内代码保留%%`');
  assert.doesNotMatch(r.text, /内部|敏感内容/); assert.match(r.text, /开始/); assert.match(r.text, /结束/);
  assert.match(r.text, /代码注释保留/); assert.match(r.text, /缩进代码保留/); assert.match(r.text, /行内代码保留/);
});
