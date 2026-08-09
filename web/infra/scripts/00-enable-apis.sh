#!/usr/bin/env bash
# 00 — API 활성화 (asia-northeast3 / nngn-ops 패턴)
set -euo pipefail
: "${GCP_PROJECT_ID:?set GCP_PROJECT_ID}"
gcloud config set project "$GCP_PROJECT_ID"
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  storage.googleapis.com \
  iam.googleapis.com
echo "APIs enabled for $GCP_PROJECT_ID"
