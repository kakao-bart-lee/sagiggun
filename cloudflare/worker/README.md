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

운영 hostname은 `wrangler.jsonc`의 Custom Domain route로 관리합니다. 현재 배포값은
`love.nngn.ai`이며, Cloudflare가 DNS 레코드와 인증서를 자동으로 관리합니다.

```bash
npx wrangler@latest deploy --dry-run
npx wrangler@latest deploy
```

`wrangler deploy`를 로컬에서 실행하려면 Wrangler 인증이 필요합니다. Codex의 공식
Cloudflare API MCP를 사용하는 경우에도 같은 Worker 이름(`sagiggun-proxy`)과
`love.nngn.ai` custom domain을 사용합니다.
도메인·zone/account가 정해지기 전에는 route를 저장소에 넣지 않습니다.

Worker는 모든 HTTP method/body/query를 Cloud Run으로 전달하고, `Host`는 origin에 맞기도록
다시 계산됩니다. `X-Forwarded-Host`와 `X-Forwarded-Proto`만 외부 요청값을 덮어써서
Next.js가 원래 공개 hostname을 알 수 있게 합니다.
