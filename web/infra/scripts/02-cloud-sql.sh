#!/usr/bin/env bash
# 02 — Existing Cloud SQL Postgres database/user
set -euo pipefail
: "${GCP_PROJECT_ID:?}"
REGION="${GCP_REGION:-asia-northeast3}"
INSTANCE="${SQL_INSTANCE:-moonlit-prod}"
DB_NAME="${DB_NAME:-sagiggun}"
DB_USER="${DB_USER:-sagiggun_app}"
DB_PASS="${DB_PASS:?set DB_PASS}"

if ! gcloud sql instances describe "$INSTANCE" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  echo "Existing Cloud SQL instance not found: $INSTANCE (no instance will be created)" >&2
  exit 1
fi

gcloud sql databases describe "$DB_NAME" --instance="$INSTANCE" >/dev/null 2>&1 \
  || gcloud sql databases create "$DB_NAME" --instance="$INSTANCE"

# 사용자 생성은 멱등이 아니므로 실패를 허용
gcloud sql users create "$DB_USER" --instance="$INSTANCE" --password="$DB_PASS" 2>/dev/null || true

# Cloud Run 연결용 Unix 소켓 URL
# postgresql://USER:PASS@localhost/DB?host=/cloudsql/PROJECT:REGION:INSTANCE
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost/${DB_NAME}?host=/cloudsql/${GCP_PROJECT_ID}:${REGION}:${INSTANCE}"
echo "DATABASE_URL (store in Secret Manager):"
echo "$DATABASE_URL"
