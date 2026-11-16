import fs from 'node:fs';
import path from 'node:path';
import {
  ensureDirs, ensureParent, indexPath, issueJsonPath, issuesDir,
} from './paths.js';

export function readJSON(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.warn(`[store] 读取失败 ${file}:`, e.message);
    return fallback;
  }
}

/** 原子写：先写 .tmp 再 rename，避免中途崩溃留下半截 JSON */
export function writeJSON(file, data) {
  ensureParent(file);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

export function writeText(file, text) {
  ensureParent(file);
  fs.writeFileSync(file, text, 'utf8');
}

export function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

/* ---------------- index.json ---------------- */

export function loadIndex() {
  ensureDirs();
  return readJSON(indexPath, { version: 1, latest: null, issues: [] });
}

export function saveIndex(idx) {
  idx.updatedAt = nowISO();
  writeJSON(indexPath, idx);
}

export function nowISO() {
  return new Date().toISOString();
}

export function todayStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/* ---------------- issue ---------------- */

export function loadIssue(id) {
  // 期号非法（例如 ..%2F..%2Fconfig%2Fsettings）时按「不存在」处理，避免穿越读文件
  try {
    return readJSON(issueJsonPath(id), null);
  } catch {
    return null;
  }
}

export function saveIssue(issue) {
  writeJSON(issueJsonPath(issue.id), issue);
}

export function deleteIssueFile(id) {
  const f = issueJsonPath(id);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

/** 用 issue 数据刷新索引条目 */
export function upsertIndexEntry(issue) {
  const idx = loadIndex();
  const entry = {
    id: issue.id,
    year: issue.year,
    issue: issue.issue,
    label: issue.label,
    publishDate: issue.publishDate,
    catalogUrl: issue.catalogUrl,
    articleCount: issue.articles?.length || 0,
    phase: issue.status?.phase || 'idle',
    hasSummary: Boolean(issue.summary),
    pdf: issue.exports?.[0]?.file || null,
    tokens: issue.status?.tokens || null,
    updatedAt: nowISO(),
  };
  const i = idx.issues.findIndex((x) => x.id === issue.id);
  if (i >= 0) idx.issues[i] = { ...idx.issues[i], ...entry };
  else idx.issues.push(entry);
  idx.issues.sort((a, b) => (b.year - a.year) || (b.issue - a.issue));
  saveIndex(idx);
  return entry;
}

export function setLatest(latest) {
  const idx = loadIndex();
  idx.latest = { ...latest, checkedAt: nowISO() };
  saveIndex(idx);
}

export function listIssues() {
  return loadIndex().issues;
}

/** 扫描 issues 目录（索引丢失时的兜底） */
export function scanIssueFiles() {
  ensureDirs();
  try {
    return fs.readdirSync(issuesDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => path.basename(f, '.json'));
  } catch {
    return [];
  }
}
