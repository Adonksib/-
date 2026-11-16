/** 独立假模型服务：node scripts/mock-server.js（默认 5199 端口） */
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 5199);

function pick(body, start, len = 26) {
  return String(body).replace(/\s+/g, '').slice(start, start + len);
}

function articleJson(userText, isChart) {
  const m = userText.match(/【原文开始】([\s\S]*?)【原文结束】/);
  const body = m ? m[1] : userText;
  return {
    oneline: '（假模型）文章围绕重大主题展开，强调系统观念与实干导向。',
    themes: ['中国式现代化', '高质量发展'],
    points: [
      { point: '坚持系统观念', detail: '（假模型）统筹兼顾、整体推进。' },
      { point: '突出问题导向', detail: '（假模型）聚焦堵点难点，以改革办法破解难题。' },
    ],
    quotes: isChart ? [] : [
      { text: pick(body, 30), anchor: '正文', useFor: ['申论开头'] },
      { text: pick(body, 200, 22), anchor: '正文', useFor: ['面试答题'] },
    ],
    exam: {
      shenlun: { topics: ['高质量发展'], essayAngles: ['从机制层面谈落实'], usableAs: ['论据'] },
      interview: [{ question: '如何理解系统观念？', answerPoints: ['把握整体与局部', '统筹当前与长远'] }],
      changshi: [],
    },
    keywords: ['系统观念', '高质量发展'],
    reciteLevel: 4,
  };
}

function summaryJson(userText) {
  const q = userText.match(/「([^」]{10,60})」/);
  return {
    overview: '（假模型总览）本期围绕重大主题展开。',
    themeMap: [{ theme: '高质量发展', weight: 0.6, articleIds: ['002'] }, { theme: '党的建设', weight: 0.4, articleIds: ['003'] }],
    hotwords: [{ word: '系统观念', count: 3 }],
    mustKnow: [{ title: '重点篇目', articleId: '002', why: '理论源头', points: ['要点一'] }],
    reciteTop10: [
      { text: q ? q[1] : '假模型金句', articleId: '002', type: '原文论断' },
      { text: '这条是编造的，应被校验拦下', articleId: '003', type: '原文论断' },
    ],
    examForecast: {
      shenlun: [{ topic: '抓落实', angle: '制度执行', articleIds: ['002'] }],
      interview: [{ topic: '系统观念', questions: ['谈谈理解'] }],
      changshi: [{ topic: '时政', points: ['记住核心提法'] }],
    },
    studyPlan: [{ day: 1, focus: '精读重点篇目', articleIds: ['002'] }],
  };
}

http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    let body = {};
    try { body = JSON.parse(raw); } catch { /* ignore */ }
    const user = (body.messages || []).filter((m) => m.role === 'user').map((m) => m.content).join('\n');
    const data = user.includes('【各篇提炼】') ? summaryJson(user) : articleJson(user, user.includes('统计图表页'));
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      model: body.model || 'mock',
      choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(data) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1500, completion_tokens: 700 },
    }));
  });
}).listen(PORT, '127.0.0.1', () => console.log(`mock llm on http://127.0.0.1:${PORT}/v1`));
