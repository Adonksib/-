import express from 'express';
import { discoverLatest } from '../crawler/discover.js';
import { loadIssue, listIssues, setLatest, loadIndex } from '../lib/store.js';
import { publicSettings } from '../config.js';
import { findBrowser } from '../lib/pdf.js';
import { renderHome } from '../views/home.js';
import { renderIssue } from '../views/issue.js';
import { renderSettings } from '../views/settings.js';
import { renderPrint } from '../views/print.js';
import { esc } from '../views/html.js';

export const pagesRouter = express.Router();

let cache = { at: 0, data: null };

async function getLatest({ force = false } = {}) {
  if (!force && cache.data && Date.now() - cache.at < 30 * 60 * 1000) return cache.data;
  try {
    const latest = await discoverLatest({ force });
    cache = { at: Date.now(), data: latest };
    setLatest(latest);
    return latest;
  } catch (e) {
    if (cache.data) return cache.data;
    const idx = loadIndex();
    if (idx.latest?.id) return idx.latest;
    throw e;
  }
}

pagesRouter.get('/', async (req, res) => {
  let latest = null;
  let latestError = '';
  try {
    latest = await getLatest({ force: req.query.refresh === '1' });
  } catch (e) {
    latestError = e.message;
  }
  res.type('html').send(renderHome({
    latest,
    latestError,
    issues: listIssues(),
    settings: publicSettings(),
  }));
});

pagesRouter.get('/issue/:id', (req, res) => {
  const issue = loadIssue(req.params.id);
  if (!issue) {
    return res.status(404).type('html').send(
      `<meta charset="utf-8"><p style="font-family:system-ui;padding:40px">没有找到 ${esc(req.params.id)} 的数据。<a href="/">返回首页</a></p>`,
    );
  }
  res.type('html').send(renderIssue({ issue }));
});

pagesRouter.get('/settings', (req, res) => {
  res.type('html').send(renderSettings({ settings: publicSettings(), browser: findBrowser() }));
});

pagesRouter.get('/print/:id', (req, res) => {
  const issue = loadIssue(req.params.id);
  if (!issue) return res.status(404).type('html').send('<meta charset="utf-8"><p>没有该期数据</p>');
  res.type('html').send(renderPrint({ issue, only: req.query.only || '' }));
});
