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

1. **새로 입수** — 스레드 핸들, DM 원문, 사진을 올립니다.
2. **추출 실행** — LLM이 원문에서 지역·출생연도·키·직업·취미·이상형 등을 뽑습니다. 원문에 없는 항목은 비워 둡니다.
3. **문구 작성** — 추출 항목과 사진을 함께 넣어 게시 문구 초안을 만듭니다.
4. **검수** — 초안을 읽고 고칩니다.
5. **저장하고 승인** — 승인된 문구만 게시할 수 있습니다.

승인 후 문구를 고치면 상태가 초안으로 돌아갑니다. 사람이 다시 봐야 하기 때문입니다.

## 배포

```bash
docker compose up -d --build
```

`ADMIN_PASSWORD`, `SESSION_SECRET`, `ANTHROPIC_API_KEY` 를 환경에 넣어야 합니다. 사진은 `photo_data` 볼륨에 남습니다. 마이그레이션은 컨테이너 시작 시 자동 적용됩니다.

## 개발

```bash
pnpm test        # Vitest
pnpm typecheck   # tsc --noEmit
```

LLM 호출은 테스트에서 주입으로 대체됩니다. 실제 응답 품질은 테스트로 검증하지 않습니다 — 검증 대상은 형식 준수와 상태 기계입니다.

## 알려진 한계

- 게시(서브시스템 3)와 매칭·전달(서브시스템 4)은 아직 없습니다. 승인된 문구는 손으로 복사해 올려야 합니다.
- 게시 번호는 게시 시점에 발급하도록 설계했으므로, 지금은 부여되지 않습니다.
- 운영자는 한 명을 전제합니다. 계정이 하나뿐이고 권한 구분이 없습니다.
