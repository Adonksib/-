# 《求是》备考重点提炼站

把每一期《求是》杂志抓下来，用大模型按「申论 + 面试 + 常识」三个视角提炼大概率出题的重点，网页浏览，一键导出 A4 PDF 学习资料。

## 快速开始（本机）

1. 双击 `start.bat`（首次会自动装依赖），浏览器打开 <http://127.0.0.1:5178>
2. 进「设置」填自己的大模型接口 —— 默认 DeepSeek：
   - Base URL：`https://api.deepseek.com`
   - API Key：`sk-...`
   - 模型名：`deepseek-chat`
   - 保存后点「测试连接」，看到「连接正常」即可
3. 回首页点「生成本期」。它会自动检测最新一期，抓取全部文章（约 20 余条），逐篇提炼，再生成本期汇总。**实测 22 篇约 30 分钟，费用约 ¥0.3**。
4. 完成后点「导出 PDF」，得到 A4 排版的学习资料（封面 + 目录 + 本期汇总 + 逐篇要点）。

> 命令行方式：`npm start`，然后访问 <http://127.0.0.1:5178>

## Docker 部署

镜像里已经装好 Chromium 与 Noto CJK 字体，PDF 导出开箱可用。

```bash
cp .env.example .env      # 按需填写 API_KEY / ACCESS_PASSWORD
docker compose up -d --build
```

打开 `http://<服务器IP>:5178` 即可。

- **数据卷**：`./data` 挂到容器 `/app/data`；仓库里那份 `data/` 已含第 22 期成品，挂上去直接能看，新生成的期号也会写回宿主机。
- **换端口**：改 `docker-compose.yml` 的 `ports` 左侧，例如 `8080:5178`。
- **权限**：容器默认以 root 运行，宿主机 `./data` 一般无需额外 chown；若改非 root 用户，需 `chown -R 1000:1000 ./data`。

不用 compose 也可以：

```bash
docker build -t qstheory-notes .
docker run -d --name qstheory -p 5178:5178 --shm-size=512m \
  -e API_KEY=sk-xxx -v "$PWD/data:/app/data" qstheory-notes
```

> `--shm-size` 不能省：Chromium 在容器里对 `/dev/shm` 敏感，默认 64MB 会导致打印崩溃。

### 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `5178` | 监听端口 |
| `HOST` | `127.0.0.1`（镜像内为 `0.0.0.0`） | 监听地址，容器里必须 `0.0.0.0` |
| `ACCESS_PASSWORD` | 空 | 留空 = 任何人可浏览；设置了则整站需要 HTTP Basic Auth 口令（用户名随便填） |
| `API_KEY` | 空 | 大模型 Key。**填了就锁定**，网页设置页对应字段变灰、接口也改不动 |
| `BASE_URL` | 空 | 接口地址，填了同样锁定 |
| `MODEL` | 空 | 模型名，填了同样锁定 |
| `CONCURRENCY` | 空 | 并发数 1–8 |
| `DATA_DIR` | `<项目>/data` | 数据根目录，可指向挂载盘 |
| `CHROME_PATH` | 自动探测 | 浏览器路径，镜像里是 `/usr/bin/chromium` |
| `SELF_URL` | `http://127.0.0.1:$PORT` | 服务端回连自己用的地址（导出 PDF 时 Chromium 访问它） |
| `ENABLE_DEBUG` | `0` | 置 1 才开放 `/api/debug/*` |
| `ENABLE_RAW` | `0` | 置 1 才对外托管抓回来的原始 HTML（含第三方脚本，默认关闭） |

## 数据说明

仓库里包含第 22 期的**提炼结果**（`data/issues`）、**配图**（`data/media`）和**已导出的 PDF**（`data/exports`），不包含原文全文（`data/text`）与原始 HTML（`data/raw`）。

因此：
- 打开网站就能看第 22 期、能下载 PDF
- 但点「重新生成本期」时，因为缺原文缓存，会重新去求是网抓一遍（约 25 个请求）

## 它做什么

- **自动发现最新期**：从求是网「往期目录 → 年度索引」解析期号与目录页链接（期号与 URL 没有算术关系，只能解析）
- **抓取整期**：目录 + 每条正文 + 配图，原始 HTML 与清洗后纯文本都落盘，方便核对
- **分层提炼**：先逐篇提炼（单篇 500–6200 字），再把各篇结果汇总成本期「备考地图」，不会把 8 万字一次性塞给模型
- **金句防编造**：模型给出的每条「可背金句」都会回原文逐字比对；对不上的在网页标灰「未校验」，导出 PDF 时自动剔除。校验率低于 80% 会自动重跑一次
- **三种考法**：申论（主题 / 切入角度 / 可作素材）、面试（可能的问题 + 答题要点）、常识（题干 + 答案 + 依据）
- **PDF 导出**：Chrome/Edge 无头打印，A4、每篇新页起、金句块不跨页断裂、图表页放原图、页脚带页码

## 配置项

配置文件：`config/settings.json`（权限 600，已被 `.gitignore` 排除，不会进仓库）。
容器部署建议改用 `.env` 里的 `API_KEY` / `BASE_URL` / `MODEL`，优先级高于该文件。

