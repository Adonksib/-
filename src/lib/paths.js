import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 项目根目录（src/lib 的上两级）。代码目录，容器里通常只读 */
export const ROOT = path.resolve(__dirname, '..', '..');

const envDir = (name, fallback) => (process.env[name] ? path.resolve(process.env[name]) : fallback);

/** 可写数据根：容器里挂卷到 /app/data，或通过 DATA_DIR 指到任意可写盘 */
export const dataDir = envDir('DATA_DIR', path.join(ROOT, 'data'));
export const issuesDir = path.join(dataDir, 'issues');
export const rawDir = path.join(dataDir, 'raw');
export const textDir = path.join(dataDir, 'text');
export const mediaDir = path.join(dataDir, 'media');
export const exportsDir = path.join(dataDir, 'exports');
export const logsDir = envDir('LOGS_DIR', path.join(ROOT, 'logs'));
export const configDir = envDir('CONFIG_DIR', path.join(ROOT, 'config'));
export const publicDir = path.join(ROOT, 'public');

export const settingsPath = path.join(configDir, 'settings.json');
export const indexPath = path.join(dataDir, 'index.json');

/** 期号 id：2026-22（内部文件名一律 ASCII，且必须匹配此格式） */
const ISSUE_ID_RE = /^\d{4}-\d{1,2}$/;

export function issueIdOf(year, issue) {
  return `${year}-${issue}`;
}

/**
 * 校验期号并返回 JSON 路径。
 * 双保险：先白名单正则，再 resolve 后确认落在 issuesDir 内，
 * 防止 `..%2F..%2Fconfig%2Fsettings` 这类穿越读走配置文件。
 */
export function issueJsonPath(id) {
  if (typeof id !== 'string' || !ISSUE_ID_RE.test(id)) {
    const err = new Error(`非法期号：${id}`);
    err.code = 'BAD_ISSUE_ID';
    err.status = 404;
    throw err;
  }
  const base = path.resolve(issuesDir);
  const full = path.resolve(base, `${id}.json`);
  if (path.dirname(full) !== base || path.basename(full) !== `${id}.json`) {
    const err = new Error('非法期号路径');
    err.code = 'BAD_ISSUE_ID';
    err.status = 404;
    throw err;
  }
  return full;
}

export function rawPath(id, file) {
  return path.join(rawDir, id, file);
}

export function textPath(id, file) {
  return path.join(textDir, id, file);
}

export function mediaPath(id, file) {
  return path.join(mediaDir, id, file);
}

export function exportPath(file) {
  return path.join(exportsDir, file);
}

/** 归档目录（不含文件名），用于 express.static */
export const staticRawDir = rawDir;
export const staticMediaDir = mediaDir;

export function ensureDirs() {
  for (const d of [dataDir, issuesDir, rawDir, textDir, mediaDir, exportsDir, logsDir, configDir]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

export function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}
