# 매칭 관리자 + 공개 서비스

스레드 DM으로 받은 자기소개를 정리해 게시용 문구를 만드는 관리자 웹앱(`/admin`)과,
스레드 홍보를 대체/보완하는 공개 서비스(`/`)입니다.

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
6. **API로 게시** — 승인된 프로필을 Threads Publishing API로 실제 게시합니다. 앱에서 상태와 게시
   번호(seq), 게시물 id가 함께 남습니다. 최초 1회 `/admin/settings`에서 "Threads 연결"이 필요합니다.
7. **매칭 추천** — 프로필에서 1→N 후보를 LLM이 고르고 양방향 전달 DM 초안을 씁니다. 수락하면 전달 큐에 올라갑니다.
8. **전달** — 확장 전달 큐에서 문구를 삽입한 뒤, 운영자가 Threads에서 보냅니다 (자동 Send 없음).
9. **보관** — 보류한 프로필은 보관하고, 목록 필터로 다시 볼 수 있습니다.

승인 후 문구를 고치면 상태가 초안으로 돌아갑니다. 사람이 다시 봐야 하기 때문입니다.

## Threads API 연동 (최초 1회)

Meta 대시보드 UI가 함정이 많다. 아래 순서와 괄호 안 주의사항을 그대로 따른다.