| 项 | 说明 |
|---|---|
| `baseUrl` | 兼容 OpenAI 的接口地址。通义 `https://dashscope.aliyuncs.com/compatible-mode/v1`；Kimi `https://api.moonshot.cn/v1`；DeepSeek `https://api.deepseek.com`。不允许指向本机/内网地址 |
| `apiKey` | 你的 Key。接口只返回掩码，日志里自动打码 |
| `model` | 如 `deepseek-chat`、`qwen-plus`、`moonshot-v1-8k` |
| `concurrency` | 并发数，默认 3，太大容易被限流 |
| `minIntervalMs` | 两次调用最小间隔，默认 300ms |
| `chromePath` | 只读展示。要指定浏览器请用 `CHROME_PATH` 环境变量（出于安全考虑不允许网页改） |

## 目录结构

```
src/
  server.js            入口（安全头、可选口令、静态资源）
  config.js            配置（环境变量覆盖 + 字段锁定）
  pipeline.js          抓取 → 逐篇提炼 → 汇总 的编排，支持断点续跑
  crawler/
    discover.js        最新期检测（年度索引解析）
    catalog.js         期目录解析（p 块内 a + 作者）
    article.js         正文解析（#detailContent，三层降级）
    clean.js           清洗（去校对/网站声明/重复标题、小节、※说明）
  ai/
    client.js          模型调用：JSON 模式、降级、重试、并发限流
    prompts.js         全部提示词
    verify.js          金句逐字校验
    extract.js         单篇提炼
    summarize.js       本期汇总
  lib/
    paths.js           路径（DATA_DIR 可改）+ 期号白名单校验
    store.js           JSON 原子读写
    pdf.js             Chrome headless 打印 + pdf-lib 盖页码
    auth.js            可选 HTTP Basic Auth
  views/               页面模板（字符串模板，无引擎）
  routes/              API 与页面路由
public/                app.css（屏显）/ print.css（A4 打印）/ app.js
data/
  issues/2026-22.json  该期主数据（含提炼结果）
  media/2026-22/       文章配图
  exports/             导出的 PDF
  raw/2026-22/         原始 HTML（不入库）
  text/2026-22/        清洗后纯文本（不入库）
scripts/
  crawl.js             命令行抓取（--ai 带上模型提炼）
  probe.js             解析自检
  test-mock.js         用假模型跑通全链路（不花钱）
  mock-server.js       假模型服务（测试用）
Dockerfile             单镜像（Node + Chromium + Noto CJK）
docker-compose.yml     挂卷 + shm_size + 健康检查
.env.example           环境变量模板
```

## 命令行

```bash
node scripts/crawl.js                 # 只抓最新一期正文（不调用模型，不要 Key）
node scripts/crawl.js 2026-22 --ai    # 抓取 + 提炼 + 汇总
node scripts/crawl.js 2026-22 --ai --limit=3   # 只提炼前 3 篇，省钱试水
node scripts/probe.js 2               # 检查解析：目录 22 条 + 第 2 篇正文清洗结果
node scripts/test-mock.js 3           # 假模型跑通链路，验证不改代码有没有坏
```

## 常见问题

**Q：单期要跑多久？**
抓取是串行的（每篇间隔 1 秒左右，对站点友好），主要耗时在模型调用。实测 22 篇并发 3 用了 **29 分 49 秒**，费用 ¥0.32（DeepSeek 价位）。网络慢或限流会更久。

**Q：中途关了网页会丢进度吗？**
不会。每篇抓取和提炼完成都立刻写盘，重进页面再点「生成本期」会跳过已完成的篇目。

**Q：某篇显示「提炼失败」怎么办？**
通常是限流或超时。点「重试失败 N 篇」只重跑失败的，不会重复花钱。

**Q：金句后面标「未校验」是什么意思？**
模型给出的这句话在原文里找不到逐字对应，可能被改写或拼接过。网页上标灰提示，PDF 和背诵清单里不会出现，避免背错原文。

**Q：导出 PDF 报「未找到 Chrome 或 Edge」？**
本机装 Chrome 即可自动探测；容器里设置 `CHROME_PATH=/usr/bin/chromium`，并确认启动时加了 `--shm-size=512m`。

**Q：PDF 里的中文变成方块？**
镜像缺中文字体。本仓库的 Dockerfile 已装 `fonts-noto-cjk`，自定义镜像时别漏。

**Q：PDF 有 10MB 左右？**
因为保留了文章配图和统计图表原图。想要更小的文件，可以在浏览器里打开打印视图，用「另存为 PDF」自定义压缩。

**Q：部署后想限制访问？**
在 `.env` 里设 `ACCESS_PASSWORD=你的口令`，整站会要求 HTTP Basic Auth（用户名随便填）。`/api/health` 例外，供容器健康检查。

## 说明

- 本机运行时默认只监听 `127.0.0.1`，不对局域网开放；Docker 部署由 compose 映射端口对外
- `config/settings.json` 里是明文 Key，已被 `.gitignore` 排除；容器部署建议用 `API_KEY` 环境变量
- 内容版权归求是杂志社所有，抓取的原文与生成的资料仅供个人备考学习使用
- 抓取遵循礼貌原则：串行 + 随机间隔 + 真实 UA，单期约 25 个请求
