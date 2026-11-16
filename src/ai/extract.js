import { chatJSON } from './client.js';
import { ARTICLE_SYSTEM, buildArticleUser, buildChartUser } from './prompts.js';
import { verifyQuotes, verifiedRate } from './verify.js';

const asArray = (v) => (Array.isArray(v) ? v : []);
const asStr = (v) => (typeof v === 'string' ? v.trim() : '');

/** 把模型输出收敛到固定结构，避免字段缺失导致页面崩溃 */
function normalizeAI(raw, { model }) {
  const exam = raw?.exam || {};
  const shenlun = exam.shenlun || {};
  return {
    oneline: asStr(raw?.oneline),
    themes: asArray(raw?.themes).map(asStr).filter(Boolean).slice(0, 6),
    points: asArray(raw?.points)
      .map((p) => ({ point: asStr(p?.point), detail: asStr(p?.detail) }))
      .filter((p) => p.point)
      .slice(0, 8),
    quotes: asArray(raw?.quotes)
      .map((q) => ({
        text: asStr(q?.text),
        anchor: asStr(q?.anchor) || '正文',
        useFor: asArray(q?.useFor).map(asStr).filter(Boolean),
        verified: false,
      }))
      .filter((q) => q.text)
      .slice(0, 10),
    exam: {
      shenlun: {
        topics: asArray(shenlun.topics).map(asStr).filter(Boolean).slice(0, 4),
        essayAngles: asArray(shenlun.essayAngles).map(asStr).filter(Boolean).slice(0, 4),
        usableAs: asArray(shenlun.usableAs).map(asStr).filter(Boolean).slice(0, 5),
      },
      interview: asArray(exam.interview)
        .map((q) => ({
          question: asStr(q?.question),
          answerPoints: asArray(q?.answerPoints).map(asStr).filter(Boolean).slice(0, 6),
        }))
        .filter((q) => q.question)
        .slice(0, 3),
      changshi: asArray(exam.changshi)
        .map((q) => ({
          stem: asStr(q?.stem), answer: asStr(q?.answer), explain: asStr(q?.explain),
        }))
        .filter((q) => q.stem)
        .slice(0, 3),
    },
    keywords: asArray(raw?.keywords).map(asStr).filter(Boolean).slice(0, 10),
    reciteLevel: Math.min(5, Math.max(1, Number(raw?.reciteLevel) || 3)),
    model,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * 单篇提炼
 * @param {object} article 含 text/title/author/column/tag/note/kind/charCount
 * @param {object} settings
 * @param {{onUsage?:Function}} opts
 */
export async function extractArticle(article, settings, { onUsage } = {}) {
  const maxChars = settings.maxInputChars || 12000;
  const fullText = article.text || '';
  const truncated = fullText.length > maxChars;
  const text = truncated ? fullText.slice(0, maxChars) : fullText;
  const isChart = article.kind === 'chart';

  const payload = { ...article, text };
  const user = isChart
    ? buildChartUser(payload)
    : buildArticleUser(payload, { truncated });

  const first = await chatJSON({
    system: ARTICLE_SYSTEM,
    user,
    settings,
    maxTokens: 2600,
    label: article.title,
  });
  let ai = normalizeAI(first.data, { model: settings.model });
  let usage = { ...first.usage };
  ai.quotes = verifyQuotes(ai.quotes, fullText);
  ai.verification = {
    rate: Number(verifiedRate(ai.quotes).toFixed(3)),
    retried: false,
  };

  // 校验率 < 80% 且确有摘录 → 重跑一次
  if (ai.quotes.length && ai.verification.rate < 0.8 && !isChart) {
    const bad = ai.quotes.filter((q) => !q.verified).length;
    const retry = await chatJSON({
      system: ARTICLE_SYSTEM,
      user: `${user}

【重要提醒】你上次给出的 ${bad} 条金句在原文中找不到原句。请重新核对：
quotes[].text 必须是从上面原文中【连续复制】的字符，不能改动一个字，不能拼接两句，不能用自己的话概括。`,
      settings,
      maxTokens: 2600,
      label: `${article.title}（重试）`,
    });
    const ai2 = normalizeAI(retry.data, { model: settings.model });
    ai2.quotes = verifyQuotes(ai2.quotes, fullText);
    ai2.verification = {
      rate: Number(verifiedRate(ai2.quotes).toFixed(3)),
      retried: true,
    };
    usage = {
      prompt_tokens: usage.prompt_tokens + retry.usage.prompt_tokens,
      completion_tokens: usage.completion_tokens + retry.usage.completion_tokens,
    };
    if (ai2.verification.rate >= ai.verification.rate) ai = ai2;
    else ai.verification.rate = Number(verifiedRate(ai.quotes).toFixed(3));
  }

  ai.tokens = usage;
  if (onUsage) onUsage(usage);
  return ai;
}
