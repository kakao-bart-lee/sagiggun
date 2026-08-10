# sagiggun 배포 체크리스트

대상은 `web/` Cloud Run 서비스와 선택적인 `cloudflare/worker` 프록시다.
현재 저장소에는 Cloud Run 서비스·Cloudflare hostname이 자동 생성되어 있지 않으므로,
프로젝트·도메인·권한을 확인한 뒤 실행한다.

## Go / No-Go

### 사전 확인

- [ ] 배포할 Git SHA를 기록한다: `git rev-parse HEAD`
- [ ] `gcloud config get-value project`가 의도한 GCP 프로젝트인지 확인한다.
- [ ] `GCP_REGION`, `SERVICE_NAME`, `SQL_INSTANCE`를 확정한다.
- [ ] `ADMIN_PASSWORD`, `SESSION_SECRET(32자 이상)`, `ANTHROPIC_API_KEY`,
      `OPS_API_TOKEN(16자 이상)`을 Secret Manager에 넣을 준비가 되어 있다.
- [ ] `pnpm typecheck`, `pnpm test`, `npm test`, `pnpm build`가 통과한다.
- [ ] `./scripts/e2e-prepare.sh && pnpm test:e2e`가 통과한다.

### 데이터 사전 점검

이번 마이그레이션은 기존 테이블을 변경하지 않고 매칭·전달 테이블을 추가한다.
배포 전 운영 DB에서 기준값을 저장한다.

```sql
SELECT status, COUNT(*) FROM "Profile" GROUP BY status ORDER BY status;
SELECT COUNT(*) AS photos FROM "Photo";
SELECT to_regclass('public."MatchRun"') AS match_run_table;
SELECT to_regclass('public."DeliveryItem"') AS delivery_item_table;
```

기존 `Profile`·`Photo` 건수는 배포 후 동일해야 하며, 새 테이블은 migration 완료 후
생성되어야 한다. 프로덕션에서 `prisma migrate reset`은 실행하지 않는다.

## 배포 순서

```bash
cd web
export GCP_PROJECT_ID='...'
export GCP_REGION='asia-northeast3'
export SERVICE_NAME='sagiggun'
export SQL_INSTANCE='sagiggun-pg'
export DB_PASS='...'
export ADMIN_PASSWORD='...'
export SESSION_SECRET="$(openssl rand -hex 32)"
export ANTHROPIC_API_KEY='...'
export OPS_API_TOKEN="$(openssl rand -hex 16)"

./infra/scripts/00-enable-apis.sh
./infra/scripts/01-artifact-and-bucket.sh
export DATABASE_URL="$(./infra/scripts/02-cloud-sql.sh | tail -n 1)"
./infra/scripts/03-secrets-and-sa.sh
gcloud builds submit --config=cloudbuild.yaml --project="$GCP_PROJECT_ID" .
```

`02-cloud-sql.sh`의 출력 URL은 Secret Manager에 저장할 값이다. Cloud Build가
Cloud Run에서 `prisma migrate deploy`를 실행하므로, 배포 시점의 DB 연결과
Cloud SQL Client 권한이 반드시 준비되어야 한다.

## 배포 직후 검증

```bash
SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" \
  --region="$GCP_REGION" --format='value(status.url)')"

curl -fsS -o /dev/null -w '%{http_code}\n' "$SERVICE_URL/admin/login"
curl -i -X OPTIONS "$SERVICE_URL/api/profiles" \
  -H 'Origin: https://www.threads.com' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization'

gcloud run services describe "$SERVICE_NAME" --region="$GCP_REGION" \
  --format='yaml(status.latestReadyRevisionName,status.traffic)'
```

예상 결과는 `/admin/login` HTTP 200, preflight HTTP 204 및
`Access-Control-Allow-Origin: https://www.threads.com`이다. Bearer API는 실제
`OPS_API_TOKEN`으로 `GET /api/profiles`를 호출해 200과 JSON 응답을 확인한다.

### 데이터 사후 점검

```sql
SELECT status, COUNT(*) FROM "Profile" GROUP BY status ORDER BY status;
SELECT COUNT(*) FROM "Photo";
SELECT COUNT(*) FROM "MatchRun";
SELECT status, COUNT(*) FROM "DeliveryItem" GROUP BY status ORDER BY status;
```

`Profile`·`Photo` baseline이 변하지 않았는지 확인하고, 새 테이블·enum이 존재하는지
확인한다. 사진 업로드 1건과 매칭 추천·전달 큐 1건은 수동으로 확인한다.

## Cloudflare 앞단

Cloud Run URL을 얻은 뒤 Worker를 먼저 dry-run한다.

```bash
cd ../cloudflare/worker
export CLOUD_RUN_URL="$SERVICE_URL"
npx wrangler@latest deploy --dry-run --var "ORIGIN_URL:${CLOUD_RUN_URL}"
npx wrangler@latest login
npx wrangler@latest deploy --var "ORIGIN_URL:${CLOUD_RUN_URL}"
```

초기 `workers.dev` 주소에서 로그인·Bearer API·preflight를 확인한 후 실제 Custom
Domain을 연결한다. Cloudflare zone/domain/account가 정해지기 전에는 route를
자동 생성하지 않는다.

## 롤백

1. `gcloud run revisions list --service="$SERVICE_NAME" --region="$GCP_REGION"`로
   직전 정상 revision을 확인한다.
2. `gcloud run services update-traffic`으로 직전 revision에 트래픽을 되돌린다.
3. DB migration은 이번 배포에서 기존 데이터를 변경하지 않으므로 자동 down migration을
   실행하지 않는다. 코드 rollback 후에도 새 테이블을 읽지 않는 구버전은 유지 가능하다.
4. Cloudflare Worker는 `npx wrangler rollback` 또는 직전 Worker version으로 되돌리고,
   `/admin/login`·preflight·Bearer API를 다시 확인한다.
