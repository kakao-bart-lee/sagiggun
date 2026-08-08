# Threads 저장된 문구 사이드바 — 설계 문서

작성일: 2026-08-08
상태: 설계 확정 (실측 검증 완료)

## 1. 목적

threads.com에서 자주 쓰는 문구를 사이드바에 저장해 두고, 클릭 한 번으로 메시지 입력창에 넣는 크롬 확장 프로그램. Chromium 기반 Edge에서도 동일하게 동작해야 한다.

## 2. 대상 입력창

두 곳 모두 지원한다.

| 구분 | 위치 | 식별 특징 |
|---|---|---|
| DM 입력창 | `/messages/t/<id>` | `[role="dialog"]` **밖** |
| 게시물 작성창 | 모든 페이지 (모달) | `[role="dialog"]` **안** |

두 입력창 모두 동일한 Lexical 에디터다. 다음이 실측으로 확인됐다.

- `contenteditable="true"`, `role="textbox"`, `data-lexical-editor="true"`
- DOM 노드에 `__lexicalEditor`, `__lexicalTextContent` 내부 키 존재
- 클래스명은 모두 해시(`xzsf02u xw2csxc …`) — **선택자로 사용 불가**
- `aria-placeholder`는 UI 언어에 따라 달라짐(`메시지...`, `새로운 소식이 있나요?`) — **선택자로 사용 불가**

작성창은 홈 상단 인라인 트리거로 열든 좌측 `+` 버튼으로 열든 **항상** `[role="dialog"]` 안에 마운트된다(양쪽 경로 확인함). 따라서 dialog 포함 여부가 두 입력창을 가르는 신뢰 가능한 구조적 신호다.

**주의:** DM 페이지에서 작성창을 열면 두 에디터가 **동시에 DOM에 존재**한다. 삽입 대상 선택 로직이 반드시 필요하다.

## 3. 아키텍처

### 3.1 사이드바 — 페이지 내 주입 (사이드패널 API 미사용)

`chrome.sidePanel`을 쓰지 않고, 콘텐츠 스크립트가 threads.com 문서 안에 Shadow DOM 패널을 직접 마운트한다.

근거 세 가지:

1. **Edge 호환이 논점에서 사라진다.** `sidePanel`은 브라우저·버전별 지원이 갈리는 API다. 안 쓰면 검증할 필요가 없다.
2. **포커스를 유지할 수 있다.** 진짜 사이드패널은 별도 문서라 문구를 클릭하는 순간 컴포저의 포커스와 커서가 사라진다. 같은 문서 안이면 `mousedown`에서 `preventDefault()`로 포커스 이동 자체를 막을 수 있다 (§4.2). 이 확장의 핵심 동작이 여기 걸려 있다.
3. 사용자가 요청한 "요즘 agent 확장 프로그램" 형태가 이것이다.

마운트 규칙:

- 호스트를 `document.documentElement`에 붙인다. React 루트(`#barcelona-page-layout` 등) 안에 넣으면 리렌더 시 언마운트된다.
- `attachShadow({ mode: 'open' })` 필수. Threads CSS가 패널을 망가뜨리는 것과 패널 CSS가 Threads로 새는 것을 양방향으로 차단한다.
- `z-index: 2147483647`, `position: fixed`.

### 3.2 UI 형태

접힌 상태에서는 화면 우측 가장자리에 작은 탭 버튼만 보인다. 클릭하면 패널이 열린다. Threads 레이아웃을 가리지 않기 위한 선택이며, 열림/닫힘 상태는 `storage.local`에 저장해 새로고침 후에도 유지한다.

패널 안에서 문구 CRUD를 모두 처리한다. 별도 옵션 페이지를 만들지 않아 화면을 하나 줄인다.

### 3.3 파일 구조

```
manifest.json
src/content/index.js       # 진입점: 관찰자 기동, 패널 마운트
src/content/detector.js    # 에디터 탐지 + 대상 선택
src/content/inserter.js    # 삽입 전략 (폴백 사다리)
src/content/panel.js       # Shadow DOM 사이드바 + 문구 CRUD
src/content/panel.css
src/storage.js             # chrome.storage.local 래퍼
```

