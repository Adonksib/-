import { esc, page } from './html.js';

export function renderSettings({ settings, browser }) {
  const locked = new Set(settings.locked || []);
  const isLocked = (k) => locked.has(k);
  const lockTip = (k) => (isLocked(k) ? '<em class="locked-tip">由环境变量提供，此处不可修改</em>' : '');
  const dis = (k) => (isLocked(k) ? ' disabled' : '');

  const body = `<section class="issue-head">
    <h1>设置</h1>
    <p class="muted">配置保存在服务端 <span class="mono">config/settings.json</span>（容器里可用环境变量覆盖），不会上传到任何第三方。</p>
  </section>

  <form class="panel form" id="settings-form">
    <div class="panel-head"><h2>大模型接口</h2><span class="muted small">兼容 OpenAI 的 /chat/completions</span></div>

    <label class="field">
      <span>Base URL</span>
      <input name="baseUrl" value="${esc(settings.baseUrl)}" placeholder="https://api.deepseek.com"${dis('baseUrl')}>
      ${lockTip('baseUrl')}
      <em>常见：DeepSeek <span class="mono">https://api.deepseek.com</span>；通义 <span class="mono">https://dashscope.aliyuncs.com/compatible-mode/v1</span>；Kimi <span class="mono">https://api.moonshot.cn/v1</span></em>
    </label>

    <label class="field">
      <span>API Key</span>
      <input name="apiKey" type="password" autocomplete="off" placeholder="${settings.hasKey ? esc(settings.apiKey) : 'sk-...'}" value=""${dis('apiKey')}>
      ${lockTip('apiKey')}
      <em>${settings.hasKey ? '已保存。留空表示不修改；填入新值则覆盖。' : '尚未配置，生成前需要填写。'}</em>
    </label>

    <label class="field">
      <span>模型名</span>
      <input name="model" value="${esc(settings.model)}" placeholder="deepseek-chat"${dis('model')}>
      ${lockTip('model')}
      <em>DeepSeek 用 <span class="mono">deepseek-chat</span>；通义用 <span class="mono">qwen-plus</span> 等</em>
    </label>

    <div class="field-row">
      <label class="field">
        <span>并发数</span>
        <input name="concurrency" type="number" min="1" max="8" value="${esc(settings.concurrency)}"${dis('concurrency')}>
        ${lockTip('concurrency')}
        <em>建议 2–4，太大易被限流</em>
      </label>
      <label class="field">
        <span>请求间隔（毫秒）</span>
        <input name="minIntervalMs" type="number" min="0" max="5000" step="50" value="${esc(settings.minIntervalMs)}">
        <em>两次调用之间的最小间隔</em>
      </label>
      <label class="field">
        <span>温度</span>
        <input name="temperature" type="number" min="0" max="1.5" step="0.1" value="${esc(settings.temperature)}">
        <em>提炼建议 0.2–0.4</em>
      </label>
    </div>

    <div class="panel-head"><h2>PDF 导出</h2></div>
    <div class="field">
      <span>浏览器</span>
      <div class="readonly-line">${browser
        ? `${esc(browser.name)} · <span class="mono">${esc(browser.path)}</span>`
        : '未找到可用浏览器。容器部署请设置环境变量 <span class="mono">CHROME_PATH=/usr/bin/chromium</span>'}</div>
      <em>出于安全考虑，浏览器路径不再允许通过网页修改；本机部署可用 <span class="mono">CHROME_PATH</span> 环境变量指定。</em>
    </div>

    <div class="form-actions">
      <button type="submit" class="btn btn-primary">保存设置</button>
      <button type="button" class="btn" id="btn-test">测试连接</button>
      <span id="form-msg" class="form-msg"></span>
    </div>
  </form>

  <section class="panel panel-quiet">
    <div class="panel-head"><h2>说明</h2></div>
    <ul class="bullets">
      <li>API Key 以明文保存在服务端配置文件 <span class="mono">config/settings.json</span>（该文件已被 <span class="mono">.gitignore</span> 排除，不会进仓库）；容器部署建议改用 <span class="mono">API_KEY</span> 环境变量注入。</li>
      <li>提炼时会先抓取原文并落盘，重跑不会重复请求求是网；只有模型调用会产生费用，单期约 ¥0.2–0.5。</li>
      <li>金句必须逐字来自原文，校验不通过的会在网页标为灰色「未校验」，导出 PDF 时自动剔除。</li>
    </ul>
  </section>`;

  return page({ title: '设置 · 求是备考', body, active: 'settings' });
}
