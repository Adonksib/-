# 求是备考提炼站 —— 单镜像部署（Node + Chromium）
FROM node:22-bookworm-slim

# Chromium 用于「导出 PDF」，Noto CJK 用于中文排版（否则 PDF 会出方块）
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-noto-cjk \
      fonts-noto-cjk-extra \
      ca-certificates \
      tzdata \
    && rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Shanghai \
    NODE_ENV=production \
    CHROME_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

ENV HOST=0.0.0.0 \
    PORT=5178

EXPOSE 5178

# 数据（期号 JSON、配图、导出的 PDF）都在这里，建议挂卷
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5178)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