## 4. 핵심 동작

### 4.1 에디터 탐지

선택자는 구조적 속성만 사용한다.

```js
const SEL = '[contenteditable="true"][data-lexical-editor="true"][role="textbox"]';
```

Threads는 SPA이므로 `MutationObserver`를 `document.body`에 `{ childList: true, subtree: true }`로 건다. 에디터는 추가될 뿐 아니라 **교체**되므로, 부착 여부는 `WeakSet`으로 관리해 멱등성을 보장한다.

### 4.2 삽입 대상 선택

우선순위:

1. **마지막으로 포커스됐던 에디터.** `focusin` 이벤트로 계속 갱신한다. 언어 독립적이고 새로운 마운트 지점이 생겨도 깨지지 않는다.
2. 위가 없으면(예: 첫 진입) 열려 있는 `[role="dialog"]` 안의 에디터.
3. 그것도 없으면 화면에 보이는 유일한 에디터.

대상이 하나도 없으면 문구 버튼을 비활성화하고 안내 문구를 띄운다.

### 4.3 포커스·커서 보존 — 이 확장의 핵심

문구 버튼의 **`mousedown`에서 `preventDefault()`** 를 호출한다. 그러면 브라우저가 포커스를 옮기지 않으므로 컴포저가 포커스와 **커서 위치를 그대로 유지**한다. 실제 삽입은 `click`에서 한다.

실측 검증: 컴포저에 `AAABBB`를 넣고 커서를 3번 위치(`AAA|BBB`)에 둔 뒤, Shadow DOM 버튼을 **실제 마우스로** 클릭 → 클릭 시점 `document.activeElement`가 여전히 에디터였고 커서 오프셋 3이 보존되어 `AAA[삽입]BBB`가 됐다.

블러 후 재포커스 방식보다 엄격히 낫다. `el.focus()`는 커서를 예측 불가능한 위치에 놓는데, 문장 중간 삽입은 정상적인 사용 시나리오다.

패널에 자체 입력 필드(문구 추가/편집)가 생기면 그때는 포커스가 진짜로 떠나므로, `focusin`으로 저장해 둔 에디터 참조를 폴백 경로로 유지한다.

### 4.4 삽입 전략

**1순위: 합성 `paste` 이벤트**

```js
const dt = new DataTransfer();
dt.setData('text/plain', text);
editor.dispatchEvent(new ClipboardEvent('paste', {
  clipboardData: dt, bubbles: true, cancelable: true,
}));
```

**2순위(폴백): `document.execCommand('insertText', false, text)`**

`insertText`를 폴백으로 내린 이유는 **줄바꿈을 조용히 삼키기 때문**이다. 실측:

| 입력 | `insertText` 결과 | 합성 paste 결과 |
|---|---|---|
| `"첫째 줄\n둘째 줄\n셋째 줄"` | `"첫째 줄둘째 줄셋째 줄"` (한 줄, `<br>` 0개) | `"첫째 줄\n둘째 줄\n셋째 줄"` (`<br>` 2개) |

저장된 문구는 여러 줄인 경우가 많으므로 paste가 기본이어야 한다.

**작동하지 않는 방식:** `el.textContent = text` 직접 대입 + `input` 이벤트 디스패치. Lexical이 다음 reconcile에서 되돌려 버린다. 실측 확인함. 폴백 사다리에 포함하지 않는다.

**비동기 주의:** 두 방식 모두 삽입이 동기적으로 반영되지 않는다. `execCommand`가 `true`를 반환한 직후 `textContent`를 읽으면 빈 문자열이다. Lexical이 다음 틱에 reconcile한다. 삽입 성공 여부를 확인해야 한다면 `requestAnimationFrame` 또는 짧은 타임아웃 뒤에 `__lexicalTextContent`를 읽는다.

**검증 근거의 정확한 범위:**

