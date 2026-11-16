import { esc, fmtDate } from './html.js';
import { summarySection, articleCard } from './issue.js';

/** A4 打印视图：封面 → 目录 → 本期汇总 → 逐篇（每篇新页起）
 *  ?only=003 时只打印指定篇目（多篇用逗号分隔），不带封面目录，便于单篇打印
 */
export function renderPrint({ issue, only = '' }) {
  const onlyIds = String(only).split(',').map((s) => s.trim()).filter(Boolean);
  let articles = (issue.articles || []).map((a) => ({ ...a, issueId: issue.id }));
  if (onlyIds.length) articles = articles.filter((a) => onlyIds.includes(a.id));
  const p = issue.status?.progress || {};
  const s = issue.summary;

  const cover = `<section class="cover">
    <div class="cover-kicker">公务员考试备考资料</div>
    <h1 class="cover-title">${esc(issue.label)}<br><span>重点提炼</span></h1>
    <div class="cover-rule"></div>
    ${s?.overview ? `<p class="cover-overview">${esc(s.overview)}</p>` : ''}
    <div class="cover-meta">
      <div><span>期号</span><b>${esc(issue.year)} 年第 ${esc(issue.issue)} 期</b></div>
      <div><span>上线日期</span><b>${esc(issue.publishDate || '—')}</b></div>
      <div><span>篇目</span><b>${articles.length} 条（已提炼 ${p.extracted || 0} 篇）</b></div>
      <div><span>生成时间</span><b>${esc(fmtDate(issue.status?.finishedAt))}</b></div>
      <div><span>提炼模型</span><b>${esc(issue.status?.model || '—')}</b></div>
      <div><span>金句校验</span><b>${Math.round((s?.quality?.verifiedRate ?? 1) * 100)}% 通过原文逐字核对</b></div>
    </div>
    <div class="cover-foot">本资料由个人学习工具生成，内容抓取自求是网，仅供备考参考。</div>
  </section>`;

  const toc = `<section class="toc">
    <h2>目 录</h2>
    <div class="toc-cols">
      <div class="toc-col">
        <div class="toc-group">本期汇总</div>
        <ol class="toc-list">
          ${s?.themeMap?.length ? '<li>主题图谱</li>' : ''}
          ${s?.hotwords?.length ? '<li>高频热词</li>' : ''}
          ${s?.mustKnow?.length ? '<li>重中之重</li>' : ''}
          ${s?.reciteTop10?.length ? '<li>背诵清单</li>' : ''}
          ${s?.examForecast ? '<li>出题方向预测</li>' : ''}
          ${s?.studyPlan?.length ? '<li>建议学习顺序</li>' : ''}
        </ol>
      </div>
      <div class="toc-col">
        <div class="toc-group">逐篇精读</div>
        <ol class="toc-list toc-articles">
          ${articles.map((a) => `<li><span class="toc-id">${esc(a.id)}</span>${esc(a.title)}</li>`).join('')}
        </ol>
      </div>
    </div>
  </section>`;

  const body = onlyIds.length
    ? `<section class="articles-print">${articles.map((a) => articleCard(a, 'print')).join('\n')}</section>`
    : `${cover}${toc}
    <section class="print-summary">${summarySection(issue, 'print')}</section>
    <section class="articles-print">${articles.map((a) => articleCard(a, 'print')).join('\n')}</section>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${esc(issue.label)} 备考重点</title>
<link rel="stylesheet" href="/assets/app.css">
<link rel="stylesheet" href="/assets/print.css">
</head>
<body class="print-body">
${body}
</body>
</html>`;
}
