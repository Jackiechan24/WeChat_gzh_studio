import { Buffer } from 'buffer';
import createDOMPurify from 'dompurify';
import type { ArticleImage, ArticleResult } from './renderer';

export interface ImageBytes { bytes: ArrayBuffer; mime?: string }
export interface PreparedArticle { html: string; text: string; imageCount: number; bytes: number }
export interface ImageCopyOptions {
  document: Document;
  readLocal: (image: ArticleImage) => Promise<ImageBytes>;
  readRemote?: (url: string) => Promise<ImageBytes>;
  normalize?: (bytes: ArrayBuffer, mime: string) => Promise<string>;
  progress?: (done: number, total: number) => void;
}
export class ImageCopyError extends Error {
  constructor(public readonly failures: string[]) {
    super(`以下图片未能读取，未复制不完整的文章：\n${failures.join('\n')}`);
    this.name = 'ImageCopyError';
  }
}

export function detectImageMime(bytes: ArrayBuffer): string | null {
  const b = new Uint8Array(bytes);
  if (b.length < 6) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 13 && b[5] === 10) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  const first = Buffer.from(bytes).subarray(0, 64).toString('ascii');
  if (/^GIF8[79]a/.test(first)) return 'image/gif';
  if (first.startsWith('RIFF') && first.slice(8, 12) === 'WEBP') return 'image/webp';
  if (first.startsWith('BM')) return 'image/bmp';
  if (first.slice(4, 8) === 'ftyp' && /avif|avis/.test(first.slice(8, 32))) return 'image/avif';
  const xml = Buffer.from(bytes).subarray(0, 8192).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(xml)) return 'image/svg+xml';
  return null;
}
export function imageDataUrl(bytes: ArrayBuffer, mime: string): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([promise, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('图片读取超时，请重试')), ms); })]).finally(() => clearTimeout(timer));
}

// PNG/JPEG/GIF retain original bytes (including GIF animation). Other browser-readable
// formats become PNG for paste compatibility. No image data is written back to the vault.
export async function normalizeImage(document: Document, bytes: ArrayBuffer, mime: string): Promise<string> {
  let input = bytes;
  if (mime === 'image/svg+xml') {
    const purifier = createDOMPurify(document.defaultView as unknown as Parameters<typeof createDOMPurify>[0]);
    const safe = purifier.sanitize(Buffer.from(bytes).toString('utf8'), {
      USE_PROFILES: { svg: true }, FORBID_TAGS: ['foreignObject', 'image', 'use', 'script', 'style'], FORBID_ATTR: ['href', 'xlink:href']
    });
    const encoded = Buffer.from(safe, 'utf8'); input = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
  }
  const data = imageDataUrl(input, mime);
  const image = document.createElement('img');
  try {
    await withTimeout(new Promise<void>((resolve, reject) => {
      image.onload = () => resolve(); image.onerror = () => reject(new Error('图片文件损坏或格式无法解码'));
      image.src = data;
    }), 15000);
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('图片尺寸无效');
    if (['image/png', 'image/jpeg', 'image/gif'].includes(mime)) return data;
    if (image.naturalWidth * image.naturalHeight > 64000000) throw new Error('图片尺寸过大，无法转换为 PNG');
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d'); if (!context) throw new Error('无法创建图片转换画布');
    context.drawImage(image, 0, 0);
    const png = canvas.toDataURL('image/png'); canvas.width = 0; canvas.height = 0;
    if (!png.startsWith('data:image/png;base64,')) throw new Error('PNG 转换失败');
    return png;
  } finally { image.onload = null; image.onerror = null; image.removeAttribute('src'); }
}

export async function prepareArticle(result: ArticleResult, options: ImageCopyOptions): Promise<PreparedArticle> {
  const root = options.document.importNode(result.exportRoot, true);
  const cache = new Map<string, Promise<string>>();
  let completed = 0, bytesTotal = 0;
  const failures: string[] = [];
  const encoded = new Map<number, string>();
  const load = async (image: ArticleImage): Promise<string> => {
    if (image.status === 'missing') throw new Error('附件未找到');
    if (image.status === 'unsupported') throw new Error('图片地址或格式不支持');
    const key = image.status === 'external' || image.status === 'embedded' ? image.source : image.path;
    let cached = cache.get(key);
    if (!cached) {
      cached = (async () => {
        let binary: ImageBytes;
        if (image.status === 'embedded') {
          const match = image.source.match(/^data:(image\/[\w.+-]+);base64,([a-z0-9+/=\r\n]+)$/i);
          if (!match) throw new Error('内嵌图片数据无效');
          const buffer = Buffer.from(match[2], 'base64');
          binary = { bytes: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer };
        } else if (image.status === 'external') {
          if (!options.readRemote) throw new Error('无法读取网络图片');
          binary = await withTimeout(options.readRemote(image.source), 20000);
        } else binary = await options.readLocal(image);
        const mime = detectImageMime(binary.bytes);
        if (!mime) throw new Error('文件不是可识别的图片');
        bytesTotal += binary.bytes.byteLength;
        const data = options.normalize ? await options.normalize(binary.bytes, mime) : imageDataUrl(binary.bytes, mime);
        if (!/^data:image\/(?:png|jpeg|gif|webp|avif|bmp|svg\+xml);base64,[a-z0-9+/=]+$/i.test(data)) throw new Error('图片编码失败');
        return data;
      })();
      cache.set(key, cached);
    }
    return cached;
  };
  // Bounded concurrency, with one read/encoding per unique image per copy.
  let next = 0;
  const worker = async () => {
    while (next < result.images.length) {
      const index = next++; const image = result.images[index];
      try { encoded.set(index, await load(image)); }
      catch (error) { failures.push(`${image.alt || image.path}：${error instanceof Error ? error.message : String(error)}`); }
      completed++; options.progress?.(completed, result.images.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, result.images.length) }, () => worker()));
  if (failures.length) throw new ImageCopyError(failures);
  for (let index = 0; index < result.images.length; index++) {
    const image = root.querySelector<HTMLImageElement>(`img[data-wx-image="${index}"]`);
    if (!image || !encoded.has(index)) throw new ImageCopyError([`第 ${index + 1} 张图片的位置未能保留`]);
    image.setAttribute('src', encoded.get(index)!);
  }
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    for (const attr of Array.from(el.attributes)) if (attr.name.startsWith('data-') || attr.name === 'id' || attr.name === 'class') el.removeAttribute(attr.name);
  }
  if (Array.from(root.querySelectorAll('img')).some(img => !img.getAttribute('src')?.startsWith('data:image/'))) throw new ImageCopyError(['存在未嵌入的图片，请重新复制']);
  return { html: root.outerHTML, text: result.text, imageCount: result.images.length, bytes: bytesTotal };
}