- DM 입력창: **종단간 검증 완료.** paste로 3줄 문구를 삽입해 실제 전송했고, 줄바꿈이 보존된 하나의 메시지로 스레드에 나타났다. `execCommand` 경로도 별도로 실제 전송까지 확인했다.
- 게시물 작성창: **Lexical 내부 상태 동기화 및 게시 버튼 활성화까지 검증**(opacity 0.3 → 1). 공개 게시물이므로 실제 게시는 하지 않았다.

**전송 버튼 상태는 성공 신호로 쓸 수 없다.** DM의 「보내기」 버튼은 입력창이 비었을 때와 채워졌을 때 `aria-disabled`, `opacity`, `pointer-events`가 모두 동일하다. 작성창의 「게시」 버튼만 opacity로 상태를 드러낸다.

### 4.5 저장

`chrome.storage.local`을 쓴다. `sync`는 항목당 8KB 제한이 있어 긴 문구에서 터지고, 로그인된 프로필을 요구한다.

```js
{ snippets: [{ id: string, title: string, body: string, createdAt: number }] }
```

`title`은 목록 표시용, `body`가 실제 삽입 내용이다. `title`이 비면 `body` 앞부분을 잘라 쓴다.

## 5. manifest.json

Manifest V3, `chrome.*` 네임스페이스를 그대로 쓴다. Edge는 Chromium 기반이라 동작하며, `browser.*` 폴리필은 넣지 않는다.

```json
{
  "manifest_version": 3,
  "name": "Threads 저장된 문구",
  "version": "0.1.0",
  "permissions": ["storage"],
  "content_scripts": [{
    "matches": [
      "https://www.threads.com/*",
      "https://threads.com/*",
      "https://www.threads.net/*",
      "https://threads.net/*"
    ],
    "js": ["src/content/index.js"],
    "run_at": "document_idle"
  }]
}
```

`threads.net`은 원래 도메인이고 아직 리다이렉트로 트래픽이 있다. 빼면 일부 사용자에게 조용히 먹통이 된다.

`host_permissions`는 넣지 않는다 — 콘텐츠 스크립트만 쓰고 네트워크 요청을 하지 않으므로 `storage` 권한 하나면 충분하다.

## 6. 오류 처리

| 상황 | 동작 |
|---|---|
| 에디터를 못 찾음 | 문구 버튼 비활성화 + "입력창을 먼저 클릭하세요" 안내 |
| paste 삽입 후 텍스트 변화 없음 | `execCommand` 폴백 시도 |
| 폴백도 실패 | 문구를 클립보드에 복사하고 "직접 붙여넣기(Cmd+V) 해주세요" 안내 |
| `storage` 읽기 실패 | 빈 목록으로 시작, 콘솔 경고 |

Threads가 DOM이나 에디터를 바꾸면 확장이 조용히 죽는 대신 3번 경로로 떨어져 최소한 문구는 쓸 수 있게 한다.

## 7. 테스트

자동화된 유닛 테스트 대상:

- `storage.js` — CRUD, 빈 상태, 잘못된 데이터 형태
- `detector.js` — 대상 선택 우선순위 (jsdom으로 dialog/비-dialog 에디터 픽스처 구성)

브라우저 수동 검증 대상(실제 threads.com 필요):

- DM 입력창 삽입 → 전송
- 작성창 삽입 → 게시 버튼 활성화
- 여러 줄 문구 줄바꿈 보존
- 문장 중간 커서 삽입
- SPA 라우팅 이동 후에도 패널·탐지 유지
- Edge에서 위 전부 재확인

## 8. 범위 밖 (향후 과제)

사용자가 "간단한"을 요청했으므로 1차 범위는 문구 목록 + 추가/수정/삭제 + 클릭 삽입까지다. 다음은 명시적으로 넣지 않는다.

- 문구 카테고리·폴더·태그
- 키보드 단축키
- 변수 치환 (`{이름}` 등)
- 가져오기/내보내기, 기기 간 동기화
- 문구 사용 빈도 통계·정렬
- 드래그 정렬
