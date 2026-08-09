#!/usr/bin/env bash
# 01 — Artifact Registry + (optional) photos GCS bucket
set -euo pipefail
: "${GCP_PROJECT_ID:?}"
REGION="${GCP_REGION:-asia-northeast3}"
REPO="${AR_REPO:-sagiggun}"
SERVICE="${SERVICE_NAME:-sagiggun}"

gcloud artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1 \
  || gcloud artifacts repositories create "$REPO" \
      --repository-format=docker \
      --location="$REGION" \
      --description="sagiggun images"

gsutil ls -b "gs://${SERVICE}-photos" >/dev/null 2>&1 \
  || gsutil mb -l "$REGION" "gs://${SERVICE}-photos"

echo "Artifact Registry: $REGION/$REPO"
echo "Photos bucket: gs://${SERVICE}-photos"
