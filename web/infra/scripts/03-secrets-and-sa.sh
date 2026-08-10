#!/usr/bin/env bash
# 03 — Secret Manager + SA
set -euo pipefail
: "${GCP_PROJECT_ID:?}"
SERVICE="${SERVICE_NAME:-sagiggun}"
SA_NAME="sa-${SERVICE}-run"
SA_EMAIL="${SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
REGION="${GCP_REGION:-asia-northeast3}"
INSTANCE="${SQL_INSTANCE:-moonlit-prod}"

gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1 \
  || gcloud iam service-accounts create "$SA_NAME" --display-name="sagiggun Cloud Run"

# Cloud SQL client + secrets + GCS
gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/cloudsql.client" --condition=None >/dev/null
gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" --condition=None >/dev/null
gsutil iam ch "serviceAccount:${SA_EMAIL}:roles/storage.objectAdmin" "gs://${SERVICE}-photos" || true

upsert_secret() {
  local name="$1" value="$2"
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    echo -n "$value" | gcloud secrets versions add "$name" --data-file=-
  else
    echo -n "$value" | gcloud secrets create "$name" --data-file=-
  fi
  gcloud secrets add-iam-policy-binding "$name" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" >/dev/null
}

: "${DATABASE_URL:?export DATABASE_URL from 02-cloud-sql.sh}"
: "${ADMIN_PASSWORD:?}"
: "${SESSION_SECRET:?}"
: "${ANTHROPIC_API_KEY:?}"
: "${OPENAI_API_KEY:=disabled-until-configured}"
: "${OPS_API_TOKEN:?}"
LLM_CONFIG_JSON="${LLM_CONFIG_JSON:-}"
if [[ -z "$LLM_CONFIG_JSON" ]]; then
  LLM_CONFIG_JSON='{"version":1,"mode":"mock","provider":"openai","model":"gpt-5.6-luna","reasoning":"high","openaiApiKey":"","anthropicApiKey":""}'
fi

upsert_secret "${SERVICE}-database-url" "$DATABASE_URL"
upsert_secret "${SERVICE}-admin-password" "$ADMIN_PASSWORD"
upsert_secret "${SERVICE}-session-secret" "$SESSION_SECRET"
upsert_secret "${SERVICE}-anthropic-api-key" "$ANTHROPIC_API_KEY"
upsert_secret "${SERVICE}-openai-api-key" "$OPENAI_API_KEY"
upsert_secret "${SERVICE}-ops-api-token" "$OPS_API_TOKEN"

# UI가 저장할 런타임 LLM 설정. 이미 있으면 UI에서 저장한 버전을 보존한다.
if ! gcloud secrets describe "${SERVICE}-llm-config" >/dev/null 2>&1; then
  echo -n "$LLM_CONFIG_JSON" | gcloud secrets create "${SERVICE}-llm-config" --data-file=-
fi
gcloud secrets add-iam-policy-binding "${SERVICE}-llm-config" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" >/dev/null
gcloud secrets add-iam-policy-binding "${SERVICE}-llm-config" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.secretVersionAdder" >/dev/null
gcloud secrets add-iam-policy-binding "${SERVICE}-llm-config" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.secretVersionManager" >/dev/null

# Cloud Build SA needs run admin / ar writer — usually the default Cloud Build SA
echo "Secrets + SA ready: $SA_EMAIL"
echo "SQL instance: $GCP_PROJECT_ID:$REGION:$INSTANCE"
