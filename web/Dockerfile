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
# 않고, 실제 값은 docker-compose가 컨테이너 기동 시 주입한다.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build \
    ADMIN_PASSWORD=build-time-placeholder \
    SESSION_SECRET=build-time-placeholder-not-a-real-secret-value \
    ANTHROPIC_API_KEY=build-time-placeholder \
    PHOTO_DIR=/data/photos
RUN pnpm db:generate && pnpm build

FROM base AS run
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/prisma ./prisma
# prisma migrate deploy(컨테이너 기동 시 자동 실행, docker-compose.yml의 app.command 참고)가
# 이 파일을 요구한다 — schema.prisma의 datasource 블록에 url이 없고(드라이버 어댑터 패턴이라
# 런타임 클라이언트는 src/lib/prisma.ts가 직접 connectionString을 넘긴다), CLI용 url은
# prisma.config.ts의 datasource.url에서만 옴. 없으면 "The datasource.url property is
# required..." 로 즉시 실패하고 restart: unless-stopped가 재시작 루프를 돈다(실제 재현함).
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["pnpm", "start"]
