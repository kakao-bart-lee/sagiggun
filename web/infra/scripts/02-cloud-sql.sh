#!/usr/bin/env bash
# 02 — Cloud SQL Postgres (db-f1-micro)
set -euo pipefail
: "${GCP_PROJECT_ID:?}"
REGION="${GCP_REGION:-asia-northeast3}"
INSTANCE="${SQL_INSTANCE:-sagiggun-pg}"
DB_NAME="${DB_NAME:-matching}"
DB_USER="${DB_USER:-matching}"
DB_PASS="${DB_PASS:?set DB_PASS}"

if ! gcloud sql instances describe "$INSTANCE" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  gcloud sql instances create "$INSTANCE" \
    --database-version=POSTGRES_16 \
    --tier=db-f1-micro \
    --region="$REGION" \
    --storage-size=10GB \
    --storage-auto-increase \
    --project="$GCP_PROJECT_ID"
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
