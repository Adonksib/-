import { chatJSON } from './client.js';
import { SUMMARY_SYSTEM, buildSummaryUser } from './prompts.js';
import { verifyRecite } from './verify.js';

const asArray = (v) => (Array.isArray(v) ? v : []);
const asStr = (v) => (typeof v === 'string' ? v.trim() : '');

/** 权重归一化到 1 */
function normalizeWeights(list) {
  const items = list.filter((x) => x.theme);
  const total = items.reduce((s, x) => s + (Number(x.weight) || 0), 0);
  if (!items.length) return items;
  if (total <= 0) {
    const w = Number((1 / items.length).toFixed(3));
    return items.map((x, i) => ({ ...x, weight: i === items.length - 1 ? Number((1 - w * (items.length - 1)).toFixed(3)) : w }));
  }
  let acc = 0;
  return items.map((x, i) => {
    const w = i === items.length - 1
      ? Number((1 - acc).toFixed(3))
      : Number(((Number(x.weight) || 0) / total).toFixed(3));
    acc = Number((acc + w).toFixed(3));
    return { ...x, weight: w };
  });
}

function normalizeSummary(raw, issue, usage) {
  const exam = raw?.examForecast || {};
  const validIds = new Set(issue.articles.map((a) => a.id));
  const pickIds = (v) => asArray(v).map(asStr).filter((id) => validIds.has(id));

  return {
    generatedAt: new Date().toISOString(),
    overview: asStr(raw?.overview),
    themeMap: normalizeWeights(
      asArray(raw?.themeMap).map((t) => ({
        theme: asStr(t?.theme),
        weight: Number(t?.weight) || 0,
        articleIds: pickIds(t?.articleIds),
        note: asStr(t?.note),
      })).filter((t) => t.theme),
    ).slice(0, 6),
    hotwords: asArray(raw?.hotwords).map((h) => ({
      word: asStr(h?.word),
      count: Number(h?.count) || 0,
      articleIds: pickIds(h?.articleIds),
      note: asStr(h?.note),
    })).filter((h) => h.word).slice(0, 15),
    mustKnow: asArray(raw?.mustKnow).map((m) => ({
      title: asStr(m?.title),
      articleId: validIds.has(asStr(m?.articleId)) ? asStr(m.articleId) : '',
      why: asStr(m?.why),
      points: asArray(m?.points).map(asStr).filter(Boolean).slice(0, 6),
    })).filter((m) => m.title).slice(0, 5),
    reciteTop10: verifyRecite(
      asArray(raw?.reciteTop10).map((q) => ({
        text: asStr(q?.text),
        articleId: asStr(q?.articleId),
        type: asStr(q?.type) || '原文论断',
        verified: false,
      })).filter((q) => q.text),
      issue,
    ).slice(0, 10),
    examForecast: {
      shenlun: asArray(exam.shenlun).map((x) => ({
        topic: asStr(x?.topic),
        angle: asStr(x?.angle),
        articleIds: pickIds(x?.articleIds),
      })).filter((x) => x.topic).slice(0, 4),
      interview: asArray(exam.interview).map((x) => ({
        topic: asStr(x?.topic),
        questions: asArray(x?.questions).map(asStr).filter(Boolean).slice(0, 4),
      })).filter((x) => x.topic).slice(0, 4),
      changshi: asArray(exam.changshi).map((x) => ({
        topic: asStr(x?.topic),
        points: asArray(x?.points).map(asStr).filter(Boolean).slice(0, 6),
      })).filter((x) => x.topic).slice(0, 5),
    },
    studyPlan: asArray(raw?.studyPlan).map((p, i) => ({
      day: Number(p?.day) || i + 1,
      focus: asStr(p?.focus),
      articleIds: pickIds(p?.articleIds),
    })).filter((p) => p.focus).slice(0, 6),
    usage,
  };
}

/** 本期汇总：输入各篇提炼结果，不喂原文 */
export async function buildSummary(issue, settings) {
  const extracted = issue.articles.filter((a) => a.ai && a.ai.oneline);
  if (!extracted.length) throw new Error('没有可汇总的篇目，请先完成逐篇提炼');

  // 汇总只喂已提炼的篇目，且把原文清空，避免体积过大
  const slim = {
    ...issue,
    articles: extracted.map((a) => ({ ...a, text: String(a.text || '').slice(0, 0) })),
  };

  const { data, usage } = await chatJSON({
    system: SUMMARY_SYSTEM,
    user: buildSummaryUser(slim),
    settings,
    maxTokens: 4000,
    temperature: 0.2,
    label: '本期汇总',
  });

  const summary = normalizeSummary(data, issue, usage);

  const allQuotes = issue.articles.flatMap((a) => a.ai?.quotes || []);
  const verifiedQuotes = allQuotes.filter((q) => q.verified);
  summary.quality = {
    quotesTotal: allQuotes.length,
    quotesVerified: verifiedQuotes.length,
    verifiedRate: allQuotes.length
      ? Number((verifiedQuotes.length / allQuotes.length).toFixed(3))
      : 1,
    reciteVerified: summary.reciteTop10.filter((q) => q.verified).length,
  };

  return summary;
}
