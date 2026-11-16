import * as cheerio from 'cheerio';
import { cleanBlocks, normalizeInline } from './clean.js';

/** 递归遍历节点，产出 p/img 顺序块 */
function walk(node, $, out) {
  const children = $(node).contents().toArray();
  for (const child of children) {
    if (child.type === 'tag') {
      const tag = child.name.toLowerCase();
      if (tag === 'script' || tag === 'style') continue;
      if (tag === 'img') {
        const src = $(child).attr('src') || $(child).attr('data-src') || '';
        const alt = $(child).attr('alt') || $(child).attr('title') || '';
        if (src) out.push({ type: 'img', src: src.trim(), alt: normalizeInline(alt) });
        continue;
      }
      if (tag === 'p' || tag === 'div' || /^h[1-6]$/.test(tag)) {
        const directText = $(child).clone().children().remove().end().text();
        const hasBlockChild = $(child).children('p,div,img,table,ul,ol,blockquote').length > 0;
        const text = normalizeInline(directText);
        if (text) out.push({ type: 'p', text });
        if (hasBlockChild) walk(child, $, out);
        continue;
      }
      if (tag === 'br') continue;
      const text = normalizeInline($(child).text());
      if (text) out.push({ type: 'p', text });
    } else if (child.type === 'text') {
      const text = normalizeInline(child.data);
      if (text) out.push({ type: 'p', text });
    }
  }
}

function parseMeta($) {
  // 注意：来源与作者是两个并列的 span.appellation，必须合并取文本
  const appellationRaw = $('.appellation').toArray()
    .map((el) => $(el).text())
    .join('\n');
  const lines = appellationRaw.split('\n').map((s) => normalizeInline(s)).filter(Boolean);
  let source = '';
  let author = '';
  for (const line of lines) {
    const s = line.match(/来源[:：]\s*(.+)/);
    if (s) source = s[1].trim();
    const a = line.match(/作者[:：]\s*(.+)/);
    if (a) author = a[1].trim();
  }
  const pubtime = normalizeInline($('.pubtime').first().text());
  const pageTitle = normalizeInline($('h1').first().text() || $('title').first().text());
  return { source, author, pubtime, pageTitle };
}

/**
 * 解析文章页
 * @returns {{title,author,source,pubtime,blocks,note,text,charCount,images,parseMode}}
 */
export function parseArticle(html, url, { title: fallbackTitle = '' } = {}) {
  const $ = cheerio.load(html);
  const meta = parseMeta($);

  // 正文容器三层降级
  let $root = $('#detailContent');
  let parseMode = 'detailContent';
  if (!$root.length) { $root = $('#detail'); parseMode = 'detail'; }
  if (!$root.length) { $root = $('.text'); parseMode = 'text'; }
  if (!$root.length) {
    throw Object.assign(new Error('PARSE_EMPTY：未找到正文容器，页面结构可能已变更'), { code: 'PARSE_EMPTY' });
  }

  const rawBlocks = [];
  walk($root.get(0), $, rawBlocks);

  const title = fallbackTitle || meta.pageTitle;
  const cleaned = cleanBlocks(rawBlocks.filter((b) => b.type !== 'p' || b.text), { title });

  // 图片：配对紧随其后的图注
  const images = [];
  cleaned.blocks.forEach((b, i) => {
    if (b.type !== 'img') return;
    const next = cleaned.blocks[i + 1];
    let src = b.src;
    try { src = new URL(src, url).href; } catch { /* 保留原值 */ }
    images.push({
      src,
      alt: b.alt || '',
      caption: next && next.type === 'caption' ? next.text : '',
    });
  });

  // 统计图表页是纯图片，正文几乎没有文字，属于正常情况
  if (cleaned.charCount < 60 && images.length === 0) {
    throw Object.assign(
      new Error(`PARSE_EMPTY：正文仅 ${cleaned.charCount} 字，页面结构可能已变更`),
      { code: 'PARSE_EMPTY' },
    );
  }

  const text = cleaned.text || [title, ...images.map((im) => (im.caption || im.alt))].filter(Boolean).join('\n');

  return {
    title,
    author: meta.author,
    source: meta.source,
    pubtime: meta.pubtime,
    blocks: cleaned.blocks,
    note: cleaned.note,
    text,
    charCount: cleaned.charCount,
    images,
    parseMode,
  };
}
