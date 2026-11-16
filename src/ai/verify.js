/** 金句逐字校验：去掉空白与标点后做包含匹配，防止模型改写或伪造原文 */

const PUNCT_RE = /[\s\u3000，。、；：""''（）《》〈〉【】—…·,.;:!?"'()\-_/\\|～~`]/g;

export function normalizeForMatch(s) {
  return String(s ?? '').replace(PUNCT_RE, '');
}

/**
 * @param {Array<{text:string}>} quotes
 * @param {string} sourceText 原文
 * @param {{minLen?:number}} opts
 * @returns {Array} 带上 verified 字段
 */
export function verifyQuotes(quotes, sourceText, { minLen = 6 } = {}) {
  const src = normalizeForMatch(sourceText);
  return (quotes || [])
    .filter((q) => q && typeof q.text === 'string' && q.text.trim())
    .map((q) => {
      const norm = normalizeForMatch(q.text);
      const verified = norm.length >= minLen && src.includes(norm);
      return { ...q, text: q.text.trim(), verified };
    });
}

export function verifiedRate(quotes) {
  if (!quotes || !quotes.length) return 1;
  return quotes.filter((q) => q.verified).length / quotes.length;
}

/** 汇总里的 Top 金句：先在各篇已校验金句里找，找不到再回原文找 */
export function verifyRecite(items, issue) {
  const quoteIndex = new Map();
  for (const a of issue.articles) {
    for (const q of a.ai?.quotes || []) {
      if (q.verified) quoteIndex.set(normalizeForMatch(q.text), a.id);
    }
  }
  const textIndex = new Map(issue.articles.map((a) => [a.id, normalizeForMatch(a.text || '')]));

  return (items || [])
    .filter((it) => it && typeof it.text === 'string' && it.text.trim())
    .map((it) => {
      const norm = normalizeForMatch(it.text);
      let articleId = it.articleId || '';
      let verified = false;

      if (quoteIndex.has(norm)) {
        verified = true;
        articleId = articleId || quoteIndex.get(norm);
      } else if (articleId && textIndex.get(articleId)?.includes(norm)) {
        verified = true;
      } else {
        for (const [id, text] of textIndex) {
          if (text.includes(norm)) { verified = true; articleId = id; break; }
        }
      }
      return { ...it, articleId, verified };
    });
}
