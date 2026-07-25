# Next.js 前端（standalone 产物，不带完整 node_modules）
# 构建上下文 = web/

# ── 依赖层：只随 package.json / yarn.lock 变化而失效 ──────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 600000

# ── 构建层 ────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 读侧是 RSC 直读文件系统 + force-dynamic，构建期不访问语料，无需挂载数据卷
ENV NEXT_TELEMETRY_DISABLED=1
RUN yarn build

# ── 运行层 ────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3456 \
    HOSTNAME=0.0.0.0
# 非 root 运行；数据卷的属主需与之匹配（见 docker-compose.yml 的 user 设置）
RUN groupadd -r kb && useradd -r -g kb kb

COPY --from=builder /app/public ./public
COPY --from=builder --chown=kb:kb /app/.next/standalone ./
COPY --from=builder --chown=kb:kb /app/.next/static ./.next/static

USER kb
EXPOSE 3456
# standalone 产物自带 server.js
CMD ["node", "server.js"]
