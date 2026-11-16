/**
 * 命令行抓取：node scripts/crawl.js [2026-22] [--ai] [--force] [--limit=3]
 * 不带 --ai 时只抓取正文与图片，不调用模型（不需要 Key）
 */
import { runPipeline } from '../src/pipeline.js';
import { discoverLatest } from '../src/crawler/discover.js';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const limitArg = args.find((a) => a.startsWith('--limit='));
const issueId = args.find((a) => /^\d{4}-\d{1,2}$/.test(a));

const target = issueId || (await discoverLatest()).id;
console.log(`目标期号：${target}`);

const started = Date.now();
let lastMsg = '';
const issue = await runPipeline(target, {
  force: flags.has('--force'),
  crawlOnly: !flags.has('--ai'),
  limit: limitArg ? Number(limitArg.split('=')[1]) : 0,
  emit: (phase, msg) => {
    if (msg && msg !== lastMsg) {
      lastMsg = msg;
      console.log(`[${phase}] ${msg}`);
    }
  },
});

const p = issue.status.progress;
console.log(`\n完成，用时 ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(`阶段：${issue.status.phase}｜抓取 ${p.crawled}/${p.total}｜提炼 ${p.extracted}｜失败 ${p.failed}`);
console.log(`tokens：${JSON.stringify(issue.status.tokens)}｜估算成本 ¥${issue.status.costEstimateCny}`);
if (issue.summary) console.log(`汇总：${issue.summary.overview}`);
