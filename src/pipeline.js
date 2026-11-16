import { discoverLatest } from './crawler/discover.js';
import { parseCatalog } from './crawler/catalog.js';
import { parseArticle } from './crawler/article.js';
import { fetchHtml, fetchBinary, extOf, sleep, jitter } from './lib/http.js';
import { rawPath, textPath, mediaPath } from './lib/paths.js';
import {
  loadIssue, saveIssue, upsertIndexEntry, setLatest, readText, writeText, nowISO,
} from './lib/store.js';
import { loadSettings } from './config.js';
import { extractArticle } from './ai/extract.js';
import { buildSummary } from './ai/summarize.js';
import { Limiter } from './ai/client.js';

const COST = { inputPerM: 2, outputPerM: 8 }; // DeepSeek 价位参考（元/百万 tokens）

function pad3(n) {
  return String(n).padStart(3, '0');
}

function emptyProgress(total = 0) {
  return { total, crawled: 0, extracted: 0, failed: 0 };
}

/** 建/读期数据骨架 */
export async function ensureIssueShell(issueId, { emit = () => {} } = {}) {
  let issue = loadIssue(issueId);
  if (issue) return issue;

  const latest = await discoverLatest();
  if (latest.id !== issueId) {
    const years = { year: Number(issueId.split('-')[0]), issue: Number(issueId.split('-')[1]) };
    issue = {
      id: issueId,
      year: years.year,
      issue: years.issue,
      label: `《求是》${years.year}年第${years.issue}期`,
      catalogUrl: '',
      publishDate: '',
      fetchedAt: nowISO(),
      status: { phase: 'idle', progress: emptyProgress(), model: loadSettings().model },
      articles: [],
      summary: null,
      exports: [],
    };
    emit('init', `新建期数据 ${issue.label}，但未在站点找到对应目录页，请检查期号`, { level: 'warn' });
    saveIssue(issue);
    return issue;
  }

  issue = {
    id: issueId,
    year: latest.year,
    issue: latest.issue,
    label: latest.label,
    catalogUrl: latest.url,
    publishDate: latest.publishDate,
    fetchedAt: nowISO(),
    status: {
      phase: 'idle',
      progress: emptyProgress(),
      currentArticle: null,
      model: loadSettings().model,
      tokens: { prompt: 0, completion: 0 },
      costEstimateCny: 0,
      startedAt: null,
      finishedAt: null,
      error: null,
    },
    articles: [],
    summary: null,
    exports: [],
  };
  saveIssue(issue);
  upsertIndexEntry(issue);
  return issue;
}

/** 抓目录 */
async function crawlCatalog(issue, { force, emit }) {
  emit('crawling', `抓取期目录：${issue.catalogUrl}`);
  const { html, fromCache } = await fetchHtml(issue.catalogUrl, {
    cachePath: rawPath(issue.id, 'catalog.html'),
    force,
  });
  if (fromCache) emit('crawling', '使用已缓存的目录页');
  const items = parseCatalog(html, issue.catalogUrl);
  if (!items.length) throw new Error('目录解析为空，页面结构可能已变更（原始 HTML 已留档）');

  issue.articles = items.map((it) => ({
    id: pad3(it.index),
    index: it.index,
    column: it.column,
    tag: it.tag,
    kind: it.kind,
    title: it.title,
    author: it.author,
    source: '',
    pubtime: '',
    url: it.url,
    rawFile: `data/raw/${issue.id}/${pad3(it.index)}.html`,
    textFile: `data/text/${issue.id}/${pad3(it.index)}.txt`,
    charCount: 0,
    isKey: /习近平/.test(it.author) || /中央|决定|全会|报告/.test(it.title),
    images: [],
    note: '',
    state: { crawl: 'pending', extract: 'pending', attempts: 0, error: null, updatedAt: nowISO() },
    ai: null,
  }));
  issue.status.progress = emptyProgress(issue.articles.length);
  saveIssue(issue);
  emit('crawling', `目录解析完成：${issue.articles.length} 条`);
}

