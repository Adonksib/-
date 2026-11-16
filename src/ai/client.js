import { redactKey } from '../config.js';

/** 归一化 baseUrl → chat/completions 端点 */
export function endpointOf(baseUrl) {
  let base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('未配置 API Base URL');
  if (/\/chat\/completions$/i.test(base)) return base;
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  return `${base}/chat/completions`;
}

export class ApiError extends Error {
  constructor(message, { status = 0, retryable = false, body = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryable = retryable;
    this.body = body;
  }
}

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 并发 + 最小间隔调度器 */
export class Limiter {
  constructor(concurrency = 3, minIntervalMs = 300) {
    this.concurrency = Math.max(1, concurrency);
    this.minIntervalMs = Math.max(0, minIntervalMs);
    this.running = 0;
    this.queue = [];
    this.lastStart = 0;
  }

  run(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.#pump();
    });
  }

  #pump() {
    if (this.running >= this.concurrency || !this.queue.length) return;
    const { task, resolve, reject } = this.queue.shift();
    this.running++;
    const wait = Math.max(0, this.lastStart + this.minIntervalMs - Date.now());
    this.lastStart = Date.now() + wait;
    sleep(wait)
      .then(task)
      .then(resolve, reject)
      .finally(() => {
        this.running--;
        this.#pump();
      });
  }
}

/**
 * 单次对话调用（非流式）
 * @returns {Promise<{content:string, usage:{prompt_tokens:number,completion_tokens:number}}>}
 */
export async function chat({
  messages, settings, maxTokens = 2400, temperature, jsonMode, timeoutMs = 180000, signal,
}) {
  const { apiKey, model, baseUrl } = settings;
  if (!apiKey) throw new ApiError('未配置 API Key，请到「设置」页填写', { status: 401 });

  const body = {
    model,
    messages,
    temperature: temperature ?? settings.temperature ?? 0.3,
    max_tokens: maxTokens,
    stream: false,
  };
  const useJson = jsonMode ?? settings.jsonMode ?? true;
  if (useJson) body.response_format = { type: 'json_object' };

  const url = endpointOf(baseUrl);
  let attempt = 0;
  let jsonDisabled = false;

  for (;;) {
    attempt++;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: signal || AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const isTimeout = e.name === 'TimeoutError' || e.name === 'AbortError';
      if (attempt <= 3 && !signal?.aborted) {
        await sleep([2000, 6000, 15000][attempt - 1] || 15000);
        continue;
      }
      throw new ApiError(isTimeout ? '模型请求超时' : `网络错误：${e.message}`, { retryable: true });
    }

    if (res.ok) {
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content ?? '';
      return {
        content,
        usage: {
          prompt_tokens: data?.usage?.prompt_tokens || 0,
          completion_tokens: data?.usage?.completion_tokens || 0,
        },
      };
    }

    const rawBody = await res.text().catch(() => '');
    const msg = extractErrorMessage(rawBody) || `HTTP ${res.status}`;

    // 400 且提示 response_format 不受支持 → 关闭 JSON 模式重试
    if (res.status === 400 && /response_format|json_object|json mode/i.test(rawBody) && !jsonDisabled) {
      jsonDisabled = true;
      delete body.response_format;
      attempt--;
      continue;
    }

    if (RETRYABLE_STATUS.has(res.status) && attempt <= 3) {
      await sleep([2000, 6000, 15000][attempt - 1] || 15000);
      continue;
    }

    const hint = {
      401: 'API Key 无效或已过期',
      403: 'API Key 无权访问该模型',
      404: '接口地址或模型名不存在，请检查 Base URL 与模型名',
      402: '账户余额不足',
      429: '请求过于频繁或额度用尽',
    }[res.status] || '';
    throw new ApiError(redactKey(`${hint ? `${hint}：` : ''}${msg}`), {
      status: res.status,
      retryable: RETRYABLE_STATUS.has(res.status),
      body: redactKey(rawBody.slice(0, 600)),
    });
  }
}

function extractErrorMessage(raw) {
  if (!raw) return '';
  try {
    const j = JSON.parse(raw);
    return j?.error?.message || j?.message || raw.slice(0, 200);
  } catch {
    return raw.replace(/<[^>]+>/g, ' ').slice(0, 200).trim();
  }
}

/** 从模型输出里抠出第一个平衡的 JSON 对象 */
export function extractJSON(text) {
  if (!text) return null;
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/** 常见格式问题修复：中文引号、尾逗号、单引号包裹 */
export function repairJSON(raw) {
  if (!raw) return null;
  let s = raw
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/([{,]\s*)'([^']*?)'(\s*:)/g, '$1"$2"$3');
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * 要求模型返回 JSON：json_object → 解析 → 修复 → 带错误回灌重试
 * @returns {Promise<{data:object, usage:object}>}
 */
export async function chatJSON({
  system, user, settings, maxTokens = 2600, temperature, label = '',
}) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: user });

  let usageTotal = { prompt_tokens: 0, completion_tokens: 0 };
  let lastErrMsg = '';

  for (let round = 0; round < 3; round++) {
    let out;
    try {
      out = await chat({ messages, settings, maxTokens, temperature });
    } catch (e) {
      if (e instanceof ApiError && !e.retryable) throw e;
      if (round === 2) throw e;
      lastErrMsg = e.message;
      await sleep(2000);
      continue;
    }
    usageTotal.prompt_tokens += out.usage.prompt_tokens;
    usageTotal.completion_tokens += out.usage.completion_tokens;

    const jsonText = extractJSON(out.content);
    if (jsonText) {
      try {
        return { data: JSON.parse(jsonText), usage: usageTotal };
      } catch {
        const repaired = repairJSON(jsonText);
        if (repaired) return { data: repaired, usage: usageTotal };
      }
    }
    lastErrMsg = '输出不是合法 JSON';
    messages.push({ role: 'assistant', content: out.content.slice(0, 2000) });
    messages.push({
      role: 'user',
      content: '上面的输出不是合法 JSON（解析错误）。请只输出一个合法的 JSON 对象，不要任何解释、不要 markdown 代码围栏，字符串内不要出现换行。',
    });
  }

  throw new ApiError(`${label ? `[${label}] ` : ''}模型未能返回合法 JSON：${lastErrMsg}`);
}

/** 连通性测试 */
export async function testConnection(settings) {
  const t0 = Date.now();
  const out = await chat({
    messages: [{ role: 'user', content: '回复一个 JSON：{"ok":true}' }],
    settings,
    maxTokens: 32,
    temperature: 0,
  });
  return { ok: true, latencyMs: Date.now() - t0, sample: out.content.slice(0, 80) };
}
