FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next build가 라우트 모듈을 정적으로 임포트하면서 prisma.ts 최상위의 getEnv() 호출이
# 실행된다. 이 스테이지에는 .env가 없으므로(.dockerignore) zod 검증만 통과시키는
# 빌드 전용 더미 값을 넣는다 — run 스테이지는 base에서 새로 시작하므로 이 값을 물려받지
# 않고, 실제 값은 Cloud Run/docker-compose가 컨테이너 기동 시 주입한다.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build \
    PHOTO_DIR=/data/photos \
    LLM_MODE=live
RUN export ADMIN_PASSWORD=build-time-placeholder \
    SESSION_SECRET=build-time-placeholder-not-a-real-secret-value \
    ANTHROPIC_API_KEY=build-time-placeholder \
    && pnpm db:generate \
    && pnpm build

FROM base AS run
ENV NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/prisma ./prisma
# prisma migrate deploy(컨테이너 기동 시)가 이 파일을 요구한다.
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/public ./public
EXPOSE 8080
# Cloud Run은 PORT를 주입한다. Next는 PORT를 존중한다.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm start"]
