# GCP Cloud Run 배포 (nngn-ops / nngn-template 패턴)

서울(`asia-northeast3`) Cloud Run에는 공식 Domain Mapping이 없습니다.  
커스텀 도메인은 [nngn-ops Cloudflare Worker 프록시](https://github.com/...) 런북과 같이 Cloudflare Worker로 `*.run.app`에 붙입니다.  
참고: `kontext/nngn/nngn-ops/runbooks/cloud-run-cloudflare-proxy.md`

## 구성

| 리소스 | 이름(기본) |
|---|---|
| Cloud Run | `sagiggun` |
| Artifact Registry | `sagiggun` (docker, asia-northeast3) |
| Cloud SQL | `sagiggun-pg` (Postgres 16, db-f1-micro) |
| GCS | `sagiggun-photos` (`PHOTO_BUCKET`) |
| Runtime SA | `sa-sagiggun-run@PROJECT.iam.gserviceaccount.com` |
| Secrets | `sagiggun-database-url`, `…-admin-password`, `…-session-secret`, `…-anthropic-api-key`, `…-ops-api-token` |

사진은 Cloud Run 로컬 디스크가 ephemeral이라 **GCS(`PHOTO_BUCKET`)를 써야 합니다.**  
로컬/docker-compose는 `PHOTO_DIR` 파일 저장을 유지합니다.

## 최초 1회

```bash
cd web
export GCP_PROJECT_ID=YOUR_PROJECT   # placeholder — 실제 프로젝트로 교체
export GCP_REGION=asia-northeast3
export DB_PASS='…'                   # 강한 비밀번호
export ADMIN_PASSWORD='…'
export SESSION_SECRET="$(openssl rand -hex 32)"
export ANTHROPIC_API_KEY='sk-ant-…'
export OPS_API_TOKEN="$(openssl rand -hex 16)"

chmod +x infra/scripts/*.sh
./infra/scripts/00-enable-apis.sh
./infra/scripts/01-artifact-and-bucket.sh
./infra/scripts/02-cloud-sql.sh        # 출력 DATABASE_URL을 export
export DATABASE_URL='postgresql://…' # 02 출력값
./infra/scripts/03-secrets-and-sa.sh
```

Cloud Build 기본 SA에 Artifact Registry Writer + Cloud Run Admin + Service Account User를 부여하세요.

## 배포

```bash
cd web
gcloud builds submit --config cloudbuild.yaml --project="$GCP_PROJECT_ID" .
gcloud run services describe sagiggun --region=asia-northeast3 --format='value(status.url)'
```

이미지 `CMD`가 `prisma migrate deploy` 후 `next start`(PORT=8080)를 실행합니다.

## 확장 연동

1. Secret `OPS_API_TOKEN`과 동일 값을 확장 옵션에 저장
2. API Base URL = Cloudflare 도메인 또는 `*.run.app` URL
3. 확장은 Bearer로만 `/api/*` 호출 (관리 HTML은 세션 로그인)

## 롤백

```bash
gcloud run revisions list --service=sagiggun --region=asia-northeast3
gcloud run services update-traffic sagiggun --region=asia-northeast3 \
  --to-revisions=REVISION=100
```

## e2e (배포 전 로컬)

```bash
cd web
chmod +x scripts/e2e-prepare.sh
./scripts/e2e-prepare.sh
pnpm test:e2e
```

`LLM_MODE=mock`으로 Claude를 호출하지 않고 시드·결정적 픽스처로 검증합니다.
