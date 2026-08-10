# sagiggun 배포 기록 — 2026-08-10

## 현재 구성

- GCP project: `haruto-snow`
- Cloud Run: `sagiggun`, region `asia-northeast3`
- 현재 revision: `sagiggun-00002-28m`, traffic 100%
- 직접 origin: `https://sagiggun-w4ywua36ca-du.a.run.app`
- Cloud SQL: 기존 `moonlit-prod` 인스턴스 재사용
- 애플리케이션 DB/user: `sagiggun` / `sagiggun_app`
- Artifact Registry: `asia-northeast3-docker.pkg.dev/haruto-snow/sagiggun/sagiggun`
- 사진 버킷: `gs://sagiggun-photos`
- 공개 URL: `https://love.nngn.ai`
- Cloudflare Worker: `sagiggun-proxy`

Cloud SQL 새 인스턴스는 만들지 않는다. 배포 스크립트도 기존 인스턴스가 없으면
실패하도록 되어 있다. `sagiggun-pg`는 배포 시도 중 임시로 생성되었으나 빈 상태에서
삭제했다.

## 배포 상태

PR #5가 `356b8fcc687711e60e124da594e70f318f5d3867`로 main에 merge된 뒤,
Cloud Build `4bc01160-89d0-42de-8f37-8f7461b348cf`로 `sagiggun-00002-28m`을
배포했다. 현재 runtime 설정은 `LLM_MODE=mock`, `LLM_PROVIDER=openai`,
`LLM_MODEL=gpt-5.6-luna`, `LLM_REASONING=high`다. 유효한 OpenAI 키가 준비되기 전까지
실제 LLM 호출은 활성화하지 않는다.

배포 후 검증은 direct/public login 200, 무인증 API 401, OPS 인증 API 200, CORS
preflight 204, 공개 반복 확인 5/5였다.

첫 배포는 유효한 Anthropic API 키가 로컬에 없어 `LLM_MODE=mock` substitution으로
진행했다. 현재 Secret Manager에는 앱 시크릿 6개가 있으며, 관리자 비밀번호·세션
시크릿·OPS 토큰은 랜덤 생성값이다. 값 자체는 이 문서나 저장소에 기록하지 않는다.

`sagiggun-openai-api-key`는 provider 전환 준비를 위해
`disabled-until-configured` placeholder로 만들었으며, 실제 OpenAI 키가 들어가기
전에는 OpenAI live 배포를 하지 않는다.

관리자 비밀번호와 확장용 OPS 토큰 조회:

```bash
gcloud secrets versions access latest --secret=sagiggun-admin-password --project=haruto-snow
gcloud secrets versions access latest --secret=sagiggun-ops-api-token --project=haruto-snow
```

실제 LLM 연동 시 선택한 provider의 유효한 키를 Secret Manager에 추가하고 다음처럼
재배포한다. 기본은 OpenAI다.

```bash
cd web
gcloud builds submit --config=cloudbuild.yaml --project=haruto-snow \
  --substitutions=_LLM_MODE=live,_LLM_PROVIDER=openai,_LLM_MODEL=gpt-5.6-luna,_LLM_REASONING=high .
```

배포 후 관리자 로그인 화면의 `설정` 메뉴(`/admin/settings`)에서 실행 모드, provider,
모델, reasoning, OpenAI/Anthropic API 키를 변경할 수 있다. 키 입력값은 응답이나 화면에
다시 표시하지 않고 `sagiggun-llm-config` Secret Manager의 새 버전으로 저장한다. 빈 키로
저장하면 기존 키를 유지하며, 저장된 키 삭제 체크박스로 명시적으로 제거할 수 있다.
Secret Manager 리소스가 없는 로컬 환경에서는 읽기 전용으로 표시된다.

## LLM provider 전환

LiteLLM Proxy는 추가하지 않고 애플리케이션 내부 provider adapter로 전환을 지원한다.
기본값은 OpenAI `gpt-5.6-luna` / reasoning `high`이며, Anthropic을 사용할 때는
`LLM_PROVIDER=anthropic`과 `ANTHROPIC_API_KEY`를 지정한다. 현재 배포 revision은
기존과 같이 mock이며, 유효한 키를 넣기 전에는 OpenAI live로 전환하지 않는다.

```bash
cd web
gcloud builds submit --config=cloudbuild.yaml --project=haruto-snow \
  --substitutions=_LLM_MODE=live,_LLM_PROVIDER=openai,_LLM_MODEL=gpt-5.6-luna,_LLM_REASONING=high .
```

로컬·배포 설정은 `LLM_MODE`, `LLM_PROVIDER`, `LLM_MODEL`과 provider에 맞는
`ANTHROPIC_API_KEY` 또는 `OPENAI_API_KEY`를 사용한다. mock 모드에서는 provider 키가
필수가 아니다.

## Cloudflare 연결

`cloudflare/worker/wrangler.jsonc`에 다음을 고정한다.

- `ORIGIN_URL`: Cloud Run project-number URL
- `CANONICAL_HOST`: `love.nngn.ai`
- custom domain route: `love.nngn.ai`
- Workers invocation logs: enabled

Cloudflare API MCP로 Worker를 업로드하고 `nngn.ai` zone의 Custom Domain을
`sagiggun-proxy`에 연결했다. 로컬 Wrangler 검증:

```bash
cd cloudflare/worker
npx wrangler@latest deploy --dry-run
```

## 검증 결과

- Cloud Run `/admin/login`: 200
- Cloud Run `GET /api/profiles` with OPS Bearer: 200
- Cloudflare `https://love.nngn.ai/admin/login`: 200
- 공개 무인증 `GET /api/profiles`: 401
- 공개 OPS Bearer `GET /api/profiles`: 200, 초기 응답 `{"profiles":[]}`
- 공개 CORS preflight: 204
- `git diff --check`: 통과
- 최종 Worker 요청 12회 연속: login/API 모두 200

확장 설정의 API Base URL은 `https://love.nngn.ai`를 사용한다.
