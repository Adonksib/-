/** 全部提示词集中管理 */

export const ARTICLE_SYSTEM = `你是公务员考试命题研究者，长期跟踪《求是》杂志与中央政策表述，熟悉申论、结构化面试、常识判断（时政）的命题套路。

你的输出会被考生直接背诵和引用，因此必须遵守：
1. 「金句 quotes」只能从给定原文中【逐字复制连续片段】，长度 8-40 字，禁止改写、禁止拼接两句、禁止自造、禁止把概括句当原文。每条的 anchor 填该片段所在的小节标题（原文中的"一/二/三"或"正文"）。
2. 可以概括、归类、判断考法，但不得编造原文没有的数字、提法、会议名称、领导人讲话内容。
3. 若原文是纯图片（统计图表页）或内容不足以提炼，则 points 给能确定的判断，quotes 必须返回空数组。
4. 严格只输出一个 JSON 对象，不要任何解释文字、不要 markdown 代码围栏、字符串内不要出现换行符。`;

function metaLines(a) {
  const lines = [`【标题】${a.title}`];
  lines.push(`【作者】${a.author || '未署名'}`);
  lines.push(`【栏目】${a.column || '—'}${a.tag ? `（${a.tag}）` : ''}`);
  if (a.note) lines.push(`【编者说明】${a.note}`);
  if (a.charCount) lines.push(`【正文字数】约 ${a.charCount} 字`);
  return lines.join('\n');
}

export function buildArticleUser(a, { truncated = false } = {}) {
  return `${metaLines(a)}
${truncated ? '【注意】原文过长已截断，仅就给定部分提炼。\n' : ''}
【原文开始】
${a.text}
【原文结束】

请输出如下 JSON（字段名与嵌套层级必须完全一致）：
{
  "oneline": "一句话主旨，不超过40字，说清这篇文章在讲什么、主张什么",
  "themes": ["2-4个宏观主题词，使用中央文件通用表述，如：全面从严治党、高质量发展、中国式现代化"],
  "points": [
    {"point": "分论点，12字以内", "detail": "2-3句展开，80字以内，尽量沿用原文表述"}
  ],
  "quotes": [
    {"text": "原文中连续出现的8-40字", "anchor": "一|二|三|正文", "useFor": ["申论开头","标题词","面试答题","常识记忆"]}
  ],
  "exam": {
    "shenlun": {
      "topics": ["可能作为申论主题的方向，1-3个"],
      "essayAngles": ["大作文可能的切入角度，1-3个"],
      "usableAs": ["背景素材","论据","对策来源","概念解释"] 
    },
    "interview": [
      {"question": "结构化面试可能怎么问，一句完整问句", "answerPoints": ["答题要点1","答题要点2","答题要点3"]}
    ],
    "changshi": [
      {"stem": "常识判断题干（时政类）", "answer": "答案", "explain": "依据原文哪句表述"}
    ]
  },
  "keywords": ["5-8个高频词，短语优先"],
  "reciteLevel": 1
}

字段要求：
- points：3-6 条，覆盖全文骨架，不要只写开头部分。
- quotes：3-8 条，优先选"可背诵、可引用、表述凝练"的判断句、排比句、定义句；每条 useFor 至少 1 项。
- interview：1-2 条；changshi：0-2 条，没有明确可考的事实性表述就给空数组。
- reciteLevel：习近平署名文章或中央决定/全会文件原文=5，本刊编辑部/评论员文章与理论阐释=4，深度调研、经验做法、专访=3，学习问答/来信/精选=2，图表=1。`;
}

export function buildChartUser(a) {
  return `${metaLines(a)}
【说明】这是《求是》的统计图表页，正文几乎为纯图片，图片信息无法解析，只能依据标题与图注判断考法。

请输出如下 JSON：
{
  "oneline": "这张图表反映什么，不超过40字",
  "themes": ["2-3个主题词"],
  "points": [{"point": "图表最可能体现的判断", "detail": "结合标题说明该数据能支撑什么结论，80字以内"}],
  "quotes": [],
  "exam": {
    "shenlun": {"topics": ["可作为申论数据支撑的话题"],"essayAngles": ["可用图表数据佐证的角度"],"usableAs": ["数据支撑","论据"]},
    "interview": [],
    "changshi": [{"stem": "可能怎么考这组数据", "answer": "答案要点", "explain": "依据"}]
  },
  "keywords": ["3-6个关键词"],
  "reciteLevel": 1
}

注意：quotes 必须为空数组；不要编造具体数字，因为你只看到标题，看不到图内数据。`;
}

