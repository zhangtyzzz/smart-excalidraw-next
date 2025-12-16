# --- build stage ---
FROM node:20 AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm i -g pnpm
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# --- runtime stage ---
FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production

# Render 通常会注入 PORT；这里给个默认值
ENV PORT=10000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

RUN npm i -g pnpm && pnpm install --prod --frozen-lockfile

EXPOSE 10000

# 把端口/host 透传给 next start（多数 Next 脚本都支持）
CMD ["sh", "-c", "pnpm start -- -p ${PORT} -H 0.0.0.0"]
