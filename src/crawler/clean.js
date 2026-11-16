/**
 * 正文清洗：求是网文章页 `#detailContent` 解析出的 block 列表 → 干净 block + 纯文本
 *
 * 实测噪声序列（文章尾部）：
 *   扫描二维码分享到手机 → 网站编辑 - xxx → 校对 - xxx 审校 - xxx → 【网站声明】 → 重复标题
 */

const NOISE_PATTERNS = [
  /^扫描二维码/,
  /^网站编辑\s*[-－—]/,
  /^校对\s*[-－—]/,
  /^审校\s*[-－—]/,
  /^责任编辑/,
  /^分享到/,
  /^返回顶部/,
  /^【网站声明】/,
  /^网站声明/,
  /^上一篇[:：]/,
  /^下一篇[:：]/,
  /^相关链接/,
  /^-->$/,
  /^--$/,
];

const CUT_PATTERN = /【网站声明】|扫描二维码分享|网站编辑\s*[-－—]/;

const CN_NUM_SECTION = /^[一二三四五六七八九十]{1,3}$/;

export function normalizeInline(input) {
  return String(input ?? '')
    .replace(/&emsp;|&#12288;|&nbsp;|&#160;/gi, ' ')
    .replace(/&ldquo;/gi, '“').replace(/&rdquo;/gi, '”')
    .replace(/&mdash;/gi, '—').replace(/&hellip;/gi, '…')
    .replace(/\u3000/g, ' ')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+$/, '')
    .trim();
}

const isNoise = (t) => !t || NOISE_PATTERNS.some((re) => re.test(t));

/** 仅比较文字（去空白标点），用于判断是否与标题重复 */
function looseKey(s) {
  return normalizeInline(s).replace(/[\s，。、；：""''（）《》〈〉—…·,.;:!?"'()\-]/g, '');
}

const isCaption = (t) => (
  t.length <= 80
  && (/[\/／]摄$/.test(t) || /新华社记者/.test(t) || /图片来源[:：]/.test(t) || /^图[：:]/.test(t) || /（?资料图）?$/.test(t) && t.length <= 30)
);

/**
 * @param {Array<{type:string,text?:string,src?:string}>} blocks
 * @param {{title:string}} opts
 * @returns {{blocks:Array, note:string, text:string, charCount:number}}
 */
export function cleanBlocks(blocks, { title = '' } = {}) {
  const titleKey = looseKey(title);

  // 1) 归一化 + 截断
  let list = [];
  for (const b of blocks) {
    if (b.type === 'img') {
      list.push({ ...b, text: normalizeInline(b.text || '') });
      continue;
    }
    const text = normalizeInline(b.text);
    if (!text) continue;
    if (CUT_PATTERN.test(text)) break;
    list.push({ ...b, text });
  }

  // 2) 去噪行
  list = list.filter((b) => b.type === 'img' || !isNoise(b.text));

  // 3) 去首尾与标题重复的块（源站常在正文首尾重复标题）
  const notTitle = (b) => !(b.type !== 'img' && titleKey && looseKey(b.text) === titleKey);
  while (list.length && !notTitle(list[0])) list.shift();
  while (list.length && !notTitle(list[list.length - 1])) list.pop();
  list = list.filter(notTitle);

  // 4) 抽出 ※ 编者说明
  let note = '';
  const noteIdx = list.findIndex((b) => b.type !== 'img' && b.text.startsWith('※'));
  if (noteIdx >= 0) {
    note = list[noteIdx].text;
    list.splice(noteIdx, 1);
  }

  // 5) 小节序号独立成行 → heading；图片说明 → caption
  list = list.map((b) => {
    if (b.type === 'img') return b;
    const t = b.text;
    if (CN_NUM_SECTION.test(t)) return { ...b, type: 'h', text: t };
    if (isCaption(t)) return { ...b, type: 'caption' };
    return { ...b, type: 'p' };
  });

  // 6) 相邻重复块去重
  const dedup = [];
  for (const b of list) {
    const prev = dedup[dedup.length - 1];
    if (prev && prev.type === b.type && prev.type !== 'img' && prev.text === b.text) continue;
    dedup.push(b);
  }

  // 7) 生成纯文本（给 AI 用）
  const parts = [];
  for (const b of dedup) {
    if (b.type === 'img') {
      if (b.alt) parts.push(`[图片：${b.alt}]`);
      continue;
    }
    if (b.type === 'h') parts.push(`## ${b.text}`);
    else if (b.type === 'caption') parts.push(`（图：${b.text}）`);
    else parts.push(b.text);
  }
  const text = parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  return {
    blocks: dedup,
    note,
    text,
    charCount: text.replace(/\s/g, '').length,
  };
}

/** 从 HTML 里粗暴提纯文本（解析降级时的兜底） */
export function htmlToLooseBlocks(html) {
  const cleaned = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const blocks = [];
  const re = /<(p|div|h1|h2|h3)\b[^>]*>([\s\S]*?)<\/\1>|<img\b[^>]*src="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = re.exec(cleaned))) {
    if (m[3]) {
      blocks.push({ type: 'img', src: m[3] });
    } else {
      const text = m[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ');
      if (text.trim()) blocks.push({ type: 'p', text });
    }
  }
  return blocks;
}
