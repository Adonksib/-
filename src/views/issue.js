import {
  esc, page, phaseBadge, fmtDate, emptyState,
} from './html.js';

const KIND_LABEL = {
  reading: '本期导读',
  article: '文章',
  chart: '统计图表',
  letter: '党员来信',
  digest: '党刊精选',
  qa: '学习问答',
  interview: '求是专访',
  research: '深度调研',
};

function levelStars(n) {
  const v = Math.max(1, Math.min(5, Number(n) || 3));
  return '●'.repeat(v) + '○'.repeat(5 - v);
}

function metaChips(a) {
  const chips = [];
  if (a.column) chips.push(`<span class="chip chip-column">${esc(a.column)}</span>`);
  if (a.tag) chips.push(`<span class="chip chip-tag">${esc(a.tag)}</span>`);
  if (!a.column && !a.tag) chips.push(`<span class="chip">${esc(KIND_LABEL[a.kind] || '文章')}</span>`);
  return chips.join('');
}

function quotesBlock(quotes, mode) {
  const list = (quotes || []).filter((q) => (mode === 'print' ? q.verified : true));
  if (!list.length) return '';
  return `<div class="quotes">
    ${list.map((q) => `<div class="quote-box ${q.verified ? '' : 'unverified'}">
      <div class="quote-text">${esc(q.text)}</div>
      <div class="quote-meta">${q.verified ? '' : '<span class="tag-unverified">未校验</span>'}${
  (q.useFor || []).map((u) => `<span class="tag-use">${esc(u)}</span>`).join('')
}</div>
    </div>`).join('')}
  </div>`;
}

function examBlock(exam) {
  if (!exam) return '';
  const s = exam.shenlun || {};
  const hasShenlun = (s.topics || []).length || (s.essayAngles || []).length;
  const iv = exam.interview || [];
  const cs = exam.changshi || [];
  if (!hasShenlun && !iv.length && !cs.length) return '';

  const parts = [];
  if (hasShenlun) {
    parts.push(`<div class="exam-col exam-shenlun">
      <h4><span class="dot dot-red"></span>申论</h4>
      ${(s.topics || []).length ? `<p><b>主题</b>${s.topics.map((t) => `<span class="pill">${esc(t)}</span>`).join('')}</p>` : ''}
      ${(s.essayAngles || []).length ? `<p><b>切入</b>${s.essayAngles.map((t) => `<span class="pill">${esc(t)}</span>`).join('')}</p>` : ''}
      ${(s.usableAs || []).length ? `<p class="small muted">可作：${s.usableAs.map(esc).join('、')}</p>` : ''}
    </div>`);
  }
  if (iv.length) {
    parts.push(`<div class="exam-col exam-interview">
      <h4><span class="dot dot-green"></span>面试</h4>
      ${iv.map((q) => `<div class="qa"><p class="qa-q">${esc(q.question)}</p>
        <ol class="qa-a">${(q.answerPoints || []).map((p) => `<li>${esc(p)}</li>`).join('')}</ol></div>`).join('')}
    </div>`);
  }
  if (cs.length) {
    parts.push(`<div class="exam-col exam-changshi">
      <h4><span class="dot dot-blue"></span>常识</h4>
      ${cs.map((q) => `<div class="qa"><p class="qa-q">${esc(q.stem)}</p>
        <p class="qa-ans">答：${esc(q.answer)}</p>
        ${q.explain ? `<p class="small muted">依据：${esc(q.explain)}</p>` : ''}</div>`).join('')}
    </div>`);
  }
  return `<div class="exam-grid">${parts.join('')}</div>`;
}

function imagesBlock(a) {
  if (!a.images || !a.images.length) return '';
  const shown = a.kind === 'chart' ? a.images : a.images.slice(0, 2);
  return `<div class="figures ${a.kind === 'chart' ? 'figures-chart' : ''}">
    ${shown.map((im) => `<figure>
      <img src="${esc(im.url || '')}" alt="${esc(im.caption || '配图')}" loading="lazy">
      ${im.caption ? `<figcaption>${esc(im.caption)}</figcaption>` : ''}
    </figure>`).join('')}
  </div>`;
}

