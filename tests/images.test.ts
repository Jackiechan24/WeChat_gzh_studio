import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { renderArticle, type ArticleResult } from '../src/renderer';
import { prepareArticle, detectImageMime, ImageCopyError, imageDataUrl } from '../src/images';
const document = new JSDOM().window.document as unknown as Document;
const png = async () => { const b = await readFile('examples/排版示意.png'); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const render = (source: string) => renderArticle(source, { document, sourcePath: '演示/test.md', resolveImage: async path => path === 'missing.png' ? null : ({ path, previewUrl: 'app://local/' + encodeURIComponent(path) }) });
const dom = (html: string) => { const el = document.createElement('div'); el.innerHTML = html; return el; };

test('一份富文本完整携带多张本地图片，保留段落顺序、宽度和样式', async () => {
  const source = '## 图文验收\n第一段\n\n![[甲.png|320]]\n\n中间段落 **保留加粗**\n\n![[乙.png]]\n\n第三段\n\n![[丙.png]]\n\n结尾';
  const r = await render(source); let reads = 0; const bytes = await png();
  const prepared = await prepareArticle(r, { document, readLocal: async () => { reads++; return { bytes }; } });
  const el = dom(prepared.html); const images = el.querySelectorAll('img');
  assert.equal(prepared.imageCount, 3); assert.equal(images.length, 3); assert.equal(reads, 3);
  for (const img of images) {
    const src = img.getAttribute('src')!; assert.match(src, /^data:image\/png;base64,/);
    assert.deepEqual(Buffer.from(src.split(',')[1], 'base64'), Buffer.from(bytes));
  }
  assert.match(images[0].getAttribute('style')!, /width:320px/);
  assert.ok(el.querySelector('strong[style]')); assert.ok(el.querySelector('h2[style]'));
  const html = prepared.html; assert.ok(html.indexOf('第一段') < html.indexOf('alt="甲.png"'));
  assert.ok(html.indexOf('alt="甲.png"') < html.indexOf('中间段落'));
  assert.ok(html.indexOf('中间段落') < html.indexOf('alt="乙.png"'));
  assert.ok(html.indexOf('alt="乙.png"') < html.indexOf('第三段'));
  assert.ok(html.indexOf('alt="丙.png"') < html.indexOf('结尾'));
  assert.doesNotMatch(html, /app:\/\/|file:\/\/|data-wx-|图片待上传/);
  assert.match(prepared.text, /中间段落 保留加粗/); assert.match(prepared.text, /\n/);
});

test('重复图片只读取一次，复制时重新读取以反映附件更新', async () => {
  const r = await render('![[甲.png]]\n\n![[甲.png|200]]'); const bytes = await png(); let reads = 0;
  const opts = { document, readLocal: async () => { reads++; return { bytes }; } };
  const first = await prepareArticle(r, opts); assert.equal(reads, 1); assert.equal(dom(first.html).querySelectorAll('img').length, 2);
  await prepareArticle(r, opts); assert.equal(reads, 2);
});

test('附件不存在或损坏时整次准备失败，不输出缺图文章', async () => {
  const bytes = await png();
  await assert.rejects(prepareArticle(await render('![[甲.png]]\n\n![[missing.png]]'), { document, readLocal: async () => ({ bytes }) }), (error: Error) => error instanceof ImageCopyError && error.message.includes('missing.png'));
  await assert.rejects(prepareArticle(await render('![[坏图.png]]'), { document, readLocal: async () => ({ bytes: new TextEncoder().encode('<html>404</html>').buffer }) }), /不是可识别的图片/);
  await assert.rejects(prepareArticle(await render('![[甲.png]]'), { document, readLocal: async () => { throw new Error('磁盘读取失败'); } }), /磁盘读取失败/);
});

test('网络图片也变成内嵌数据，重复 URL 不重复下载', async () => {
  const r = await render('前文\n\n![外链](https://example.org/image.png)\n\n后文\n\n![重复](https://example.org/image.png)');
  const bytes = await png(); let downloads = 0;
  const prepared = await prepareArticle(r, { document, readLocal: async () => { throw new Error('不应读本地'); }, readRemote: async url => { assert.equal(url, 'https://example.org/image.png'); downloads++; return { bytes }; } });
  assert.equal(downloads, 1); assert.equal(dom(prepared.html).querySelectorAll('img[src^="data:image/png"]').length, 2);
  assert.doesNotMatch(prepared.html, /https:\/\/example.org/);
});

test('已内嵌图片能够再次完整复制，不需要网络或附件', async () => {
  const bytes = await png(); const source = imageDataUrl(bytes, 'image/png');
  const r = await render(`![内嵌](${source})`); assert.equal(r.images[0].status, 'embedded');
  const prepared = await prepareArticle(r, { document, readLocal: async () => { throw new Error('不应读取'); } });
  assert.equal(dom(prepared.html).querySelector('img')!.getAttribute('src'), source);
});

test('无图片文章无需任何读取，原转换结果不受图片准备过程修改', async () => {
  const r = await render('## 标题\n正文'); const before = JSON.stringify(r);
  const prepared = await prepareArticle(r, { document, readLocal: async () => { throw new Error('不应读取'); } });
  assert.equal(prepared.imageCount, 0); assert.equal(JSON.stringify(r), before); assert.match(prepared.html, /正文/);
});

test('图片签名识别拒绝伪装响应，GIF 原始数据和透明 PNG 不被压缩', async () => {
  assert.equal(detectImageMime(await png()), 'image/png');
  assert.equal(detectImageMime(new TextEncoder().encode('GIF89a......').buffer), 'image/gif');
  assert.equal(detectImageMime(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>').buffer), 'image/svg+xml');
  assert.equal(detectImageMime(new TextEncoder().encode('<html>login required</html>').buffer), null);
});

test('并发准备不打乱图片位置，进度覆盖所有图片且格式转换器被使用', async () => {
  const r = await render('![[慢.png]]\n\n![[快.png]]'); const bytes = await png(); const progress: number[] = []; let normalized = 0;
  const prepared = await prepareArticle(r, { document, readLocal: async image => { if (image.path === '慢.png') await new Promise(resolve => setTimeout(resolve, 15)); return { bytes }; }, normalize: async (data,mime) => { normalized++; return imageDataUrl(data,mime); }, progress: done => { progress.push(done); } });
  assert.equal(normalized, 2); assert.deepEqual(progress, [1,2]);
  assert.deepEqual(Array.from(dom(prepared.html).querySelectorAll('img')).map(i => i.alt), ['慢.png', '快.png']);
});
