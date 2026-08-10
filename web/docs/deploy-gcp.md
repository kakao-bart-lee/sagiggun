# GCP Cloud Run 배포 (nngn-ops / nngn-template 패턴)

서울(`asia-northeast3`) Cloud Run에는 공식 Domain Mapping이 없습니다.  
커스텀 도메인은 [nngn-ops Cloudflare Worker 프록시](https://github.com/...) 런북과 같이 Cloudflare Worker로 `*.run.app`에 붙입니다.  
참고: `kontext/nngn/nngn-ops/runbooks/cloud-run-cloudflare-proxy.md`

## 구성

| 리소스 | 이름(기본) |
|---|---|
| Cloud Run | `sagiggun` |
| Artifact Registry | `sagiggun` (docker, asia-northeast3) |
| Cloud SQL | 기존 `moonlit-prod` 인스턴스 안의 `sagiggun` DB (`sagiggun_app` 사용자) |
| GCS | `sagiggun-photos` (`PHOTO_BUCKET`) |
| Runtime SA | `sa-sagiggun-run@PROJECT.iam.gserviceaccount.com` |
| Secrets | `sagiggun-database-url`, `…-admin-password`, `…-session-secret`, `…-anthropic-api-key`, `…-openai-api-key`, `…-ops-api-token` |

사진은 Cloud Run 로컬 디스크가 ephemeral이라 **GCS(`PHOTO_BUCKET`)를 써야 합니다.**  
로컬/docker-compose는 `PHOTO_DIR` 파일 저장을 유지합니다.

## 최초 1회

```bash
cd web
export GCP_PROJECT_ID=YOUR_PROJECT   # placeholder — 실제 프로젝트로 교체
export GCP_REGION=asia-northeast3
export SQL_INSTANCE=moonlit-prod     # 기존 인스턴스 사용, 새 인스턴스는 만들지 않음
export DB_NAME=sagiggun
export DB_USER=sagiggun_app
export DB_PASS='…'                   # 새 DB 사용자 비밀번호
export ADMIN_PASSWORD='…'
export SESSION_SECRET="$(openssl rand -hex 32)"
export ANTHROPIC_API_KEY='sk-ant-…'
# OpenAI로 운영할 때만 실제 키를 넣습니다. 생략하면 mock/Anthropic 준비용 placeholder가 저장됩니다.
export OPENAI_API_KEY='sk-…'
export OPS_API_TOKEN="$(openssl rand -hex 16)"

chmod +x infra/scripts/*.sh
./infra/scripts/00-enable-apis.sh
./infra/scripts/01-artifact-and-bucket.sh
./infra/scripts/02-cloud-sql.sh        # 기존 인스턴스에 DB/사용자 생성, DATABASE_URL 출력
export DATABASE_URL='postgresql://…' # 02 출력값
./infra/scripts/03-secrets-and-sa.sh
```

Cloud Build 기본 SA에 Artifact Registry Writer + Cloud Run Admin + Service Account User를 부여하세요.

## 배포

```bash
cd web
gcloud builds submit --config cloudbuild.yaml --project="$GCP_PROJECT_ID" .
# 기본 OpenAI 설정은 gpt-5.6-luna / reasoning high다. 다른 provider/model을 쓸 때만 덮어쓴다.
# gcloud builds submit --config cloudbuild.yaml --project="$GCP_PROJECT_ID" \
#   --substitutions=_LLM_PROVIDER=anthropic,_LLM_MODEL=claude-sonnet-5,_LLM_REASONING=high .
gcloud run services describe sagiggun --region=asia-northeast3 --format='value(status.url)'
```

이미지 `CMD`가 `prisma migrate deploy` 후 `next start`(PORT=8080)를 실행합니다.

## 확장 연동

1. Secret `OPS_API_TOKEN`과 동일 값을 확장 옵션에 저장
2. API Base URL = Cloudflare 도메인 또는 `*.run.app` URL
3. 확장은 Bearer로만 `/api/*` 호출 (관리 HTML은 세션 로그인)

## Cloudflare Worker 앞단

Cloud Run의 `run.app` 주소를 확장 옵션에 직접 넣지 않고 공개 hostname을 사용할 경우,
저장소의 [`cloudflare/worker`](../../cloudflare/worker) 프록시를 앞단에 배포합니다.
Worker는 Cloud Run URL을 `ORIGIN_URL` 변수로 받아 모든 경로를 전달합니다.

```bash
cd cloudflare/worker
export CLOUD_RUN_URL="$(gcloud run services describe sagiggun \
  --region=asia-northeast3 --format='value(status.url)')"
npx wrangler@latest deploy --dry-run --var "ORIGIN_URL:${CLOUD_RUN_URL}"
npx wrangler@latest deploy --var "ORIGIN_URL:${CLOUD_RUN_URL}"
```

현재 `nngn.ai` zone에 `love.nngn.ai`가 `sagiggun-proxy` Worker의 Custom Domain으로
연결되어 있습니다. 배포 후 확인:

```bash
curl -I https://love.nngn.ai/admin/login
curl -sS https://love.nngn.ai/api/profiles \
  -H "Authorization: Bearer $OPS_API_TOKEN"
curl -i -X OPTIONS https://love.nngn.ai/api/profiles \
  -H 'Origin: https://www.threads.com' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization,content-type'
```

`cloudflare/worker/wrangler.jsonc`에는 `love.nngn.ai`와 Cloud Run origin이 명시되어
있습니다. 초기 배포는 Cloudflare API MCP로 수행했으며, 로컬 Wrangler를 사용할 때는
`npx wrangler@latest deploy --dry-run` 후 `deploy`를 실행합니다.

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

`LLM_MODE=mock`으로 provider API를 호출하지 않고 시드·결정적 픽스처로 검증합니다.
