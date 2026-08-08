# 매칭 플랫폼 — 수집·포맷팅 설계 문서

작성일: 2026-08-09
상태: 설계 확정
범위: 서브시스템 1(수집·저장) + 2(LLM 포맷터·검수)

## 1. 배경과 전체 그림

스레드(threads.com)로 자기소개와 사진을 받아 정해진 형식으로 다듬어 게시하고, 신청자끼리 매칭해 각자에게 결과를 전달하는 서비스다.

전체는 네 개의 독립 서브시스템이다.

| | 서브시스템 | 외부 의존 | 이 문서 |
|---|---|---|---|
| 1 | 수집·저장 | 없음 | ✅ |
| 2 | LLM 포맷터·검수 | Claude API (비전) | ✅ |
| 3 | 게시 | Threads Publishing API | 별도 스펙 |
| 4 | 매칭·전달 | 없음 (확장 경유) | 별도 스펙 |

1과 2를 먼저 만든다. 그 둘만으로 "붙여넣으면 게시 가능한 승인된 문구가 나온다"가 성립하고, 수동 게시로 운영이 가능하다.

### 1.1 아키텍처를 결정한 외부 사실

[Threads API 레퍼런스](https://developers.facebook.com/docs/threads/reference)의 엔드포인트는 Publishing, Media Retrieval, Reply Management, User, Locations, Location Search, Insights, oEmbed, Debug다. **DM을 보내거나 읽는 엔드포인트가 없다.**

따라서:

- **게시는 자동화된다** — 서버에서 Publishing API로 직접 올린다 (서브시스템 3).
- **DM 수집과 발송은 자동화할 수 없다** — 브라우저를 거쳐야 한다. 이 저장소의 크롬 확장이 그 경로다.

구현 시점에 이 사실을 재확인한다. Meta가 DM API를 추가하면 서브시스템 4의 설계가 바뀐다.

## 2. 수집 — 클라이언트 중립 입수

자기소개는 현재 스레드 DM으로 들어온다. API가 없으므로 선택지는 확장이 대화를 긁어오거나, 운영자가 붙여넣거나 둘이다.

**v1은 붙여넣기로 한다.** 관리자 화면에서 DM 원문을 붙여넣고 사진을 업로드한다.

이유 셋:

1. **확실하다.** 확장 스크래핑은 Threads DOM이 바뀌면 멈춘다. 붙여넣기는 안 멈춘다.
2. **사진이 문제다.** DM의 이미지는 만료되는 CDN URL이라, 서버가 나중에 받으러 가면 실패한다. 운영자가 저장해 올리는 것이 확실하다.
3. **나중에 갈아끼울 수 있다.** 서버의 입수 엔드포인트를 클라이언트 중립으로 설계하면, 확장에 "이 대화 수집" 버튼을 다는 것은 같은 엔드포인트를 호출하는 클라이언트를 하나 더 만드는 일이 된다.

입수 엔드포인트는 `POST /api/profiles`가 원문 텍스트와 스레드 핸들을 받고, `POST /api/profiles/:id/photos`가 사진을 받는다. v1의 클라이언트는 관리자 폼이고, v2의 클라이언트는 확장이다.

### 2.1 중복 신청 감지

같은 사람이 여러 번 신청하는 일이 생긴다. 스레드 핸들(`@handle`)로 감지한다. 입수 시 같은 핸들의 프로필이 이미 있으면 저장을 막지 않고 **경고와 함께 기존 프로필로 가는 링크를 보여준다** — 재신청이 정당한 경우(정보 갱신)가 있으므로 판단은 운영자가 한다.

## 3. LLM 포맷팅 — 추출과 작문을 분리한다

한 번의 호출로 원문에서 게시 문구까지 만들지 않는다. 성질이 다른 두 작업이다.

**추출**: 비정형 텍스트 → 구조화된 필드. 정답이 있고 검증할 수 있다. 텍스트만 입력한다.

**작문**: 구조화된 필드 + 사진 → 게시 문구. 정답이 없고 검증할 수 없다. 사진을 함께 입력한다.

분리하는 실익은 재실행에 있다. 작문이 마음에 안 들면 추출 결과를 그대로 두고 작문만 다시 돌린다. 추출이 틀렸으면 운영자가 필드를 고치고 작문을 돌린다.

### 3.1 추출

Claude API에 구조화 출력을 강제해 다음 필드를 뽑는다. 원문에 없는 항목은 `null`로 두고 **추측하지 않는다.**

| 필드 | 타입 | 비고 |
|---|---|---|
| `gender` | `'F' \| 'M' \| null` | |
| `birthYear` | `int?` | `02년생` → 2002 |
| `region` | `string?` | 거주지 |
| `heightCm` | `int?` | |
| `job` | `string?` | `금융권` 수준의 직종 |
| `hobbies` | `string[]` | |
| `appealPoints` | `string[]` | 본인의 장점 |
| `idealType` | `string[]` | 이상형 |
| `partnerAgeMin` / `partnerAgeMax` | `int?` | `97년생~04년생` → 출생연도로 저장 |
| `partnerRegions` | `string[]` | |
| `dealBreakers` | `string[]` | 절대 안 되는 것 |

`partnerAgeMin`/`Max`는 나이가 아니라 **출생연도**로 저장한다. 나이는 해가 바뀌면 달라지므로 저장하면 안 된다.

### 3.2 작문

추출 필드와 사진을 함께 넣어 게시 문구 초안을 만든다. 출력 형식은 고정한다.

```
✨ {거주지}에 거주중인 {출생연도}년생 {성별}분 입니다.
{직업}에서 근무중이신 {키}cm {인상} {이모지}
취미: {취미}
{사진 인상 한 문장}
{외모 묘사 + 연예인 비유}
본인의 장점은 💖
1. {장점}
2. {장점}
3. {장점}
이상형은 📌
1. {이상형}
2. {이상형}
3. {이상형}
✔️ {출생연도 범위} 가능해요!
✔️ {가능 지역} 가능해요!
❌이건 절대 안 돼요.
{데알브레이커}
📨 관심 있으신 분은 메세지 주세요!
```

`{사진 인상 한 문장}`과 `{외모 묘사 + 연예인 비유}`만 사진을 봐야 나오는 부분이다. 나머지는 필드에서 결정된다.

**게시 번호(`50.`)는 이 본문에 포함하지 않는다.** 저장되는 `draftBody`/`finalBody`는 번호 없이 `✨`로 시작한다. 번호는 게시 시점에 앞에 붙인다(§3.4). 본문에 넣어두면 번호가 바뀔 때 본문을 고쳐야 한다.

### 3.3 검수는 선택이 아니다

작문은 실존 인물의 외모를 평가하는 문장을 만든다 — `강아지상`, `비율도 좋고`, `배우 OOO 느낌`. LLM이 이런 문장을 대량으로 쓰다 보면 언젠가 무례하거나 사실과 다른 것을 쓴다. 그리고 그것이 운영자 이름으로 공개 게시된다.

그래서 **승인 없이는 게시할 수 없게** 상태 기계로 강제한다.

```
COLLECTED  ──추출/작문──▶  DRAFTED  ──운영자 편집──▶  APPROVED  ──게시──▶  PUBLISHED
                              ▲                          │
                              └──────재작문 요청──────────┘
```

- `COLLECTED`: 원문과 사진이 들어왔고 아직 LLM을 안 돌렸다. 추출만 하고 작문을 안 한 상태도 여기다.
- `DRAFTED`: LLM 초안이 있고 아직 승인 전이다.
- `APPROVED`: 운영자가 최종 문구를 확정했다. **이 상태에서만 게시 API가 호출된다.**
- `APPROVED` 이후에도 편집하면 다시 `DRAFTED`로 내린다.
- `ARCHIVED`: 게시하지 않기로 한 프로필. 삭제와 달리 데이터가 남으며 목록에서 기본 숨김이다. 신청을 취소했거나 조건이 맞지 않아 보류한 경우에 쓴다. 어느 상태에서든 `ARCHIVED`로 갈 수 있고, 되돌리면 직전 상태가 아니라 `DRAFTED`로 복귀한다(초안이 없으면 `COLLECTED`).

초안(`draftBody`)과 최종본(`finalBody`)을 따로 저장한다. LLM이 무엇을 썼고 사람이 무엇을 고쳤는지 남아야 프롬프트를 개선할 수 있다.

### 3.4 게시 번호

샘플의 `50.`은 게시 순번이다. **게시가 성공한 시점에 서버가 발급한다.** 미리 발급하면 초안 단계에서 폐기된 프로필 때문에 번호가 빈다. 발급은 단일 트랜잭션에서 처리해 중복을 막는다.

이 문서의 범위(1·2)에서는 번호를 발급하지 않는다. 서브시스템 3의 몫이다.

## 4. 데이터 모델

```prisma
model Profile {
  id            String   @id @default(cuid())
  seq           Int?     @unique          // 게시 시 발급
  status        Status   @default(COLLECTED)

  // 원본 (재처리를 위해 보존)
  sourceHandle  String                    // 스레드 핸들, 중복 감지 키
  rawText       String   @db.Text

  // 추출 결과
  gender        String?
  birthYear     Int?
  region        String?
  heightCm      Int?
  job           String?
  hobbies       String[]
  appealPoints  String[]
  idealType     String[]
  partnerBirthYearMin Int?
  partnerBirthYearMax Int?
  partnerRegions String[]
  dealBreakers  String[]

  // 작문 결과
  draftBody     String?  @db.Text         // LLM 원본
  finalBody     String?  @db.Text         // 운영자 확정본

  // 게시 (서브시스템 3)
  publishedPostId String?
  publishedAt     DateTime?

  photos        Photo[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([sourceHandle])
  @@index([status])
}

model Photo {
  id          String   @id @default(cuid())
  profileId   String
  profile     Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  storageKey  String                      // 저장소 내 경로
  contentType String
  bytes       Int
  order       Int      @default(0)
  createdAt   DateTime @default(now())

  @@index([profileId])
}

enum Status {
  COLLECTED
  DRAFTED
  APPROVED
  PUBLISHED
  ARCHIVED
}
```

`hobbies` 같은 배열은 PostgreSQL 배열 타입을 쓴다. 별도 테이블로 정규화할 만한 조회 요구가 없다.

프로필 삭제는 일반 CRUD로 제공한다. 삭제 시 `Photo` 행은 cascade로 지워지고, **저장소의 파일도 함께 지운다** — 행만 지우면 파일이 고아로 남는다.

## 5. 사진 저장

파일시스템 볼륨에 저장하고 **인증된 Next.js 라우트를 통해서만** 제공한다. 공개 URL을 만들지 않는다.

클라우드 오브젝트 스토리지를 v1에 넣지 않는 이유는 운영 대상이 단일 운영자이고 규모가 작기 때문이다. 저장 인터페이스(`put`/`get`/`delete`)를 얇게 두어 나중에 S3 호환으로 교체할 수 있게 한다.

업로드 제한: 이미지 MIME만 허용(`image/jpeg`, `image/png`, `image/webp`), 파일당 10MB, 프로필당 10장.

## 6. 관리자 인증

단일 운영자를 전제한다. 환경변수의 비밀번호로 로그인하고 서명된 세션 쿠키를 발급한다. 모든 `/admin` 경로와 `/api` 경로가 이 세션을 요구한다.

이 데이터는 인증 없이 접근 가능한 경로에 절대 노출되지 않아야 한다. 사진 제공 라우트도 예외가 아니다.

## 7. 화면

| 경로 | 용도 |
|---|---|
| `/admin/login` | 로그인 |
| `/admin` | 프로필 목록, 상태 필터 |
| `/admin/new` | 원문 붙여넣기 + 사진 업로드 → 추출 실행 |
| `/admin/profiles/:id` | 추출 필드 편집, 작문 실행/재실행, 초안 편집, 승인 |

`/admin/profiles/:id`가 이 서브시스템의 중심 화면이다. 왼쪽에 사진과 원문, 오른쪽에 추출 필드와 게시 문구를 두어 대조하면서 고칠 수 있게 한다.

## 8. 저장소 구조

기존 크롬 확장과 한 저장소를 쓴다. 결국 서브시스템 4에서 연동되므로 분리할 이유가 없다.

```
extension/          # 크롬 확장 (기존 루트에서 이동)
  manifest.json
  src/content/
  tests/
web/                # Next.js 앱
  prisma/
  src/
docs/
```

**확장을 `extension/` 하위로 옮긴다.** 루트에 `manifest.json`과 `web/`이 함께 있으면 저장소의 정체가 드러나지 않는다. 이미 확장을 설치해 쓰고 있다면 `chrome://extensions`에서 제거하고 `sagiggun/extension`으로 다시 로드해야 한다. 저장된 문구는 브라우저 프로필에 있으므로 그대로 남는다.

확장의 테스트 경로와 `package.json`이 이동에 맞춰 갱신되어야 한다.

## 9. 스택

`Next.js(App Router) + Prisma + PostgreSQL + Tailwind`. kontext의 `law_crwal`·`tel_pz`와 같은 구성이라 배포 패턴을 그대로 쓴다.

LLM은 Claude API. 작문에 비전 입력이 필요하므로 이미지를 지원하는 모델을 쓴다.

배포는 `docker-compose`(앱 + PostgreSQL). kontext의 다른 단독배포 서비스와 같은 형태다.

## 10. 오류 처리

| 상황 | 동작 |
|---|---|
| 추출 LLM 실패 | 상태를 `COLLECTED`로 유지, 오류 표시, 재시도 버튼 |
| 작문 LLM 실패 | 기존 초안 보존, 오류 표시, 재시도 버튼 |
| 추출 결과가 스키마에 안 맞음 | 저장하지 않고 원본 응답을 오류와 함께 보여줌 |
| 사진 업로드 실패 | 프로필은 저장, 사진만 실패로 표시 |
| 필수 필드 없이 승인 시도 | 막고 무엇이 비었는지 표시 |

LLM 호출은 실패한다는 전제로 만든다. 원문(`rawText`)을 보존하는 이유가 이것이다 — 언제든 다시 돌릴 수 있어야 한다.

## 11. 테스트

자동화:

- 추출 파서 — 실제 DM 형태의 입력 샘플로 필드 매핑 검증 (LLM 응답은 고정 픽스처로 대체)
- 상태 전이 — 승인 없이 게시 불가, 편집 시 `DRAFTED` 강등
- 사진 업로드 — MIME/크기/장수 제한
- 삭제 — 행과 파일이 함께 지워지는지
- 인증 — 세션 없이 `/admin`·`/api` 접근 차단

수동:

- 실제 DM 원문 3건으로 추출 → 작문 → 편집 → 승인 전 과정
- 작문 결과가 샘플 형식과 일치하는지

LLM 출력 품질은 자동 테스트로 검증하지 않는다. 검증 대상은 형식 준수와 상태 기계다.

## 12. 범위 밖

이 문서에서 다루지 않는다.

- **서브시스템 3(게시)**, **4(매칭·전달)** — 별도 스펙
- 동의 기록·철회 절차, 차단 목록, 결제 — 운영자 판단으로 제외
- 신고·강제 탈퇴, 본인 인증, 사진 검증, 통계 — 필요해지면 추가
- 신청자용 화면 — v1은 운영자 화면만 만든다
