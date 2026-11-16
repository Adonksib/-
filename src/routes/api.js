import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { PORT, loadSettings, saveSettings, publicSettings, SELF_URL, ENABLE_DEBUG } from '../config.js';
import { discoverLatest, listYearIssues } from '../crawler/discover.js';
import { runPipeline, retryFailed } from '../pipeline.js';
import { loadIssue, listIssues, setLatest, loadIndex, saveIssue, upsertIndexEntry, todayStamp } from '../lib/store.js';
import { createJob, getJob, runningJobId } from '../lib/jobs.js';
import { exportPdf, findBrowser } from '../lib/pdf.js';
import { testConnection } from '../ai/client.js';
import { exportsDir } from '../lib/paths.js';

export const apiRouter = express.Router();

let latestCache = { at: 0, data: null, error: null };

apiRouter.get('/health', (req, res) => {
  const browser = findBrowser();
  const s = loadSettings();
  res.json({
    ok: true,
    node: process.version,
    port: PORT,
    browser,
    settingsReady: Boolean(s.apiKey && s.baseUrl && s.model),
    model: s.model,
    baseUrl: s.baseUrl,
  });
});

apiRouter.get('/latest', async (req, res, next) => {
  try {
    const refresh = req.query.refresh === '1';
    const fresh = Date.now() - latestCache.at < 60 * 60 * 1000 && !refresh;
    if (!fresh || !latestCache.data) {
      try {
        latestCache = { at: Date.now(), data: await discoverLatest({ force: refresh }), error: null };
        setLatest(latestCache.data);
      } catch (e) {
        latestCache = { ...latestCache, error: e.message };
        if (!latestCache.data) throw e;
      }
    }
    const idx = loadIssuesSafe();
    const local = idx.find((i) => i.id === latestCache.data?.id);
    res.json({ latest: latestCache.data, local: local || null, error: latestCache.error });
  } catch (e) {
    next(e);
  }
});

function loadIssuesSafe() {
  try { return listIssues(); } catch { return []; }
}

apiRouter.get('/issues', (req, res) => {
  res.json({ issues: listIssues() });
});

apiRouter.get('/issues/:id', (req, res) => {
  const issue = loadIssue(req.params.id);
  if (!issue) return res.status(404).json({ error: '该期数据不存在' });
  if (req.query.full === '1') return res.json(issue);
  const slim = {
    ...issue,
    articles: issue.articles.map((a) => ({ ...a, blocks: undefined })),
  };
  res.json(slim);
});

apiRouter.post('/issues/:id/generate', (req, res) => {
  const id = req.params.id;
  const body = req.body || {};
  const { job, conflict } = createJob(id, body);
  if (conflict) {
    return res.status(409).json({ error: '该期已有任务在运行', jobId: job.id, conflict: true });
  }
  runPipeline(id, {
    force: Boolean(body.force),
    limit: Number(body.limit) || 0,
    skipSummary: Boolean(body.skipSummary),
    crawlOnly: Boolean(body.crawlOnly),
    emit: job.emit,
    shouldAbort: () => job.aborted,
  })
    .then(() => job.finish(null))
    .catch((e) => {
      job.finish(e);
      const issue = loadIssue(id);
      if (issue) {
        issue.status.phase = 'error';
        issue.status.error = e.message;
        saveIssue(issue);
        upsertIndexEntry(issue);
      }
    });
  res.json({ jobId: job.id, issueId: id });
});

apiRouter.get('/jobs/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: '任务不存在或已过期' });
  res.json(job.snapshot(Number(req.query.cursor) || 0));
});

apiRouter.post('/jobs/:jobId/cancel', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: '任务不存在' });
  job.cancel();
  res.json({ canceled: true });
});

apiRouter.post('/issues/:id/retry-failed', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = runningJobId(id);
    if (existing) return res.status(409).json({ error: '该期已有任务在运行', jobId: existing });
    const { job } = createJob(id, { retry: true });
    retryFailed(id, { emit: job.emit, shouldAbort: () => job.aborted })
      .then(() => job.finish(null))
      .catch((e) => job.finish(e));
    res.json({ jobId: job.id });
  } catch (e) {
    next(e);
  }
});

