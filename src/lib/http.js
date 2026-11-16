import fs from 'node:fs';
import { ensureParent } from '../lib/paths.js';

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const BASE_HEADERS = {
  'User-Agent': UA,
  'Accept-Language': 'zh-CN,zh;q=0.9',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 编码嗅探：先 UTF-8 严格解码，失败退 gb18030 */
export function decodeBuffer(buf, contentType = '') {
  const lower = String(contentType).toLowerCase();
  if (lower.includes('gb2312') || lower.includes('gbk') || lower.includes('gb18030')) {
    try {
      return new TextDecoder('gb18030').decode(buf);
    } catch { /* 继续按 utf-8 尝试 */ }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder('gb18030').decode(buf);
    } catch {
      return buf.toString('utf8');
    }
  }
}

class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export { HttpError };

/**
 * 抓取 HTML，支持磁盘缓存 + 指数退避重试。
 * @returns {Promise<{html:string, fromCache:boolean}>}
 */
export async function fetchHtml(url, {
  referer = '', timeoutMs = 25000, retries = 3, cachePath = null, force = false,
} = {}) {
  if (cachePath && !force && fs.existsSync(cachePath)) {
    const html = fs.readFileSync(cachePath, 'utf8');
    if (html && html.length > 500) return { html, fromCache: true };
  }

  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { ...BASE_HEADERS, ...(referer ? { Referer: referer } : {}) },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        throw new HttpError(`HTTP ${res.status} ${url}`, res.status);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const html = decodeBuffer(buf, res.headers.get('content-type') || '');
      if (cachePath) {
        ensureParent(cachePath);
        fs.writeFileSync(cachePath, html, 'utf8');
      }
      return { html, fromCache: false };
    } catch (e) {
      lastErr = e;
      const status = e?.status;
      // 4xx（除 429）不重试
      if (status && status >= 400 && status < 500 && status !== 429) break;
      if (attempt === retries) break;
      await sleep(1000 * 2 ** attempt + Math.random() * 300);
    }
  }
  throw lastErr || new Error(`抓取失败：${url}`);
}

/** 下载二进制文件（图片），已存在则跳过 */
export async function fetchBinary(url, outPath, {
  referer = '', timeoutMs = 30000, maxBytes = 3 * 1024 * 1024,
} = {}) {
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 512) {
    return { bytes: fs.statSync(outPath).size, fromCache: true };
  }
  const res = await fetch(url, {
    headers: { ...BASE_HEADERS, ...(referer ? { Referer: referer } : {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new HttpError(`图片 HTTP ${res.status}`, res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) return { bytes: 0, skipped: true };
  ensureParent(outPath);
  fs.writeFileSync(outPath, buf);
  return { bytes: buf.length, fromCache: false };
}

export function extOf(url, contentType = '') {
  const m = String(url).match(/\.(jpe?g|png|gif|webp|bmp)(?:[?#]|$)/i);
  if (m) return `.${m[1].toLowerCase().replace('jpeg', 'jpg')}`;
  const ct = String(contentType).toLowerCase();
  if (ct.includes('png')) return '.png';
  if (ct.includes('gif')) return '.gif';
  if (ct.includes('webp')) return '.webp';
  return '.jpg';
}

export const jitter = (base = 1000, spread = 500) => base + Math.random() * spread;
