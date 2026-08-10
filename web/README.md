# 매칭 관리자

스레드 DM으로 받은 자기소개를 정리해 게시용 문구를 만드는 관리자 웹앱입니다.

## 로컬 실행

```bash
cp .env.example .env
# SESSION_SECRET을 실제 랜덤 값으로 바꾸세요:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
pnpm install
pnpm infra:up
pnpm db:migrate
pnpm dev
```

`http://localhost:3000/admin` 에서 `.env` 의 `ADMIN_PASSWORD` 로 로그인합니다.

## 사용 흐름

1. **새 프로필** — 스레드 핸들, DM 원문, 사진을 올립니다. (확장 「이 대화 수집」으로도 가능)
2. **추출 실행** — LLM이 원문에서 지역·출생연도·키·직업·취미·이상형 등을 뽑습니다. 원문에 없는 항목은 비워 둡니다.
3. **문구 작성** — 추출 항목과 사진을 함께 넣어 게시 문구 초안을 만듭니다.
4. **검수** — 초안을 읽고 고칩니다.
5. **저장하고 승인** — 승인된 문구만 게시할 수 있습니다.
6. **게시됨으로 표시** — Threads에 손으로 올린 뒤, 앱에서 상태와 게시 번호를 남깁니다.
7. **매칭 추천** — 프로필에서 1→N 후보를 LLM이 고르고 양방향 전달 DM 초안을 씁니다. 수락하면 전달 큐에 올라갑니다.
8. **전달** — 확장 전달 큐에서 문구를 삽입한 뒤, 운영자가 Threads에서 보냅니다 (자동 Send 없음).
9. **보관** — 보류한 프로필은 보관하고, 목록 필터로 다시 볼 수 있습니다.

승인 후 문구를 고치면 상태가 초안으로 돌아갑니다. 사람이 다시 봐야 하기 때문입니다.

### 확장 연동

1. `OPS_API_TOKEN`을 `.env`에 16자 이상으로 넣습니다.
2. 확장 옵션에 API Base URL(예: `http://127.0.0.1:3000`)과 같은 토큰을 저장합니다.
3. Threads에서 수집·전달 큐를 사용합니다. Anthropic 키는 확장에 넣지 않습니다.

## 배포

```bash
docker compose up -d --build
```

`ADMIN_PASSWORD`, `SESSION_SECRET` 및 선택한 provider의 API 키를 환경에 넣어야 합니다.
기본 provider는 OpenAI이며 기본 모델은 `gpt-5.6-luna`, reasoning은 `high`입니다.
Anthropic으로 바꾸려면 `LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY=...`를 설정합니다.
모델을 직접 지정하려면 `LLM_MODEL=...`을 사용합니다. 확장 API를 쓰려면
`OPS_API_TOKEN`도 넣습니다. 사진은 `photo_data` 볼륨에 남습니다. 마이그레이션은
컨테이너 시작 시 자동 적용됩니다.

관리자 로그인 후 상단의 「설정」에서 provider·모델·reasoning과 API 키를 입력할 수
있습니다. 배포 환경에서는 키를 Secret Manager에 저장하며, 저장된 키를 화면에 다시
노출하지 않습니다.

### 리버스 프록시가 필요합니다

앱과 postgres 포트는 둘 다 `127.0.0.1` 에만 바인딩되어 있습니다. 즉 기본 상태에서는 같은 호스트에서만 접근할 수 있고, 다른 기기나 인터넷에서는 닿지 않습니다. 외부에 공개하려면 TLS 종료와 `X-Forwarded-For` **덮어쓰기**를 하는 신뢰할 수 있는 리버스 프록시를 앞단에 두고, 그 프록시가 `127.0.0.1:3100` 으로 전달하게 하세요.

프록시 없이 앱 포트를 직접 인터넷에 열지 마세요. 로그인 rate limit(`src/lib/rate-limit.ts`)은 `X-Forwarded-For` 헤더를 그대로 키로 씁니다 — 프록시가 이 헤더를 덮어쓰지 않으면 공격자가 요청마다 가짜 IP를 넣어 rate limit을 통째로 우회할 수 있습니다. 관리자 인증은 비밀번호 하나뿐이고 2단계 인증이 없으므로, 그때 무차별 대입을 막는 장치가 사라집니다.

`docker-compose.yml` 의 postgres 비밀번호는 `postgres` 입니다. 포트를 열거나 다른 호스트에서 붙일 계획이라면 먼저 바꾸세요.

## 개발

```bash
pnpm test        # Vitest
pnpm typecheck   # tsc --noEmit
```

LLM 호출은 테스트에서 주입으로 대체됩니다. 실제 응답 품질은 테스트로 검증하지 않습니다 — 검증 대상은 형식 준수와 상태 기계입니다.

e2e (Playwright, `LLM_MODE=mock` + 시드 데이터):

```bash
chmod +x scripts/e2e-prepare.sh
./scripts/e2e-prepare.sh   # postgres · migrate · seed · build
pnpm test:e2e
```

GCP Cloud Run 배포는 [docs/deploy-gcp.md](docs/deploy-gcp.md) (nngn-ops Cloud Run + Cloudflare 프록시 패턴)를 보세요.

## 알려진 한계

- **Threads Publishing API(서브시스템 3)는 아직 없습니다.** 게시는 손으로 하고, 승인된 프로필에서 「게시됨으로 표시」로 상태·게시 번호(`seq`)만 앱에 남깁니다.
- **전달은 삽입까지입니다.** Threads Send를 자동 클릭하지 않습니다. DM API도 없습니다.
- 확장 수집·삽입은 Threads DOM에 의존합니다. UI가 바뀌면 실패할 수 있으며, 그때는 관리자 붙여넣기·클립보드 폴백을 쓰세요.
- DM CDN 사진은 만료·CORS로 업로드가 실패할 수 있습니다. 관리자에서 사진을 보완하세요.
- 운영자는 한 명을 전제합니다. 계정이 하나뿐이고 권한 구분이 없습니다.
