import { randomUUID } from 'node:crypto';

/** 内存任务表：一个期号同时只允许一个生成任务 */
const jobs = new Map();
const runningByIssue = new Map();

export function createJob(issueId, opts = {}) {
  const existing = runningByIssue.get(issueId);
  if (existing) {
    const job = jobs.get(existing);
    if (job && !job.finished) return { job, conflict: true };
  }
  const id = randomUUID();
  const job = {
    id,
    issueId,
    opts,
    status: 'running',
    phase: 'init',
    progress: { total: 0, crawled: 0, extracted: 0, failed: 0 },
    currentArticle: null,
    logs: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    aborted: false,
    finished: false,
  };

  job.emit = (phase, message, extra = {}) => {
    job.phase = phase || job.phase;
    if (extra.progress) job.progress = { ...job.progress, ...extra.progress };
    if ('currentArticle' in extra) job.currentArticle = extra.currentArticle;
    if (message) {
      job.logs.push({
        ts: new Date().toISOString(),
        phase: job.phase,
        msg: String(message).slice(0, 500),
        level: extra.level || 'info',
      });
      if (job.logs.length > 800) job.logs.splice(0, job.logs.length - 800);
    }
  };

  job.cancel = () => {
    job.aborted = true;
    job.emit(job.phase, '已请求取消，当前请求结束后停止', { level: 'warn' });
  };

  job.finish = (err) => {
    job.finished = true;
    job.finishedAt = new Date().toISOString();
    job.status = err ? 'error' : (job.aborted ? 'canceled' : 'done');
    job.error = err ? String(err.message || err) : null;
    if (err) job.emit('error', `失败：${err.message}`, { level: 'error' });
    else job.emit('done', '任务结束');
  };

  job.snapshot = (cursor = 0) => ({
    id: job.id,
    issueId: job.issueId,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    currentArticle: job.currentArticle,
    logs: job.logs.slice(cursor),
    cursor: job.logs.length,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    finished: job.finished,
    error: job.error,
  });

  jobs.set(id, job);
  runningByIssue.set(issueId, id);

  // 任务结束后清理（保留 30 分钟供前端拉最后一次结果）
  setTimeout(() => {
    if (jobs.get(id)?.finished) {
      jobs.delete(id);
      if (runningByIssue.get(issueId) === id) runningByIssue.delete(issueId);
    }
  }, 30 * 60 * 1000).unref?.();

  return { job, conflict: false };
}

export function getJob(id) {
  return jobs.get(id) || null;
}

export function runningJobId(issueId) {
  const id = runningByIssue.get(issueId);
  const job = id ? jobs.get(id) : null;
  return job && !job.finished ? id : null;
}