export function articleCard(a, mode = 'web') {
  const ai = a.ai || null;
  const flags = [
    ai && (ai.exam?.shenlun?.topics || []).length ? 'shenlun' : '',
    ai && (ai.exam?.interview || []).length ? 'interview' : '',
    ai && (ai.exam?.changshi || []).length ? 'changshi' : '',
    (ai?.reciteLevel || 0) >= 4 ? 'key' : '',
  ].filter(Boolean).join(' ');

  return `<article class="card article-card ${mode === 'print' ? 'article-block' : ''}" id="a-${esc(a.id)}" data-flags="${flags}">
    <header class="card-head">
      <div class="card-title-row">
        <span class="idx mono">${esc(a.id)}</span>
        ${metaChips(a)}
        <span class="level" title="重要度">${levelStars(ai?.reciteLevel)}</span>
      </div>
      <h3>${esc(a.title)}</h3>
      <div class="card-sub">
        <span>${esc(a.author || '未署名')}</span>
        ${a.charCount ? `<span class="mono">${a.charCount} 字</span>` : ''}
        <a class="no-print" href="${esc(a.url)}" target="_blank" rel="noopener">原文</a>
        ${a.state?.extract === 'failed' ? `<span class="tag-fail">提炼失败：${esc(a.state.error || '')}</span>` : ''}
      </div>
    </header>

    ${a.note ? `<p class="note">${esc(a.note)}</p>` : ''}
    ${ai?.oneline ? `<p class="oneline">${esc(ai.oneline)}</p>` : ''}

    ${(ai?.themes || []).length ? `<div class="themes">${ai.themes.map((t) => `<span class="pill pill-theme">${esc(t)}</span>`).join('')}</div>` : ''}

    ${(ai?.points || []).length ? `<div class="points">
      <h4>核心观点</h4>
      <ol>${ai.points.map((p) => `<li><b>${esc(p.point)}</b>${p.detail ? `<span class="detail">${esc(p.detail)}</span>` : ''}</li>`).join('')}</ol>
    </div>` : ''}

    ${quotesBlock(ai?.quotes, mode)}

    ${examBlock(ai?.exam)}

    ${imagesBlock({ ...a, issueId: a.issueId })}

    ${(ai?.keywords || []).length ? `<div class="keywords"><span class="muted small">关键词</span>${ai.keywords.map((k) => `<span class="kw">${esc(k)}</span>`).join('')}</div>` : ''}
  </article>`;
}

function themeMap(summary) {
  if (!summary?.themeMap?.length) return '';
  return `<div class="themes-map">
    ${summary.themeMap.map((t) => `<div class="theme-row">
      <div class="theme-name">${esc(t.theme)}</div>
      <div class="theme-bar"><span style="width:${Math.round((t.weight || 0) * 100)}%"></span></div>
      <div class="theme-pct mono">${Math.round((t.weight || 0) * 100)}%</div>
      <div class="theme-ids mono small">${(t.articleIds || []).map((id) => `<a href="#a-${esc(id)}">${esc(id)}</a>`).join(' ')}</div>
      ${t.note ? `<div class="theme-note small muted">${esc(t.note)}</div>` : ''}
    </div>`).join('')}
  </div>`;
}

