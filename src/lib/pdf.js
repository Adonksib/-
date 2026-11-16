import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { loadSettings } from '../config.js';
import { ensureParent } from './paths.js';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

/** 定位浏览器 */
export function findBrowser() {
  const custom = loadSettings().chromePath;
  const list = custom ? [custom, ...CANDIDATES] : CANDIDATES;
  for (const p of list) {
    if (p && fs.existsSync(p)) {
      const name = /msedge/i.test(p) ? 'Microsoft Edge' : /chrome/i.test(p) ? 'Google Chrome' : path.basename(p);
      return { path: p, name };
    }
  }
  return null;
}

const tmpDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

/** 容器里以 root 运行时 Chromium 必须关沙箱，且 /dev/shm 默认仅 64MB 会崩 */
const NO_SANDBOX = process.env.CHROME_NO_SANDBOX !== '0';

/**
 * 用 headless 浏览器的打印管线生成 PDF。
 * 说明：这里刻意不用 CDP 的 Page.printToPDF —— 实测在多图长文档上
 * 它会长时间不返回（二分定位到含图片的文章累计后必然卡住），
 * 而 --print-to-pdf 走的是另一条更稳的管线，同一文档 2~3 秒完成。
 */
function printViaCLI({ browserPath, url, userDataDir, outPath, timeoutMs = 90000 }) {
  return new Promise((resolve, reject) => {
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--hide-scrollbars',
      '--run-all-compositor-stages-before-draw',
      '--virtual-time-budget=10000',
      '--window-size=1240,1754',
      '--no-pdf-header-footer',
      ...(NO_SANDBOX ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
      `--user-data-dir=${userDataDir}`,
      `--print-to-pdf=${outPath}`,
      url,
    ];
    const proc = spawn(browserPath, args, { stdio: 'ignore', windowsHide: true });
    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* 忽略 */ }
      reject(new Error('PDF 打印超时（90 秒），请稍后重试或检查浏览器是否可用'));
    }, timeoutMs);

    proc.on('exit', () => {
      clearTimeout(timer);
      try {
        if (fs.existsSync(outPath) && fs.statSync(outPath).size > 2000) {
          resolve(fs.readFileSync(outPath));
        } else {
          reject(new Error('PDF 生成失败（输出文件为空）'));
        }
      } catch (e) {
        reject(e);
      }
    });
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`无法启动浏览器：${e.message}`));
    });
  });
}

/** 给每页底部盖「页码 / 总页数」，封面不盖 */
async function stampPageNumbers(pdfBytes, { skipFirst = true } = {}) {
  try {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();
    const total = pages.length;
    pages.forEach((page, i) => {
      if (skipFirst && i === 0) return;
      const label = `${i + 1} / ${total}`;
      const size = 8;
      const { width } = page.getSize();
      const textWidth = font.widthOfTextAtSize(label, size);
      page.drawText(label, {
        x: (width - textWidth) / 2,
        y: 22,
        size,
        font,
        color: rgb(0.62, 0.6, 0.56),
      });
    });
    return Buffer.from(await doc.save());
  } catch (e) {
    console.warn('[pdf] 页码标注失败，返回原始 PDF：', e.message);
    return pdfBytes;
  }
}

/**
 * 导出 PDF
 * @param {{url:string, outPath:string, stampNumbers?:boolean}} opts
 */
export async function exportPdf({ url, outPath, stampNumbers = true }) {
  const browser = findBrowser();
  if (!browser) {
    throw new Error(
      '未找到 Chrome 或 Edge。容器部署请设置环境变量 CHROME_PATH（如 /usr/bin/chromium）；本机部署请安装 Chrome。',
    );
  }
  ensureParent(outPath);
  const workDir = tmpDir('qspdf-');
  const profDir = tmpDir('qsprof-');
  const asciiTmp = path.join(workDir, 'out.pdf');

  try {
    let buf = await printViaCLI({
      browserPath: browser.path,
      url,
      userDataDir: profDir,
      outPath: asciiTmp,
    });

    if (stampNumbers) buf = await stampPageNumbers(buf);

    fs.writeFileSync(outPath, buf);
    return { bytes: buf.length, engine: `${browser.name}（headless 打印）`, browser: browser.name };
  } finally {
    // Chrome 的 profile 目录不清理会一直堆在 /tmp，容器长时间运行会撑满磁盘
    for (const d of [workDir, profDir]) {
      try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* 忽略 */ }
    }
  }
}