/** 抓单篇正文 + 图片 */
async function crawlOne(issue, article, { force }) {
  const { html } = await fetchHtml(article.url, {
    cachePath: rawPath(issue.id, `${article.id}.html`),
    force,
  });
  const parsed = parseArticle(html, article.url, { title: article.title });

  article.title = parsed.title || article.title;
  article.author = parsed.author || article.author;
  article.source = parsed.source || article.source;
  article.pubtime = parsed.pubtime || '';
  article.charCount = parsed.charCount;
  article.note = parsed.note || '';
  article.parseMode = parsed.parseMode;

  writeText(textPath(issue.id, `${article.id}.txt`), parsed.text);

  // 图片落盘（图表页必须）
  const images = [];
  for (let i = 0; i < parsed.images.length; i++) {
    const im = parsed.images[i];
    const ext = extOf(im.src);
    const file = `${article.id}-${i + 1}${ext}`;
    const local = mediaPath(issue.id, file);
    try {
      const r = await fetchBinary(im.src, local, { referer: article.url });
      if (r.skipped) continue;
      images.push({
        src: im.src,
        local: `data/media/${issue.id}/${file}`,
        url: `/media/${issue.id}/${file}`,
        caption: im.caption || im.alt || '',
      });
    } catch (e) {
      // 图片失败不影响正文
    }
  }
  article.images = images;
  article.state.crawl = 'done';
  article.state.updatedAt = nowISO();
}

function syncProgress(issue) {
  const p = emptyProgress(issue.articles.length);
  p.crawled = issue.articles.filter((a) => a.state.crawl === 'done').length;
  p.extracted = issue.articles.filter((a) => a.state.extract === 'done').length;
  p.failed = issue.articles.filter((a) => a.state.crawl === 'failed' || a.state.extract === 'failed').length;
  issue.status.progress = p;
  return p;
}

/**
 * 主流水线
 * @param {string} issueId 2026-22
 */
