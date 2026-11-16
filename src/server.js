import express from 'express';
import { PORT, HOST, ENABLE_RAW, loadSettings, redactKey } from './config.js';
import { apiRouter } from './routes/api.js';
import { pagesRouter } from './routes/pages.js';
import { basicAuth } from './lib/auth.js';
import { ensureDirs, publicDir, staticRawDir, staticMediaDir } from './lib/paths.js';

ensureDirs();

const app = express();
app.disable('x-powered-by');
// 放在反代之后时，req.ip / 协议判断才正确
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));

// 安全响应头（手写，避免为一个头引入 helmet）
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
  );
  next();
});

// 可选口令：ACCESS_PASSWORD 存在才生效
app.use(basicAuth);

app.use('/assets', express.static(publicDir, { maxAge: '5m' }));
app.use('/media', express.static(staticMediaDir, { maxAge: '1d' }));
// 原始 HTML 是从求是网抓回的整页（含第三方脚本），默认不对外托管
if (ENABLE_RAW) app.use('/raw', express.static(staticRawDir, { maxAge: '1h' }));

app.use('/api', apiRouter);
app.use('/', pagesRouter);

app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: '接口不存在' });
  return res.status(404).type('html').send('<meta charset="utf-8"><p style="font-family:system-ui;padding:40px">页面不存在，<a href="/">返回首页</a></p>');
});

// 统一错误处理：把技术错误翻译成中文提示
app.use((err, req, res, next) => {
  const msg = redactKey(String(err?.message || err));
  console.error('[error]', msg);
  if (req.path.startsWith('/api')) {
    return res.status(err.status || 500).json({ error: msg });
  }
  return res.status(500).type('html').send(
    `<meta charset="utf-8"><div style="font-family:system-ui;padding:40px;max-width:640px">
      <h2>出错了</h2><p style="color:#8c1c13">${msg.replace(/</g, '&lt;')}</p>
      <p><a href="/">返回首页</a></p></div>`,
  );
});

const server = app.listen(PORT, HOST, () => {
  const s = loadSettings();
  console.log('');
  console.log('  求是备考重点提炼站已启动');
  console.log(`  监听：${HOST}:${PORT}`);
  console.log(`  模型：${s.model} @ ${s.baseUrl}${s.apiKey ? '' : '（未配置 Key，只能抓取不能提炼）'}`);
  console.log('');
});

const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