1. [Meta for Developers](https://developers.facebook.com)에서 앱 생성 → 왼쪽 메뉴 **"이용
   사례"** → **"Access the Threads API"** 추가 → 그 이용 사례의 **"설정"** 화면에서
   **리디렉션 콜백 URL·제거 콜백 URL·삭제 콜백 URL 세 칸을 전부** 채운다. 하나라도 비면
   폼 전체가 조용히 저장 실패한다(에러 문구도 안 뜬다). 이 앱은 제거·삭제 콜백을 아직
   구현하지 않았으므로(호출되면 404) 개발 모드 테스트에는 형식만 맞는 URL이면 된다 — 실제
   심사 단계에서는 두 엔드포인트 구현이 필요하다.
   **리디렉션 콜백 URL은 타이핑 후 반드시 아래 뜨는 드롭다운을 클릭해서 선택해야 값이
   등록된다.** 타이핑만 하고 다른 곳을 클릭하면 화면엔 채워진 것처럼 보이지만 저장 시
   "Redirect URIs: OAuth 리디렉션 URI를 지정해주세요" 오류가 난다.
2. 같은 앱에 **"Facebook 로그인"**(또는 "비즈니스용 Facebook 로그인") 제품이 함께 있어야
   하고, 그 제품의 **설정 → 클라이언트 OAuth 설정**에서 **웹 OAuth 로그인**을 켜고 **유효한
   OAuth 리디렉션 URI**에 1번과 같은 콜백 URL을 등록한다(이것도 드롭다운에서 선택). Threads는
   이 제품의 OAuth 인프라를 같이 쓰므로 여기가 비어 있으면 실제 인증 시 "URL Blocked" 오류가
   난다. **앱 설정 → 기본 설정 → 앱 도메인**에는 프로토콜 없이 도메인만 넣는다
   (`example.com`, `https://example.com`은 안 됨 — 넣으면 1번 저장이 계속 실패한다).
3. 앱이 **개발 모드**인 동안은 테스트 계정을 이용 사례 설정 화면의 **"Threads 테스터 추가
   또는 삭제"**로 등록해야 한다. 등록만으로는 부족하고, 그 계정으로 **Threads.net(웹 버전)
   → 설정 → 계정 → 웹사이트 권한**에서 초대를 직접 수락해야 한다 — 초대 알림이 따로 오지
   않아 놓치기 쉽다. 수락 전에는 "The user has not accepted the invite to test the app" 오류가
   난다.
4. **Meta는 `localhost` redirect URI를 지원하지 않는다.** 로컬에서 전체 흐름을 테스트하려면
   ngrok 등으로 `https` 터널을 열어 그 주소를 1~3단계에 등록한다(`ngrok http 3000` → 뜨는
   `https://*.ngrok-free.dev` 주소 사용; 터널을 재시작하면 주소가 바뀌므로 Meta 설정도 다시
   등록해야 한다). 터널로 접속할 때는 `.env`의 `DEV_TUNNEL_HOST`에 그 호스트를 넣어야
   `next dev`가 정적 자산·HMR 요청을 다른 호스트라는 이유로 차단하지 않는다
   (`next.config.ts`의 `allowedDevOrigins` 참고 — 값이 없으면 기본 동작 그대로라 운영에는
   영향 없음).
5. 발급된 App ID/App Secret을 `.env`의 `THREADS_APP_ID`/`THREADS_APP_SECRET`에, 위에서 등록한
   콜백 URL을 `THREADS_REDIRECT_URI`에 그대로 넣는다.
6. 관리자 로그인 후 `/admin/settings`의 "Threads 연동"에서 "Threads 연결"을 눌러 OAuth를 완료한다.
   이후 앱이 장기 토큰을 보관·자동 갱신한다.

### 운영 배포(`love.nngn.ai`)에서 연동할 때

- Meta에 등록하는 redirect URI는 Cloud Run의 `*.run.app` 원본 주소가 아니라 **캐노니컬
  도메인**을 쓴다: `https://love.nngn.ai/api/admin/threads/callback`. `THREADS_REDIRECT_URI`도
  이 값으로 설정한다.
- 참고로 앞단 Cloudflare Worker(`cloudflare/worker/src/index.ts`)는 origin(Cloud Run)에 요청을
  넘길 때 `Host` 헤더를 origin 도메인으로 바꿔 보내고, origin이 돌려준 리다이렉트의 `Location`이
  origin 호스트를 가리키면 `love.nngn.ai`로 재작성해서 돌려준다. Threads 콜백 라우트는
  `request.url`이 아니라 `THREADS_REDIRECT_URI`의 origin으로 직접 리다이렉트를 만들어서 이
  프록시 동작에 기대지 않는다 — 로컬 ngrok 터널처럼 이런 재작성이 없는 환경에서 `request.url`을
  기준으로 삼으면 내부 호스트로 잘못 리다이렉트되는 걸 실제로 겪었다.

## 관심 문의 (인바운드 매칭)

게시글을 보고 「N번 맘에 들어요」가 오면 쓰는 파이프라인입니다. 수작업 흐름
(접수 → 스펙 문의 → 스펙 수신 → 후보 전달 → 성사/거절)을 상태 머신으로 옮겼습니다.

1. **접수** — `/admin/inquiries`에서 게시 번호+핸들로 등록하거나, 확장의 「관심 접수」로
   현재 대화에서 바로 등록합니다. 공개 서비스의 「관심 보내기」도 여기로 들어옵니다.
2. **스펙 문의** — 프리필된 양식 문안을 다듬어 전달 큐에 넣고, 확장에서 삽입해 보냅니다.
3. **스펙 수신** — 답장이 온 대화에서 확장 「이 대화 수집」을 누르면 수집된 프로필이 열린
   문의에 자동 연결됩니다(직접 연결도 가능).
4. **전달** — 관심자 스펙 요약이 프리필된 전달 문안을 다듬어 후보에게 큐잉합니다.
   사진은 Threads에서 직접 이어 보냅니다.
5. **성사/거절** — 후보 답에 따라 성사(양쪽 핸들 안내 2건 큐잉) 또는 거절(안내 큐잉)로
   종결합니다.

같은 (대상, 핸들)의 열린 문의는 중복 생성되지 않고 재사용됩니다. 전달 큐 항목에는
종류(스펙 문의/스펙 전달/성사 안내/매칭 제안)가 표시됩니다.

## 공개 서비스

인증 없이 접근하는 신청자·열람자용 화면입니다. 핸들·사진은 절대 노출하지 않습니다.

- `/` — 게시(PUBLISHED)된 프로필의 익명 소개글 목록. 번호·성별·출생연도·지역 뱃지.
- `/c/[번호]` — 소개글 전문 + 「관심 보내기」(스레드 핸들 + 메시지) → 관심 문의로 접수.
- `/apply` — DM 양식의 구조화 신청 폼(사진 2장+, 성인·개인정보 동의 필수) →
  `COLLECTED` 프로필로 들어와 기존 검수 흐름에 합류. 구조화 필드는 바로 채워지므로
  LLM 추출 없이 문구 작성으로 넘어갈 수 있습니다.
- 공개 API(`/api/public/*`)는 IP당 분당 3회 rate limit이 걸립니다.

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

- **사진은 아직 API로 게시할 수 없습니다.** 텍스트(`finalBody`)만 Threads Publishing API로 게시합니다.
- **Threads 연결(OAuth)은 로컬에서 실제로 테스트할 수 없습니다.** Meta가 `https` redirect URI를
  요구해 배포 환경(또는 터널)에서만 연결을 완료할 수 있습니다.
- **전달은 삽입까지입니다.** Threads Send를 자동 클릭하지 않습니다. DM API도 없습니다.
- 확장 수집·삽입은 Threads DOM에 의존합니다. UI가 바뀌면 실패할 수 있으며, 그때는 관리자 붙여넣기·클립보드 폴백을 쓰세요.
- DM CDN 사진은 만료·CORS로 업로드가 실패할 수 있습니다. 관리자에서 사진을 보완하세요.
- 운영자는 한 명을 전제합니다. 계정이 하나뿐이고 권한 구분이 없습니다.
