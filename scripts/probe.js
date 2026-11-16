/**
 * 环节自检脚本：探测最新期 → 解析目录 → 抓一篇正文看清洗效果
 * 用法：node scripts/probe.js [文章序号]
 */
import { discoverLatest } from '../src/crawler/discover.js';
import { parseCatalog } from '../src/crawler/catalog.js';
import { parseArticle } from '../src/crawler/article.js';
import { fetchHtml } from '../src/lib/http.js';
import { rawPath } from '../src/lib/paths.js';

const arg = Number(process.argv[2] || 2);

const latest = await discoverLatest({ force: true });
console.log('最新期：', latest.label, latest.id, latest.publishDate);
console.log('目录页：', latest.url);

const { html: catalogHtml } = await fetchHtml(latest.url, {
  cachePath: rawPath(latest.id, 'catalog.html'),
  force: true,
});
const items = parseCatalog(catalogHtml, latest.url);
console.log(`目录条目：${items.length} 条`);
for (const it of items) {
  console.log(`  ${String(it.index).padStart(2, '0')} [${it.column || '-'}|${it.tag || '-'}|${it.kind}] ${it.title} /${it.author}`);
}

const target = items.find((x) => x.index === arg) || items[1];
console.log('\n--- 抓取正文 ---');
console.log(target.title, target.url);
const { html } = await fetchHtml(target.url, { cachePath: rawPath(latest.id, `${String(arg).padStart(3, '0')}.html`), force: true });
const art = parseArticle(html, target.url, { title: target.title });
console.log('字数：', art.charCount, '｜作者：', art.author, '｜来源：', art.source, '｜时间：', art.pubtime);
console.log('说明：', art.note || '(无)');
console.log('图片：', art.images.length);
console.log('解析模式：', art.parseMode);
console.log('--- 前 8 块 ---');
art.blocks.slice(0, 8).forEach((b) => console.log(`[${b.type}] ${(b.text || b.src || '').slice(0, 80)}`));
console.log('--- 最后 5 块 ---');
art.blocks.slice(-5).forEach((b) => console.log(`[${b.type}] ${(b.text || b.src || '').slice(0, 80)}`));