export function summarySection(issue, mode) {
  const s = issue.summary;
  if (!s) {
    return `<section class="summary-block">
      <h2>本期汇总</h2>
      ${emptyState('还没有生成本期汇总', '生成过程中会自动汇总；也可在详情页点「重新汇总」')}
    </section>`;
  }
  const recite = (s.reciteTop10 || []).filter((q) => (mode === 'print' ? q.verified : true));
  const q = s.quality || {};

  return `<section class="summary-block">
    <h2>本期总览</h2>
    <p class="overview">${esc(s.overview)}</p>
    <div class="stat-row">
      <div class="stat"><span class="stat-num">${issue.status?.progress?.extracted || 0}</span><span class="stat-label">篇已提炼</span></div>
      <div class="stat"><span class="stat-num">${(s.hotwords || []).length}</span><span class="stat-label">个热词</span></div>
      <div class="stat"><span class="stat-num">${recite.length}</span><span class="stat-label">条背诵金句</span></div>
      <div class="stat"><span class="stat-num">${Math.round((q.verifiedRate ?? 1) * 100)}%</span><span class="stat-label">金句原文校验</span></div>
    </div>

    ${(s.themeMap || []).length ? `<h3>主题图谱</h3>${themeMap(s)}` : ''}

    ${(s.hotwords || []).length ? `<h3>高频热词</h3>
      <div class="hotwords">${s.hotwords.map((h) => `<span class="hw">${esc(h.word)}${h.count ? `<i>${h.count}</i>` : ''}</span>`).join('')}</div>` : ''}

    ${(s.mustKnow || []).length ? `<h3>重中之重</h3>
      <div class="mustknow">
        ${s.mustKnow.map((m) => `<div class="mk-item">
          <div class="mk-title">${m.articleId ? `<a href="#a-${esc(m.articleId)}" class="mono">${esc(m.articleId)}</a>` : ''}${esc(m.title)}</div>
          <div class="mk-why">${esc(m.why)}</div>
          ${(m.points || []).length ? `<ul>${m.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
        </div>`).join('')}
      </div>` : ''}

    ${recite.length ? `<h3>背诵清单 Top${recite.length}</h3>
      <ol class="recite">
        ${recite.map((r) => `<li class="${r.verified ? '' : 'unverified'}">
          <span class="recite-text">${esc(r.text)}</span>
          <span class="recite-meta">${r.articleId ? `<a href="#a-${esc(r.articleId)}" class="mono">${esc(r.articleId)}</a>` : ''}${esc(r.type || '')}${r.verified ? '' : '<span class="tag-unverified">未校验</span>'}</span>
        </li>`).join('')}
      </ol>` : ''}

    ${(s.examForecast?.shenlun?.length || s.examForecast?.interview?.length || s.examForecast?.changshi?.length) ? `<h3>出题方向预测</h3>
      <div class="forecast">
        <div class="fc-col">
          <h4><span class="dot dot-red"></span>申论</h4>
          ${(s.examForecast.shenlun || []).map((x) => `<div class="fc-item"><b>${esc(x.topic)}</b>${x.angle ? `<p>${esc(x.angle)}</p>` : ''}${(x.articleIds || []).length ? `<p class="small muted mono">见 ${x.articleIds.join(' ')}</p>` : ''}</div>`).join('')}
        </div>
        <div class="fc-col">
          <h4><span class="dot dot-green"></span>面试</h4>
          ${(s.examForecast.interview || []).map((x) => `<div class="fc-item"><b>${esc(x.topic)}</b><ul>${(x.questions || []).map((qq) => `<li>${esc(qq)}</li>`).join('')}</ul></div>`).join('')}
        </div>
        <div class="fc-col">
          <h4><span class="dot dot-blue"></span>常识</h4>
          ${(s.examForecast.changshi || []).map((x) => `<div class="fc-item"><b>${esc(x.topic)}</b><ul>${(x.points || []).map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`).join('')}
        </div>
      </div>` : ''}

    ${(s.studyPlan || []).length ? `<h3>建议学习顺序</h3>
      <ol class="plan">
        ${s.studyPlan.map((p) => `<li><b>第 ${p.day} 天</b>${esc(p.focus)}<span class="mono small muted">${(p.articleIds || []).join(' ')}</span></li>`).join('')}
      </ol>` : ''}

    ${q.quotesTotal ? `<p class="quality small muted">共 ${q.quotesTotal} 条金句，${q.quotesVerified} 条通过原文逐字校验（${Math.round((q.verifiedRate || 0) * 100)}%）。未通过校验的已在 PDF 中剔除，网页上以灰色标注。</p>` : ''}
  </section>`;
}

/** 正文主体：web 与 print 共用 */
export function renderIssueBody(issue, { mode = 'web' } = {}) {
  const articles = (issue.articles || []).map((a) => ({ ...a, issueId: issue.id }));
  const cards = articles.map((a) => articleCard(a, mode)).join('\n');

  if (mode === 'print') {
    return `${summarySection(issue, mode)}
      <section class="articles-print">${cards}</section>`;
  }

  return `<div class="filter-bar no-print">
      <span class="muted small">筛选</span>
      <button class="chip-btn on" data-filter="all">全部</button>
      <button class="chip-btn" data-filter="key">重点篇目</button>
      <button class="chip-btn" data-filter="shenlun">有申论考点</button>
      <button class="chip-btn" data-filter="interview">有面试题</button>
      <button class="chip-btn" data-filter="changshi">有常识题</button>
    </div>
    ${summarySection(issue, mode)}
    <h2 class="section-title">逐篇精读（${articles.length} 条）</h2>
    <div class="article-list">${cards}</div>`;
}

export function renderIssue({ issue }) {
  const p = issue.status?.progress || {};
  const actions = `<div class="issue-actions no-print">
    <button class="btn btn-primary" data-pdf="${esc(issue.id)}">导出 PDF</button>
    <a class="btn" href="/print/${esc(issue.id)}" target="_blank">打印视图</a>
    <button class="btn" data-generate="${esc(issue.id)}" data-force="1">重新生成</button>
    ${p.failed > 0 ? `<button class="btn" data-retry="${esc(issue.id)}">重试失败 ${p.failed} 篇</button>` : ''}
  </div>`;

  const header = `<section class="issue-head">
    <div class="crumbs no-print"><a href="/">首页</a> / ${esc(issue.label)}</div>
    <h1>${esc(issue.label)}</h1>
    <div class="issue-meta">
      ${phaseBadge(issue.status?.phase)}
      <span>上线 ${esc(issue.publishDate || '—')}</span>
      <span>共 ${isTotal(issue)} 条</span>
      <span>已提炼 ${p.extracted || 0} 篇</span>
      ${issue.status?.costEstimateCny ? `<span>估算成本 ¥${issue.status.costEstimateCny}</span>` : ''}
      ${issue.status?.model ? `<span class="mono small">${esc(issue.status.model)}</span>` : ''}
      ${issue.status?.finishedAt ? `<span>生成于 ${esc(fmtDate(issue.status.finishedAt))}</span>` : ''}
    </div>
    ${actions}
  </section>`;

  const jobPanel = `<section class="panel" id="job-panel" hidden>
    <div class="panel-head"><h2>生成中</h2><button class="btn btn-sm" id="job-cancel">取消</button></div>
    <div class="progress-line"><progress id="job-bar" value="0" max="1"></progress><span id="job-count" class="mono">0/0</span></div>
    <pre class="log" id="job-log"></pre>
  </section>`;

  return page({
    title: `${issue.label} · 备考重点`,
    body: `${header}${jobPanel}${renderIssueBody(issue, { mode: 'web' })}`,
    active: 'home',
  });
}

function isTotal(issue) {
  return issue.articles?.length || 0;
}