export const SUMMARY_SYSTEM = `你是公考教研组长，负责把一期《求是》杂志各篇的提炼结果，整合成一张"备考地图"。

规则：
1. 只能使用传入的各篇提炼结果，不得引入外部信息，不得编造原文没有的提法。
2. themeMap 的 weight 之和必须等于 1；每个主题要标注涉及的篇目 id。
3. hotwords 必须来自各篇 keywords 的交集或高频项，禁止发明新词。
4. reciteTop10 只能从传入的 quotes 里挑选，原文照搬，禁止改写或新造；articleId 填该金句所属篇目。
5. mustKnow 优先习近平署名文章、中央决定/全会原文、本刊编辑部与评论员文章。
6. 只输出一个 JSON 对象，不要解释文字、不要 markdown 围栏、字符串内不要换行。`;

/** 把各篇压缩成汇总输入 */
export function digestOf(issue) {
  const lines = [];
  lines.push(`《求是》${issue.year}年第${issue.issue}期（共 ${issue.articles.length} 条）`);
  for (const a of issue.articles) {
    const ai = a.ai || {};
    const pts = (ai.points || []).map((p) => p.point).join('；');
    const verified = (ai.quotes || []).filter((q) => q.verified).map((q) => q.text);
    lines.push(
      `\n#${a.id} [${a.column || '-'}|${a.tag || '-'}] ${a.title} /${a.author || '未署名'}\n`
      + `主旨：${ai.oneline || '（无）'}\n`
      + `主题：${(ai.themes || []).join('、') || '（无）'}\n`
      + `观点：${pts || '（无）'}\n`
      + `关键词：${(ai.keywords || []).join('、') || '（无）'}\n`
      + `金句：${verified.slice(0, 2).map((t) => `「${t}」`).join(' ') || '（无）'}`,
    );
  }
  return lines.join('\n');
}

export function buildSummaryUser(issue) {
  const ids = issue.articles.map((a) => `${a.id}=${a.title}`).join('\n');
  return `下面是一期《求是》杂志全部篇目的提炼结果。

【篇目对照】
${ids}

【各篇提炼】
${digestOf(issue)}

请输出如下 JSON：
{
  "overview": "本期总览，150字以内，说清这一期围绕哪些重大主题、重点是哪几篇",
  "themeMap": [
    {"theme": "主题名（中央通用表述）", "weight": 0.35, "articleIds": ["002","003"], "note": "一句话说明这个主题在本期的分量与核心提法"}
  ],
  "hotwords": [
    {"word": "热词", "count": 5, "articleIds": ["002"], "note": "为什么这个词重要（可选）"}
  ],
  "mustKnow": [
    {"title": "篇名", "articleId": "002", "why": "为什么是重中之重", "points": ["必须记住的要点1","要点2"]}
  ],
  "reciteTop10": [
    {"text": "从传入金句中原样复制的句子", "articleId": "002", "type": "原文论断|标题金句|排比句|概念定义"}
  ],
  "examForecast": {
    "shenlun": [{"topic": "最可能考的申论主题", "angle": "切入角度", "articleIds": ["002"]}],
    "interview": [{"topic": "面试可能涉及的话题", "questions": ["可能的问题"]}],
    "changshi": [{"topic": "常识可能的考点", "points": ["要记的事实"]}]
  },
  "studyPlan": [
    {"day": 1, "focus": "学习重点", "articleIds": ["002"]}
  ]
}

字段要求：
- themeMap：3-5 个主题，weight 之和 = 1。
- hotwords：8-15 个，按重要性排序。
- mustKnow：2-4 篇。
- reciteTop10：正好 10 条（金句不足时取实际数量），必须逐字来自传入的「金句」。
- examForecast.shenlun 2-3 条、interview 2-3 条、changshi 2-4 条。
- studyPlan：3-5 天，按由重到轻的顺序。`;
}
