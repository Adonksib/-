/** 可选的整站访问口令。
 *  未设置 ACCESS_PASSWORD 时完全不加锁（默认：链接给谁谁都能看）；
 *  设置了就启用 HTTP Basic Auth，健康检查与静态资源之外的页面都需要口令。
 */
import crypto from 'node:crypto';

const PASSWORD = process.env.ACCESS_PASSWORD || '';

export const authEnabled = Boolean(PASSWORD);

function safeEqual(a, b) {
  const ab = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function basicAuth(req, res, next) {
  if (!authEnabled) return next();
  // 健康检查放行，否则容器 HEALTHCHECK 永远不通过
  if (req.path === '/api/health') return next();

  const header = req.headers.authorization || '';
  const m = header.match(/^Basic\s+(.+)$/i);
  if (m) {
    let decoded = '';
    try {
      decoded = Buffer.from(m[1], 'base64').toString('utf8');
    } catch {
      decoded = '';
    }
    const idx = decoded.indexOf(':');
    const pass = idx >= 0 ? decoded.slice(idx + 1) : decoded;
    if (safeEqual(pass, PASSWORD)) return next();
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="qstheory-notes", charset="UTF-8"');
  return res.status(401).type('text/plain; charset=utf-8').send('需要访问口令');
}