function pdfFileName(issue) {
  return `求是${issue.year}年第${issue.issue}期_备考重点_${todayStamp()}.pdf`;
}

apiRouter.post('/issues/:id/export', async (req, res, next) => {
  try {
    const issue = loadIssue(req.params.id);
    if (!issue) return res.status(404).json({ error: '该期数据不存在' });
    if (!issue.summary && !issue.articles.some((a) => a.ai)) {
      return res.status(400).json({ error: '还没有提炼结果，请先生成本期' });
    }
    const name = pdfFileName(issue);
    const outPath = path.join(exportsDir, name);
    const url = `${SELF_URL}/print/${issue.id}?pdf=1`;
    const result = await exportPdf({
      url,
      outPath,
      preferCDP: req.body?.cdp !== false,
    });
    issue.exports = [{
      file: `data/exports/${name}`,
      name,
      createdAt: new Date().toISOString(),
      bytes: result.bytes,
      engine: result.engine,
    }];
    saveIssue(issue);
    upsertIndexEntry(issue);
    res.json({
      file: `data/exports/${name}`,
      name,
      bytes: result.bytes,
      engine: result.engine,
      downloadUrl: `/api/issues/${issue.id}/pdf`,
    });
  } catch (e) {
    next(e);
  }
});

apiRouter.get('/issues/:id/pdf', (req, res) => {
  const issue = loadIssue(req.params.id);
  if (!issue) return res.status(404).json({ error: '该期数据不存在' });
  const name = pdfFileName(issue);
  const outPath = path.join(exportsDir, name);
  if (!fs.existsSync(outPath)) return res.status(404).json({ error: 'PDF 尚未生成，请先点「导出 PDF」' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="qstheory-${issue.id}.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
  );
  fs.createReadStream(outPath).pipe(res);
});

apiRouter.get('/settings', (req, res) => {
  res.json({ settings: publicSettings(), browser: findBrowser() });
});

/** 本机/内网地址前缀：防止把 Base URL 指向内网形成 SSRF，也防止 Key 被发往任意地址 */
const BLOCKED_HOST_RE = /^(localhost$|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

function validateBaseUrl(raw) {
  const text = String(raw).trim();
  let u;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw Object.assign(new Error('Base URL 格式不正确'), { status: 400 });
  }
  if (!/^https?:$/.test(u.protocol)) {
    throw Object.assign(new Error('Base URL 只支持 http/https'), { status: 400 });
  }
  if (BLOCKED_HOST_RE.test(u.hostname)) {
    throw Object.assign(new Error('Base URL 不允许指向本机或内网地址'), { status: 400 });
  }
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}

apiRouter.put('/settings', (req, res, next) => {
  try {
    const patch = { ...(req.body || {}) };
    if (patch.baseUrl) patch.baseUrl = validateBaseUrl(patch.baseUrl);
    const saved = saveSettings(patch);
    res.json({ ok: true, settings: publicSettings(), model: saved.model, skipped: saved.skipped || [] });
  } catch (e) {
    next(e);
  }
});

apiRouter.post('/settings/test', async (req, res) => {
  try {
    const s = loadSettings();
    if (!s.apiKey) return res.status(400).json({ ok: false, error: '还没有填写 API Key' });
    const r = await testConnection(s);
    res.json({ ok: true, ...r, model: s.model, baseUrl: s.baseUrl });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

/** 调试接口默认关闭，需要 ENABLE_DEBUG=1 才可用 */
apiRouter.use('/debug', (req, res, next) => {
  if (!ENABLE_DEBUG) return res.status(404).json({ error: '接口不存在' });
  next();
});

/** 手动触发一次期号扫描（调试用） */
apiRouter.get('/debug/year/:year', async (req, res, next) => {
  try {
    const issues = await listYearIssues(req.params.year, { force: req.query.refresh === '1' });
    res.json({ year: Number(req.params.year), count: issues.length, issues });
  } catch (e) {
    next(e);
  }
});

apiRouter.get('/debug/index', (req, res) => {
  res.json(loadIndex());
});
