# 求是备考提炼站 —— 单镜像部署（Node + Chromium）
#
# 基础镜像可用 build-arg 换成国内加速地址（默认官方）：
#   docker build --build-arg NODE_IMAGE=docker.m.daocloud.io/library/node:22-bookworm-slim .
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE}

# ---------- 系统依赖 ----------
# Chromium 用于「导出 PDF」，Noto CJK 用于中文排版（否则 PDF 会出方块）
#
# apt 换清华源：bookworm 用 deb822 格式的 /etc/apt/sources.list.d/debian.sources，
# 只有这一个文件；顺手兼容老格式的 /etc/apt/sources.list。
# 这里保持 http 而非 https——slim 镜像可能没有 ca-certificates，先用 http 装完再切会有鸡生蛋问题；
# Debian 包本身有 GPG 签名校验，http 不影响完整性。
# 若清华源在你的机房不可达，把下面两个域名换成 mirrors.aliyun.com 即可。
ARG APT_MIRROR=mirrors.tuna.tsinghua.edu.cn
RUN set -eux; \
    for f in /etc/apt/sources.list.d/debian.sources /etc/apt/sources.list; do \
      if [ -f "$f" ]; then \
        sed -i \
          -e "s|http://deb.debian.org|http://${APT_MIRROR}|g" \
          -e "s|http://security.debian.org|http://${APT_MIRROR}|g" \
          "$f"; \
      fi; \
    done; \
    apt-get update -o Acquire::Retries=3; \
    apt-get install -y --no-install-recommends \
      chromium \
      fonts-noto-cjk \
      fonts-noto-cjk-extra \
      ca-certificates \
      tzdata; \
    rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Shanghai \
    NODE_ENV=production \
    CHROME_PATH=/usr/bin/chromium

WORKDIR /app

# ---------- Node 依赖 ----------
# npm 换 npmmirror。注意 package-lock.json 里的 resolved 地址仍指向 registry.npmjs.org，
# npm ≥8.15 的 replace-registry-host 默认值 npmjs 会自动把这些 host 替换成上面设置的 registry。
ARG NPM_REGISTRY=https://registry.npmmirror.com
COPY package*.json ./
RUN npm config set registry "${NPM_REGISTRY}" \
    && npm ci --omit=dev \
    && npm cache clean --force

COPY . .

ENV HOST=0.0.0.0 \
    PORT=5178

EXPOSE 5178

# 数据（期号 JSON、配图、导出的 PDF）都在这里，建议挂卷
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5178)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
