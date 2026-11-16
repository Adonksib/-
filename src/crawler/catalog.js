import * as cheerio from 'cheerio';

const COLUMN_RE = /^([\u4e00-\u9fa5]{2,8})[│|丨]\s*/;
const TAG_RE = /[（(]([^（）()]{2,8})[）)]\s*$/;

/** 已知栏目名（用于把「深度调研│标题」拆开，也用于容错） */
export const KNOWN_COLUMNS = [
  '深度调研', '文化中国', '学习问答', '求是专访', '本期导读',
  '党员来信', '党刊精选', '统计图表', '是说新语', '求是讲坛',
  '红旗论坛', '社论', '评论', '观察与思考', '调查与研究', '环球视野',
];

export function classify(title, column, tag) {
  if (/^本期导读$/.test(title)) return 'reading';
  if (/^统计图表/.test(title)) return 'chart';
  if (tag === '党员来信') return 'letter';
  if (tag === '党刊精选') return 'digest';
  if (column === '学习问答') return 'qa';
  if (column === '求是专访') return 'interview';
  if (column === '深度调研') return 'research';
  return 'article';
}

/** 去掉作者名中间的空格：王 毅 → 王毅（保留少数民族姓名中的间隔号） */
function normalizeAuthor(name) {
  const s = String(name || '').replace(/\s+/g, ' ').trim();
  if (/^[\u4e00-\u9fa5] [\u4e00-\u9fa5]$/.test(s)) return s.replace(' ', '');
  return s;
}

/**
 * 解析期目录页
 * 结构实测：`#detailContent > p` 每个 p 内一个 `<a href=".../c.html">`（含 <strong> 标题），
 *           其后跟随 ` /<span>作者</span>`；栏目名是 <a> 内的楷体 span，用 │ 与标题分隔。
 * @returns {Array<{index,column,tag,kind,title,author,url}>}
 */
export function parseCatalog(html, baseUrl) {
  const $ = cheerio.load(html);
  let $root = $('#detailContent');
  if (!$root.length) $root = $('#detail');
  if (!$root.length) $root = $('.text');
  if (!$root.length) throw new Error('PARSE_EMPTY：目录页未找到正文容器');

  const items = [];
  const seen = new Set();

  $root.find('p').each((_, p) => {
    const $p = $(p);
    const $a = $p.find('a[href]').first();
    if (!$a.length) return;

    const href = $a.attr('href') || '';
    if (!/\/c\.html$/i.test(href) && !/\/c_\d+\.htm$/i.test(href)) return;

    const rawTitle = $a.text().replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
    if (rawTitle.length < 4) return;

    // 作者在 <a> 之后的文本里，形如 " /习近平"
    const fullText = $p.text().replace(/\u3000/g, ' ').replace(/\s+/g, ' ');
    const afterLink = fullText.slice(fullText.indexOf(rawTitle) + rawTitle.length);
    const slashIdx = afterLink.lastIndexOf('/');
    const author = slashIdx >= 0 ? normalizeAuthor(afterLink.slice(slashIdx + 1)) : '';

    let column = '';
    let title = rawTitle;
    const cn = rawTitle.match(COLUMN_RE);
    if (cn && KNOWN_COLUMNS.includes(cn[1])) {
      column = cn[1];
      title = rawTitle.slice(cn[0].length).trim();
    }

    let tag = '';
    const tn = title.match(TAG_RE);
    if (tn && /来信|精选|专栏|笔谈|访谈|问答|图表/.test(tn[1])) {
      tag = tn[1];
      title = title.replace(TAG_RE, '').trim();
    }

    if (!title || title.length < 2) return;

    let url;
    try {
      url = new URL(href, baseUrl).href;
    } catch {
      return;
    }
    if (seen.has(url)) return;
    seen.add(url);

    items.push({
      index: items.length + 1,
      column,
      tag,
      kind: classify(title, column, tag),
      title,
      author,
      url,
    });
  });

  return items;
}

