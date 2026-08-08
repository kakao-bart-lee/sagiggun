# Threads 저장된 문구

threads.com의 메시지 입력창과 게시물 작성창에, 저장해 둔 문구를 사이드바에서 클릭 한 번으로 넣는 브라우저 확장 프로그램입니다. Chrome에서 동작을 확인했습니다. Chromium 기반이라 Edge에서도 동작할 것으로 보이나 직접 확인하지는 않았습니다.

여러 줄 문구도 줄바꿈이 그대로 보존되고, 문장 중간에 커서를 둔 채 클릭하면 그 자리에 삽입됩니다.

## 설치

빌드 과정이 없습니다. 이 폴더를 그대로 로드하면 됩니다.

**Chrome:** `chrome://extensions` → 우측 상단 "개발자 모드" 켜기 → "압축해제된 확장 프로그램을 로드" → 이 폴더 선택

**Edge:** `edge://extensions` → 좌측 "개발자 모드" 켜기 → "압축 풀린 확장 로드" → 이 폴더 선택

## 사용법

1. threads.com에 접속하면 화면 우측에 「문구」 탭이 생깁니다.
2. 탭을 눌러 패널을 열고, 아래 입력란에 문구를 저장합니다. 제목은 선택 사항이며, 비우면 본문 첫 줄이 목록에 표시됩니다.
3. 메시지 입력창이나 게시물 작성창을 클릭해 커서를 둡니다.
4. 목록에서 문구를 클릭하면 커서 위치에 삽입됩니다.

문구 옆의 ✎로 수정, 🗑로 삭제합니다(삭제 전 확인을 거칩니다). 패널을 열어둔 상태는 새로고침 후에도 유지됩니다. 패널 상단의 ⇄ 버튼으로 화면 좌/우 위치를 전환할 수 있고, 이 위치도 저장됩니다.

## 개발

```bash
npm install
npm test
```

Vitest + jsdom으로 76개 테스트가 돕니다.

다만 **jsdom은 실제 Lexical 에디터를 흉내 내지 못합니다.** 단위 테스트가 검증하는 것은 저장 로직, 대상 선택 우선순위, 삽입 전략의 폴백 판정, 패널 UI 동작입니다. 삽입이 실제로 먹히는지는 진짜 threads.com에서 확인해야 하며, 검증 항목은 [구현 계획](docs/superpowers/plans/2026-08-08-threads-snippets.md)의 Task 6에 있습니다.

## 구조

| 파일 | 책임 |
|---|---|
| `src/content/panel-css.js` | 사이드바 CSS (Shadow DOM에 주입할 문자열) |
| `src/content/storage.js` | `chrome.storage.local` 래퍼, 문구 CRUD |
| `src/content/detector.js` | Lexical 에디터 탐지, 삽입 대상 선택 |
| `src/content/inserter.js` | 삽입 전략 폴백 사다리 |
| `src/content/panel.js` | Shadow DOM 사이드바 UI |
| `src/content/index.js` | 진입점, MutationObserver |

빌드 도구를 쓰지 않으므로 소스에 `import`/`export`가 없습니다. MV3 콘텐츠 스크립트는 ES 모듈을 지원하지 않기 때문입니다. 각 파일은 IIFE로 감싸 `globalThis.TSNIP` 네임스페이스에 기능을 붙이고, `manifest.json`의 `js` 배열 순서대로 로드됩니다.

## 설계 배경

주요 결정의 근거와 실측 결과는 [설계 문서](docs/superpowers/specs/2026-08-08-threads-snippets-design.md)에 있습니다. 짧게 요약하면:

**`chrome.sidePanel` API를 쓰지 않았습니다.** 진짜 사이드패널은 별도 문서라, 문구를 클릭하는 순간 입력창의 포커스와 커서가 사라집니다. 같은 문서 안에 Shadow DOM으로 띄우면 `mousedown`에서 `preventDefault()`를 호출해 포커스 이동 자체를 막을 수 있습니다. 덤으로 Edge 호환이 논점에서 사라집니다.

**삽입은 합성 `paste`가 1순위입니다.** `document.execCommand('insertText')`도 동작하지만 줄바꿈을 조용히 삼킵니다 — `"첫째 줄\n둘째 줄"`이 `"첫째 줄둘째 줄"`이 됩니다. 그래서 paste를 먼저 쓰고, 실패했을 때만 `execCommand`로 내려가되 여러 줄 문구였다면 줄바꿈이 사라졌을 수 있다고 경고합니다. `el.textContent` 직접 대입은 Lexical이 되돌리므로 아예 쓰지 않습니다.

**선택자는 구조적 속성만 씁니다.** Threads의 클래스명은 해시라 언제든 바뀌고, `aria-placeholder`는 UI 언어에 따라 달라집니다. `[contenteditable="true"][data-lexical-editor="true"][role="textbox"]` 하나로 찾습니다.

## 알려진 한계

- Threads가 에디터 구조를 바꾸면 동작이 멈출 수 있습니다. 그럴 때는 삽입이 실패하는 대신 문구를 클립보드에 복사하고 직접 붙여넣도록 안내합니다.
- 문구는 `chrome.storage.local`에 저장되므로 기기 간 동기화가 되지 않습니다. `chrome.storage.sync`는 항목당 8KB 제한이 있어 긴 문구에서 터집니다.
- 여러 탭이 동기화되지 않습니다. 탭 A에서 문구를 추가·수정·삭제해도 이미 열려 있는 탭 B의 패널에는 새로고침 전까지 반영되지 않습니다.

## 범위 밖

카테고리·태그, 키보드 단축키, 변수 치환, 가져오기/내보내기, 사용 통계, 드래그 정렬은 넣지 않았습니다.
