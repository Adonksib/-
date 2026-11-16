import {
  esc, page, phaseBadge, fmtDate, emptyState,
} from './html.js';

export function renderHome({ latest, latestError, issues, settings }) {
  const latestId = latest?.id || '';
  const localIssue = issues.find((i) => i.id === latestId);
  const keyReady = Boolean(settings.hasKey);

  const hero = latest
    ? `<section class="hero">
        <div class="hero-main">
          <div class="kicker">当前最新一期</div>
          <h1>${esc(latest.label)}</h1>
          <div class="hero-meta">
            <span>上线 ${esc(latest.publishDate || '—')}</span>
            <span>检测时间 ${esc(fmtDate(latest.checkedAt))}</span>
            ${localIssue ? `<span>本地已存 ${localIssue.articleCount} 条</span>` : '<span class="warn">本地尚未抓取</span>'}
            ${phaseBadge(localIssue?.phase || 'idle')}
          </div>
        </div>
        <div class="hero-actions">
          ${localIssue && localIssue.phase === 'done'
    ? `<a class="btn btn-primary" href="/issue/${esc(latestId)}">查看重点</a>`
    : `<button class="btn btn-primary" data-generate="${esc(latestId)}">生成本期</button>`}
          ${localIssue ? `<a class="btn" href="/issue/${esc(latestId)}">详情</a>` : ''}
          <button class="btn" data-redetect="1">重新检测</button>
        </div>
      </section>
      ${keyReady ? '' : `<div class="notice notice-warn">还没有配置大模型 API Key，抓取正文可用，但无法做 AI 提炼。<a href="/settings">去设置 →</a></div>`}`
    : `<section class="hero">
        <div class="hero-main">
          <div class="kicker">检测失败</div>
          <h1>暂时无法获取最新期号</h1>
          <p class="muted">${esc(latestError || '请稍后点「重新检测」，或检查网络连接')}</p>
        </div>
        <div class="hero-actions"><button class="btn" data-redetect="1">重新检测</button></div>
      </section>`;

  const jobPanel = `<section class="panel" id="job-panel" hidden>
    <div class="panel-head">
      <h2>生成中</h2>
      <button class="btn btn-sm" id="job-cancel">取消</button>
    </div>
    <div class="progress-line">
      <progress id="job-bar" value="0" max="1"></progress>
      <span id="job-count" class="mono">0/0</span>
    </div>
    <div class="job-steps" id="job-steps"></div>
    <pre class="log" id="job-log"></pre>
  </section>`;

  const rows = issues.length
    ? issues.map((i) => `<tr>
        <td class="mono nowrap">${esc(i.id)}</td>
        <td>
          <a href="/issue/${esc(i.id)}">${esc(i.label)}</a>
          <div class="small muted">更新于 ${esc(fmtDate(i.updatedAt))}</div>
        </td>
        <td class="mono nowrap">${esc(i.publishDate || '—')}</td>
        <td class="num">${i.articleCount || 0}</td>
        <td>${phaseBadge(i.phase)}</td>
        <td class="row-actions">
          <a class="btn btn-xs" href="/issue/${esc(i.id)}">查看</a>
          <a class="btn btn-xs" href="/print/${esc(i.id)}" target="_blank">打印页</a>
          <button class="btn btn-xs" data-pdf="${esc(i.id)}">导出 PDF</button>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="6">${emptyState('还没有生成过任何一期', '点击上方「生成本期」开始')}</td></tr>`;

  const body = `
${hero}
${jobPanel}
<section class="panel">
  <div class="panel-head"><h2>本地已生成的期号</h2><span class="muted small">共 ${issues.length} 期</span></div>
  <table class="table">
    <thead><tr><th>期号</th><th>期名</th><th>上线</th><th class="num">条数</th><th>状态</th><th>操作</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>
<section class="panel panel-quiet">
  <div class="panel-head"><h2>使用说明</h2></div>
  <ol class="steps">
    <li><b>配置 Key</b>：到<a href="/settings">设置</a>页填入兼容 OpenAI 协议的大模型接口（默认 DeepSeek），保存后点「测试连接」。</li>
    <li><b>生成本期</b>：点「生成本期」，系统会抓取该期全部文章并逐篇提炼，单期约 5–10 分钟，可随时关闭页面（进度会存盘，重进可继续）。</li>
    <li><b>导出 PDF</b>：生成完成后点「导出 PDF」，得到带封面、目录、逐篇要点的 A4 学习资料。</li>
  </ol>
  <p class="hint">抓取的原文与纯文本都保留在 <span class="mono">data/raw</span> 与 <span class="mono">data/text</span> 目录，金句被标注「未校验」的说明模型没能逐字对上原文，已自动从 PDF 中剔除。</p>
</section>`;

  return page({ title: '《求是》备考重点提炼', body, active: 'home' });
}
