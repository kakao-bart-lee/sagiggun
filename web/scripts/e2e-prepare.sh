#!/usr/bin/env bash
# e2e 사전 준비: postgres → migrate → seed → build
set -euo pipefail
cd "$(dirname "$0")/.."

export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:15433/matching}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-e2e-admin-password}"
export SESSION_SECRET="${SESSION_SECRET:-e2e-session-secret-at-least-32-chars!!}"
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-sk-ant-e2e-mock}"
export OPS_API_TOKEN="${OPS_API_TOKEN:-e2e-ops-token-16chars}"
export LLM_MODE=mock
export PHOTO_DIR="${PHOTO_DIR:-./.photos-e2e}"

pnpm infra:up
# DB ready
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U postgres -d matching >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

pnpm exec prisma migrate deploy
pnpm db:seed
pnpm build
echo "e2e prepare done"
