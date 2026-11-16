import fs from 'node:fs';
import { settingsPath, ensureDirs } from './lib/paths.js';

export const PORT = Number(process.env.PORT || 5178);

/** 监听地址：容器里通过 HOST=0.0.0.0 打开 */
export const HOST = process.env.HOST || '127.0.0.1';

/** 服务端自己回连用的地址（Chrome 打印 PDF 时访问 /print/:id）
 *  不能复用 HOST —— 0.0.0.0 在 Linux 上不可连接 */
export const SELF_URL = (process.env.SELF_URL || `http://127.0.0.1:${PORT}`).replace(/\/+$/, '');

/** 调试接口与原始 HTML 归档默认关闭 */
export const ENABLE_DEBUG = process.env.ENABLE_DEBUG === '1';
export const ENABLE_RAW = process.env.ENABLE_RAW === '1';

/** 求是网入口 */
export const SITE = {
  base: 'https://www.qstheory.cn',
  home: 'https://www.qstheory.cn/',
  archive: 'https://www.qstheory.cn/qs/mulu.htm',
};

export const DEFAULT_SETTINGS = {
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.3,
  concurrency: 3,
  minIntervalMs: 300,
  chromePath: '',
  maxInputChars: 12000,
  jsonMode: true,
};

/**
 * 环境变量覆盖层：存在即生效，且该字段被「锁定」——
 * 接口写不动它，避免部署后访客把服务端配置改掉。
 */
const ENV_PATCH = {
  apiKey: process.env.API_KEY,
  baseUrl: process.env.BASE_URL,
  model: process.env.MODEL,
  concurrency: process.env.CONCURRENCY,
  chromePath: process.env.CHROME_PATH,
};

export const LOCKED_FIELDS = Object.entries(ENV_PATCH)
  .filter(([, v]) => v !== undefined && v !== '')
  .map(([k]) => k);

/** 只读字段：允许读取展示，但不接受接口写入（防止远程指定可执行文件路径） */
const READONLY_FIELDS = ['chromePath'];

let cache = null;

function normalize(s) {
  const num = (v, dft) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : dft;
  };
  s.concurrency = clamp(num(s.concurrency, 3), 1, 8);
  s.minIntervalMs = clamp(num(s.minIntervalMs, 300), 0, 5000);
  s.temperature = clamp(num(s.temperature, 0.3), 0, 1.5);
  s.maxInputChars = clamp(num(s.maxInputChars, 12000), 2000, 40000);
  return s;
}

function applyEnv(base) {
  const next = { ...base };
  for (const k of LOCKED_FIELDS) next[k] = ENV_PATCH[k];
  return normalize(next);
}

export function loadSettings() {
  if (cache) return cache;
  ensureDirs();
  let saved = {};
  try {
    if (fs.existsSync(settingsPath)) {
      saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
  } catch (e) {
    console.warn('[settings] 读取失败，使用默认值：', e.message);
  }
  cache = applyEnv({ ...DEFAULT_SETTINGS, ...saved });
  return cache;
}

export function saveSettings(patch = {}) {
  ensureDirs();
  const cur = loadSettings();
  const next = { ...cur };
  const skipped = [];
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULT_SETTINGS)) continue;
    // 被环境变量锁定的字段，接口不允许改
    if (LOCKED_FIELDS.includes(k) || READONLY_FIELDS.includes(k)) { skipped.push(k); continue; }
    // 空字符串/空值表示不修改（尤其是 apiKey 掩码回填场景）
    if (v === '' || v === null || v === undefined) continue;
    next[k] = v;
  }
  cache = normalize(next);
  writeSettingsFile(cache);
  return { ...cache, skipped };
}

/** 原子写：先写 .tmp 再 rename，避免半截 JSON；失败时回退直写 */
function writeSettingsFile(data) {
  const tmp = `${settingsPath}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, settingsPath);
  } catch {
    fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2), 'utf8');
  }
  try {
    fs.chmodSync(settingsPath, 0o600);
  } catch {
    /* Windows 上可能不支持，忽略 */
  }
}

/** 对外返回时隐藏 Key，并告知哪些字段由环境变量提供 */
export function publicSettings() {
  const s = loadSettings();
  return { ...s, apiKey: maskKey(s.apiKey), hasKey: Boolean(s.apiKey), locked: [...LOCKED_FIELDS] };
}

export function maskKey(key) {
  if (!key) return '';
  if (key.length <= 10) return '*'.repeat(key.length);
  return `${key.slice(0, 4)}${'*'.repeat(8)}${key.slice(-4)}`;
}

export function redactKey(text) {
  const key = loadSettings().apiKey;
  if (!key || !text) return text;
  return String(text).split(key).join(maskKey(key));
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