export async function runPipeline(issueId, {
  force = false, limit = 0, skipSummary = false, crawlOnly = false,
  emit = () => {}, shouldAbort = () => false,
} = {}) {
  const settings = loadSettings();
  const issue = await ensureIssueShell(issueId, { emit });
  issue.status.startedAt = issue.status.startedAt || nowISO();
  issue.status.error = null;
  issue.status.model = settings.model;
  issue.fetchedAt = nowISO();
  syncProgress(issue);
  saveIssue(issue);
  upsertIndexEntry(issue);

  // 1) 目录
  if (!issue.articles.length || force) {
    issue.status.phase = 'crawling';
    emit('crawling', '开始抓取目录', { progress: issue.status.progress });
    await crawlCatalog(issue, { force, emit });
  }

  // 2) 正文（串行 + 随机间隔）
  issue.status.phase = 'crawling';
  emit('crawling', `开始抓取正文（共 ${issue.articles.length} 条）`, { progress: syncProgress(issue) });
  for (const a of issue.articles) {
    if (shouldAbort()) { emit('canceled', '任务已取消', { level: 'warn' }); break; }
    if (a.state.crawl === 'done' && !force) continue;
    emit('crawling', `抓取 ${a.id} ${a.title}`, { currentArticle: `${a.id} ${a.title}` });
    try {
      await crawlOne(issue, a, { force });
      saveIssue(issue);
    } catch (e) {
      a.state.crawl = 'failed';
      a.state.error = e.message;
      a.state.updatedAt = nowISO();
      saveIssue(issue);
      emit('crawling', `✗ ${a.id} ${a.title}：${e.message}`, { level: 'error' });
    }
    const p = syncProgress(issue);
    emit('crawling', null, { progress: p });
    if (!shouldAbort()) await sleep(jitter(1000, 500));
  }

  // 3) 逐篇提炼（并发）
  issue.status.phase = 'extracting';
  const pending = crawlOnly ? [] : issue.articles
    .filter((a) => a.state.crawl === 'done' && (force || a.state.extract !== 'done'))
    .slice(0, limit > 0 ? limit : undefined);

  emit('extracting', `待提炼 ${pending.length} 篇，并发 ${settings.concurrency}`, {
    progress: syncProgress(issue),
  });

  const limiter = new Limiter(settings.concurrency, settings.minIntervalMs);
  let tokens = { prompt: 0, completion: 0 };

  await Promise.all(pending.map((a) => limiter.run(async () => {
    if (shouldAbort()) return;
    a.state.extract = 'running';
    a.state.attempts = (a.state.attempts || 0) + 1;
    a.state.updatedAt = nowISO();
    emit('extracting', `提炼 ${a.id} ${a.title}`, { currentArticle: `${a.id} ${a.title}` });
    try {
      const text = readText(textPath(issue.id, `${a.id}.txt`));
      const ai = await extractArticle(
        { ...a, text },
        settings,
        {
          onUsage: (u) => {
            tokens.prompt += u.prompt_tokens || 0;
            tokens.completion += u.completion_tokens || 0;
          },
        },
      );
      a.ai = ai;
      a.state.extract = 'done';
      a.state.error = null;
      emit('extracting', `✓ ${a.id} 完成（金句校验 ${Math.round((ai.verification?.rate ?? 1) * 100)}%）`);
    } catch (e) {
      a.state.extract = 'failed';
      a.state.error = String(e.message || e);
      emit('extracting', `✗ ${a.id} 提炼失败：${e.message}`, { level: 'error' });
    }
    a.state.updatedAt = nowISO();
    issue.status.tokens = { ...tokens };
    issue.status.costEstimateCny = Number(
      ((tokens.prompt / 1e6) * COST.inputPerM + (tokens.completion / 1e6) * COST.outputPerM).toFixed(3),
    );
    saveIssue(issue);
    emit('extracting', null, { progress: syncProgress(issue) });
  })));

  // 4) 汇总
  const anyExtracted = issue.articles.some((a) => a.ai?.oneline);
  if (!skipSummary && anyExtracted && !shouldAbort()) {
    issue.status.phase = 'summarizing';
    emit('summarizing', '生成本期汇总与考法预测…');
    try {
      // 汇总需要原文做金句复核，从磁盘读回
      const withTexts = {
        ...issue,
        articles: issue.articles.map((a) => ({ ...a, text: readText(textPath(issue.id, `${a.id}.txt`)) })),
      };
      const summary = await buildSummary(withTexts, settings);
      issue.summary = summary;
      issue.status.tokens = {
        prompt: tokens.prompt + (summary.usage?.prompt_tokens || 0),
        completion: tokens.completion + (summary.usage?.completion_tokens || 0),
      };
      issue.status.costEstimateCny = Number((
        (issue.status.tokens.prompt / 1e6) * COST.inputPerM
        + (issue.status.tokens.completion / 1e6) * COST.outputPerM
      ).toFixed(3));
      emit('summarizing', `汇总完成，背诵清单 ${summary.reciteTop10.length} 条（已校验 ${summary.quality.reciteVerified} 条）`);
    } catch (e) {
      emit('summarizing', `汇总失败：${e.message}`, { level: 'error' });
      issue.status.error = `汇总失败：${e.message}`;
    }
  }

  // 5) 收尾
  const p = syncProgress(issue);
  const failed = issue.articles.filter((a) => a.state.crawl === 'failed' || a.state.extract === 'failed').length;
  issue.status.phase = crawlOnly ? 'crawled' : (failed > 0 ? 'partial' : 'done');
  issue.status.finishedAt = nowISO();
  issue.status.progress = p;
  saveIssue(issue);
  upsertIndexEntry(issue);
  setLatest({ id: issue.id, label: issue.label, publishDate: issue.publishDate, url: issue.catalogUrl });

  emit(issue.status.phase, `完成：${p.extracted}/${p.crawled} 篇提炼成功${failed ? `，${failed} 篇失败` : ''}`, { progress: p });
  return issue;
}

/** 只重跑失败篇 */
export async function retryFailed(issueId, opts = {}) {
  const issue = loadIssue(issueId);
  if (!issue) throw new Error('该期数据不存在');
  const failed = issue.articles.filter((a) => a.state.crawl === 'failed' || a.state.extract === 'failed');
  if (!failed.length) return { retried: 0 };
  failed.forEach((a) => {
    if (a.state.crawl === 'failed') a.state.crawl = 'pending';
    a.state.extract = 'pending';
  });
  saveIssue(issue);
  await runPipeline(issueId, opts);
  return { retried: failed.length };
}

export { pad3, emptyProgress };
