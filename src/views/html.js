/** 极简 HTML 视图工具：字符串模板，无引擎 */

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function nl2br(s) {
  return esc(s).replace(/\n/g, '<br>');
}

const PHASE_LABEL = {
  idle: '未生成',
  crawling: '抓取中',
  extracting: '提炼中',
  summarizing: '汇总中',
  crawled: '已抓取待提炼',
  done: '已完成',
  partial: '部分失败',
  error: '出错',
  canceled: '已取消',
};

export function phaseLabel(p) {
  return PHASE_LABEL[p] || p || '未生成';
}

export function phaseBadge(p) {
  return `<span class="badge badge-${esc(p || 'idle')}">${esc(phaseLabel(p))}</span>`;
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function page({ title, body, active = '', head = '', bodyClass = '' }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/assets/app.css">
<link rel="stylesheet" href="/assets/print.css" media="print">
${head}
</head>
<body class="${esc(bodyClass)}">
<header class="topbar no-print">
  <div class="wrap">
    <a class="brand" href="/"><span class="brand-mark">求是</span><span class="brand-text">备考重点提炼</span></a>
    <nav>
      <a href="/" class="${active === 'home' ? 'on' : ''}">首页</a>
      <a href="/settings" class="${active === 'settings' ? 'on' : ''}">设置</a>
    </nav>
  </div>
</header>
<main class="wrap">
${body}
</main>
<footer class="foot no-print">
  <div class="wrap">内容抓取自 <a href="https://www.qstheory.cn/" target="_blank" rel="noopener">求是网</a>，仅供个人学习使用 · 本机运行于 127.0.0.1</div>
</footer>
<script src="/assets/app.js"></script>
</body>
</html>`;
}

export function emptyState(text, hint = '') {
  return `<div class="empty"><p>${esc(text)}</p>${hint ? `<p class="hint">${esc(hint)}</p>` : ''}</div>`;
}
