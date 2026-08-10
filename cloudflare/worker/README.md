# sagiggun Cloudflare Worker proxy

Cloud Run `run.app` origin 앞에 Cloudflare Worker를 두기 위한 최소 프록시입니다.
Worker에는 비밀값을 넣지 않고, origin URL은 Wrangler `--var`로 주입합니다.

## 로컬 확인

```bash
cp .dev.vars.example .dev.vars
npx wrangler@latest dev
```

## 배포 dry-run

```bash
export CLOUD_RUN_URL='https://<cloud-run-service>.run.app'
npx wrangler@latest deploy --dry-run --var "ORIGIN_URL:${CLOUD_RUN_URL}"
```

## 배포

```bash
npx wrangler@latest login
npx wrangler@latest deploy --var "ORIGIN_URL:${CLOUD_RUN_URL}"
```

초기에는 `workers.dev` 주소로 smoke test를 수행합니다. 실제 운영 hostname을 붙일 때는
Cloudflare Custom Domain을 사용하거나 `wrangler.jsonc`에 실제 domain route를 추가합니다.
도메인·zone/account가 정해지기 전에는 route를 저장소에 넣지 않습니다.

Worker는 모든 HTTP method/body/query를 Cloud Run으로 전달하고, `Host`는 origin에 맞기도록
다시 계산됩니다. `X-Forwarded-Host`와 `X-Forwarded-Proto`만 외부 요청값을 덮어써서
Next.js가 원래 공개 hostname을 알 수 있게 합니다.
