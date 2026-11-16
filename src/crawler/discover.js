import { fetchHtml } from '../lib/http.js';
import { rawPath } from '../lib/paths.js';
import { issueIdOf } from '../lib/paths.js';
import { SITE } from '../config.js';
import * as cheerio from 'cheerio';

const YEAR_LABEL_RE = /((?:19|20)\d{2})\s*年/;
const ISSUE_LABEL_RE = /((?:19|20)\d{2})\s*年第\s*(\d{1,2})\s*期/;

function dateFromUrl(url) {
  const m = String(url).match(/\/((?:19|20)\d{2})(\d{2})(\d{2})\//);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/** 往期总入口 → 各年度索引页 */
export async function listYearIndexes({ force = false } = {}) {
  const { html } = await fetchHtml(SITE.archive, {
    cachePath: rawPath('_index', 'archive.html'),
    force,
  });
  const $ = cheerio.load(html);
  const years = new Map();
  $('a[href]').each((_, a) => {
    const text = $(a).text().replace(/\s+/g, ' ').trim();
    const m = text.match(YEAR_LABEL_RE);
    if (!m) return;
    if (!/^\s*((?:19|20)\d{2})\s*年\s*$/.test(text)) return;
    let url;
    try { url = new URL($(a).attr('href'), SITE.archive).href; } catch { return; }
    if (!years.has(m[1])) years.set(m[1], url);
  });
  return [...years.entries()]
    .map(([year, url]) => ({ year: Number(year), url }))
    .sort((a, b) => b.year - a.year);
}

/** 年度索引页 → 该年全部期号 */
export async function listYearIssues(year, { force = false, url = null } = {}) {
  let indexUrl = url;
  if (!indexUrl) {
    const years = await listYearIndexes({ force });
    indexUrl = years.find((y) => y.year === Number(year))?.url;
  }
  if (!indexUrl) throw new Error(`未找到 ${year} 年的索引页`);

  const { html } = await fetchHtml(indexUrl, {
    cachePath: rawPath('_index', `${year}.html`),
    force,
  });
  const $ = cheerio.load(html);
  const list = [];
  const seen = new Set();
  $('a[href]').each((_, a) => {
    const text = $(a).text().replace(/\s+/g, ' ').trim();
    const m = text.match(ISSUE_LABEL_RE);
    if (!m || Number(m[1]) !== Number(year)) return;
    let href;
    try { href = new URL($(a).attr('href'), indexUrl).href; } catch { return; }
    if (seen.has(href)) return;
    seen.add(href);
    const issue = Number(m[2]);
    list.push({
      year: Number(year),
      issue,
      id: issueIdOf(Number(year), issue),
      label: `《求是》${year}年第${issue}期`,
      url: href,
      indexUrl,
      publishDate: dateFromUrl(href),
    });
  });
  list.sort((a, b) => b.issue - a.issue);
  return list;
}

/** 首页兜底：直接找「20xx年第N期」链接 */
async function fromHomepage({ force = false } = {}) {
  const { html } = await fetchHtml(SITE.home, {
    cachePath: rawPath('_index', 'home.html'),
    force,
  });
  const $ = cheerio.load(html);
  let best = null;
  $('a[href]').each((_, a) => {
    const text = $(a).text().replace(/\s+/g, ' ').trim();
    const m = text.match(ISSUE_LABEL_RE);
    if (!m) return;
    const issue = Number(m[2]);
    if (!best || issue > best.issue) {
      let href;
      try { href = new URL($(a).attr('href'), SITE.home).href; } catch { return; }
      best = {
        year: Number(m[1]),
        issue,
        id: issueIdOf(Number(m[1]), issue),
        label: `《求是》${m[1]}年第${issue}期`,
        url: href,
        publishDate: dateFromUrl(href),
      };
    }
  });
  return best;
}

/** 检测最新一期 */
export async function discoverLatest({ force = false } = {}) {
  const errors = [];
  try {
    const years = await listYearIndexes({ force });
    const latestYear = years[0]?.year;
    if (latestYear) {
      const issues = await listYearIssues(latestYear, { force, url: years[0].url });
      if (issues.length) {
        return { ...issues[0], source: 'year-index', checkedAt: new Date().toISOString() };
      }
    }
  } catch (e) {
    errors.push(`年度索引：${e.message}`);
  }
  try {
    const home = await fromHomepage({ force });
    if (home) return { ...home, source: 'homepage', checkedAt: new Date().toISOString() };
  } catch (e) {
    errors.push(`首页：${e.message}`);
  }
  throw new Error(`无法检测最新期号。${errors.join('；')}`);
}
