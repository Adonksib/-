/**
 * 用本地假模型服务跑通整条链路（不花钱、不需要真 Key）
 * 用法：node scripts/test-mock.js [limit]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const MOCK_PORT = 5199;
const limit = Number(process.argv[2] || 3);

function articleJson(userText, isChart) {
  const m = userText.match(/【原文开始】([\s\S]*?)【原文结束】/);
  const body = (m ? m[1] : userText).replace(/\s+/g, '');
  const pick = (start, len = 26) => body.slice(start, start + len);
  const quotes = isChart ? [] : [
    { text: pick(20), anchor: '正文', useFor: ['申论开头'] },
    { text: pick(120, 22), anchor: '正文', useFor: ['面试答题'] },
  ];
  return {
    oneline: '（假模型）这篇文章围绕某重大主题展开论述，强调坚持系统观念与实干导向。',
    themes: ['中国式现代化', '高质量发展'],
    points: [
      { point: '坚持系统观念', detail: '（假模型）统筹兼顾、整体推进，处理好顶层设计与实践探索的关系。' },
      { point: '突出问题导向', detail: '（假模型）聚焦制约发展的堵点难点，以改革办法破解难题。' },
      { point: '强化实干担当', detail: '（假模型）把部署要求转化为具体行动和实际成效。' },
    ],
    quotes,
    exam: {
      shenlun: {
        topics: ['高质量发展'],
        essayAngles: ['从体制机制层面谈如何抓落实'],
        usableAs: ['背景素材', '论据'],
      },
      interview: [{ question: '如何理解坚持系统观念的重要性？', answerPoints: ['把握整体与局部关系', '统筹当前与长远'] }],
      changshi: [{ stem: '（假模型）本期强调的核心方法论是什么？', answer: '系统观念', explain: '原文相关表述' }],
    },
    keywords: ['系统观念', '高质量发展', '改革'],
    reciteLevel: 4,
  };
}

function summaryJson(userText) {
  const q = userText.match(/「([^」]{10,60})」/);
  const quote = q ? q[1] : '（假模型）坚持系统观念，处理好顶层设计与实践探索的关系';
  return {
    overview: '（假模型总览）本期围绕重大主题展开，重点在理论阐释与实践路径两方面。',
    themeMap: [
      { theme: '高质量发展', weight: 0.5, articleIds: ['002', '003'], note: '本期主线' },
      { theme: '党的建设', weight: 0.5, articleIds: ['006'], note: '重要板块' },
    ],
    hotwords: [
      { word: '系统观念', count: 3, articleIds: ['002'], note: '' },
      { word: '高质量发展', count: 2, articleIds: ['003'], note: '' },
    ],
    mustKnow: [{ title: '（假模型）重点篇目', articleId: '002', why: '理论源头', points: ['要点一', '要点二'] }],
    reciteTop10: [
      { text: quote, articleId: '002', type: '原文论断' },
      { text: '（假模型编造的金句，应当被校验拦下）', articleId: '003', type: '原文论断' },
    ],
    examForecast: {
      shenlun: [{ topic: '抓落实', angle: '从制度执行角度切入', articleIds: ['002'] }],
      interview: [{ topic: '系统观念', questions: ['谈谈你对系统观念的理解'] }],
      changshi: [{ topic: '时政', points: ['记住本期核心提法'] }],
    },
    studyPlan: [{ day: 1, focus: '精读重点篇目', articleIds: ['002'] }],
  };
}

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    let body = {};
    try { body = JSON.parse(raw); } catch { /* ignore */ }
    const messages = body.messages || [];
    const user = messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
    const isSummary = user.includes('【各篇提炼】');
    const isChart = user.includes('统计图表页');
    const data = isSummary ? summaryJson(user) : articleJson(user, isChart);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      id: 'mock',
      object: 'chat.completion',
      model: body.model || 'mock',
      choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(data) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1200, completion_tokens: 600, total_tokens: 1800 },
    }));
  });
});

const run = async () => {
  await new Promise((r) => server.listen(MOCK_PORT, '127.0.0.1', r));
  console.log(`假模型服务已启动：http://127.0.0.1:${MOCK_PORT}/v1`);

  const { saveSettings, loadSettings } = await import('../src/config.js');
  const backup = { ...loadSettings() };
  saveSettings({
    baseUrl: `http://127.0.0.1:${MOCK_PORT}/v1`,
    apiKey: 'mock-key-for-test',
    model: 'mock-model',
    concurrency: 3,
    minIntervalMs: 0,
  });

  const { runPipeline } = await import('../src/pipeline.js');
  const { loadIssue } = await import('../src/lib/store.js');

  const issue = await runPipeline('2026-22', {
    force: true,
    crawlOnly: false,
    limit,
    emit: (phase, msg) => { if (msg) console.log(`[${phase}] ${msg}`); },
  });

  const p = issue.status.progress;
  console.log(`\n阶段 ${issue.status.phase}｜抓取 ${p.crawled}/${p.total}｜提炼 ${p.extracted}｜失败 ${p.failed}`);

  const saved = loadIssue('2026-22');
  const checked = saved.articles.filter((a) => a.ai);
  console.log(`有 ai 结果：${checked.length} 篇`);
  checked.slice(0, 3).forEach((a) => {
    const v = a.ai.quotes.filter((q) => q.verified).length;
    console.log(`  ${a.id} 金句 ${a.ai.quotes.length} 条，通过校验 ${v} 条，主旨：${a.ai.oneline.slice(0, 28)}…`);
  });
  if (saved.summary) {
    const s = saved.summary;
    console.log(`汇总：Top${s.reciteTop10.length}，通过校验 ${s.quality.reciteVerified} 条`);
    const weights = s.themeMap.reduce((x, t) => x + t.weight, 0);
    console.log(`主题权重合计：${weights.toFixed(3)}`);
    console.log(`编造金句是否被拦下：${s.reciteTop10.filter((q) => !q.verified).length > 0 ? '是' : '否（需检查）'}`);
  }

  // 还原设置
  fs.writeFileSync(path.join(root, 'config/settings.json'), JSON.stringify(backup, null, 2), 'utf8');
  console.log('\n已还原原设置。');
  server.close();
  process.exit(0);
};

run().catch((e) => {
  console.error('测试失败：', e);
  server.close();
  process.exit(1);
});
