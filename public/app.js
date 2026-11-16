/* 前端交互：生成任务轮询、导出 PDF、筛选、设置表单 */
(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------------- toast ---------------- */
  let toastTimer = null;
  function toast(msg, type) {
    let el = $('#toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:99;'
        + 'padding:10px 20px;border-radius:8px;font-size:14px;box-shadow:0 6px 24px rgba(0,0,0,.14);'
        + 'background:#1f2328;color:#fff;max-width:80vw;line-height:1.6;transition:.2s;opacity:0';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.background = type === 'error' ? '#8c1c13' : type === 'ok' ? '#0f5c4d' : '#1f2328';
    el.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.opacity = '0'; }, type === 'error' ? 6000 : 3200);
  }

  /* ---------------- 任务进度 ---------------- */
  let jobTimer = null;
  let cursor = 0;

  function openJobPanel() {
    const panel = $('#job-panel');
    if (panel) panel.hidden = false;
    const log = $('#job-log');
    if (log) log.textContent = '';
    cursor = 0;
  }

  function renderJob(snap) {
    const bar = $('#job-bar');
    const count = $('#job-count');
    const log = $('#job-log');
    const p = snap.progress || {};
    const total = p.total || 0;
    const done = Math.max(p.crawled || 0, p.extracted || 0);
    if (bar) { bar.max = total || 1; bar.value = snap.phase === 'summarizing' ? total : done; }
    if (count) {
      count.textContent = total
        ? `${p.extracted || 0}/${total} 篇提炼 · 抓取 ${p.crawled || 0}/${total}`
        : '准备中…';
    }
    if (log && snap.logs && snap.logs.length) {
      const frag = document.createDocumentFragment();
      snap.logs.forEach((l) => {
        const line = document.createElement('div');
        line.className = l.level === 'error' ? 'lv-error' : l.level === 'warn' ? 'lv-warn' : '';
        const t = new Date(l.ts);
        const hh = String(t.getHours()).padStart(2, '0');
        const mm = String(t.getMinutes()).padStart(2, '0');
        const ss = String(t.getSeconds()).padStart(2, '0');
        line.textContent = `${hh}:${mm}:${ss}  ${l.msg}`;
        frag.appendChild(line);
      });
      log.appendChild(frag);
      log.scrollTop = log.scrollHeight;
    }
  }

  function pollJob(jobId, { reloadOnDone = true } = {}) {
    clearInterval(jobTimer);
    window.__jobId = jobId;
    jobTimer = setInterval(async () => {
      try {
        const r = await fetch(`/api/jobs/${jobId}?cursor=${cursor}`);
        if (!r.ok) {
          clearInterval(jobTimer);
          toast('任务状态获取失败，请刷新页面', 'error');
          return;
        }
        const snap = await r.json();
        cursor = snap.cursor || cursor;
        renderJob(snap);
        if (snap.finished) {
          clearInterval(jobTimer);
          if (snap.status === 'error') {
            toast(`生成失败：${snap.error || '未知错误'}`, 'error');
          } else if (snap.status === 'canceled') {
            toast('任务已取消', 'error');
          } else {
            toast('生成完成', 'ok');
            if (reloadOnDone) setTimeout(() => window.location.reload(), 900);
          }
        }
      } catch (e) {
        /* 网络抖动，继续轮询 */
      }
    }, 900);
  }

  async function startJob(url, body) {
    const btnAll = $$('button[data-generate],button[data-retry]');
    btnAll.forEach((b) => { b.disabled = true; });
    openJobPanel();
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 409 && data.jobId) {
        toast('该期已有任务在运行，正在接上进度…');
        pollJob(data.jobId);
        return;
      }
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      toast('已开始，抓取与提炼会持续几分钟，可以随时关闭页面');
      pollJob(data.jobId);
    } catch (e) {
      btnAll.forEach((b) => { b.disabled = false; });
      toast(`启动失败：${e.message}`, 'error');
    }
  }

  /* ---------------- 事件委托 ---------------- */
  document.addEventListener('click', async (ev) => {
    const gen = ev.target.closest('[data-generate]');
    if (gen) {
      const id = gen.dataset.generate;
      const force = gen.dataset.force === '1';
      if (force && !window.confirm('重新生成会重新调用模型（会再次产生费用），是否继续？')) return;
      startJob(`/api/issues/${encodeURIComponent(id)}/generate`, { force });
      return;
    }

    const retry = ev.target.closest('[data-retry]');
    if (retry) {
      startJob(`/api/issues/${encodeURIComponent(retry.dataset.retry)}/retry-failed`, {});
      return;
    }

    const redetect = ev.target.closest('[data-redetect]');
    if (redetect) {
      window.location.href = '/?refresh=1';
      return;
    }

    const cancel = ev.target.closest('#job-cancel');
    if (cancel) {
      const id = new URLSearchParams(window.location.search).get('job');
      const jobId = id || window.__jobId;
      if (!jobId) { toast('没有正在运行的任务'); return; }
      await fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
      toast('已请求取消');
      return;
    }

    const pdf = ev.target.closest('[data-pdf]');
    if (pdf) {
      const id = pdf.dataset.pdf;
      const old = pdf.textContent;
      pdf.disabled = true;
      pdf.textContent = '正在生成 PDF…';
      try {
        const r = await fetch(`/api/issues/${encodeURIComponent(id)}/export`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        toast(`PDF 已生成（${(data.bytes / 1024 / 1024).toFixed(2)} MB，${data.engine}）`, 'ok');
        const a = document.createElement('a');
        a.href = `/api/issues/${encodeURIComponent(id)}/pdf`;
        a.download = data.name || '求是备考重点.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (e) {
        toast(`导出失败：${e.message}`, 'error');
      } finally {
        pdf.disabled = false;
        pdf.textContent = old;
      }
      return;
    }

    /* 筛选 */
    const f = ev.target.closest('[data-filter]');
    if (f) {
      $$('.chip-btn[data-filter]').forEach((b) => b.classList.toggle('on', b === f));
      const key = f.dataset.filter;
      $$('.article-card').forEach((card) => {
        const flags = (card.dataset.flags || '').split(' ');
        card.style.display = key === 'all' || flags.includes(key) ? '' : 'none';
      });
    }
  });

  /* ---------------- 设置页 ---------------- */
  const form = $('#settings-form');
  if (form) {
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const msg = $('#form-msg');
      const fd = new FormData(form);
      const payload = {};
      fd.forEach((v, k) => { payload[k] = typeof v === 'string' ? v.trim() : v; });
      if (!payload.apiKey) delete payload.apiKey;
      ['concurrency', 'minIntervalMs', 'temperature'].forEach((k) => {
        if (payload[k] !== undefined && payload[k] !== '') payload[k] = Number(payload[k]);
      });
      msg.className = 'form-msg';
      msg.textContent = '保存中…';
      try {
        const r = await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || '保存失败');
        msg.className = 'form-msg ok';
        msg.textContent = '已保存';
        const keyInput = form.querySelector('[name=apiKey]');
        if (keyInput) keyInput.value = '';
        setTimeout(() => window.location.reload(), 700);
      } catch (e) {
        msg.className = 'form-msg err';
        msg.textContent = `保存失败：${e.message}`;
      }
    });

    const testBtn = $('#btn-test');
    if (testBtn) {
      testBtn.addEventListener('click', async () => {
        const msg = $('#form-msg');
        msg.className = 'form-msg';
        msg.textContent = '正在测试…';
        testBtn.disabled = true;
        try {
          const r = await fetch('/api/settings/test', { method: 'POST' });
          const data = await r.json();
          if (!r.ok || !data.ok) throw new Error(data.error || '连接失败');
          msg.className = 'form-msg ok';
          msg.textContent = `连接正常（${data.model}，${data.latencyMs}ms）`;
        } catch (e) {
          msg.className = 'form-msg err';
          msg.textContent = `连接失败：${e.message}`;
        } finally {
          testBtn.disabled = false;
        }
      });
    }
  }
})();
