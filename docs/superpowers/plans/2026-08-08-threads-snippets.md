# Threads 저장된 문구 사이드바 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** threads.com의 DM 입력창과 게시물 작성창에, 저장해 둔 문구를 사이드바에서 클릭 한 번으로 삽입하는 크롬/Edge 확장 프로그램을 만든다.

**Architecture:** 콘텐츠 스크립트가 threads.com 문서 안에 Shadow DOM 사이드바를 직접 마운트한다(`chrome.sidePanel` 미사용). 문구 버튼의 `mousedown`에서 `preventDefault()`를 호출해 Lexical 에디터의 포커스와 커서 위치를 보존한 채, 합성 `paste` 이벤트로 텍스트를 삽입한다. 빌드 단계 없이 여러 콘텐츠 스크립트 파일이 `globalThis.TSNIP` 네임스페이스를 공유한다.

**Tech Stack:** Manifest V3, 순수 JavaScript(빌드 없음), `chrome.storage.local`, 테스트는 Vitest + jsdom.

## Global Constraints

- Manifest V3. `chrome.*` 네임스페이스만 사용한다. `browser.*` 폴리필을 넣지 않는다.
- **빌드 단계를 만들지 않는다.** 번들러 없이 `chrome://extensions` → "압축해제된 확장 프로그램을 로드"로 바로 동작해야 한다. `npm`은 테스트 전용이다.
- 소스 파일은 각각 IIFE로 감싸고 `globalThis.TSNIP` 네임스페이스에 붙인다. `import`/`export`를 소스에 쓰지 않는다(MV3 콘텐츠 스크립트는 ES 모듈을 지원하지 않는다).
- 에디터 선택자는 `[contenteditable="true"][data-lexical-editor="true"][role="textbox"]` 만 사용한다. **클래스명(해시)과 `aria-placeholder`(언어별 상이)를 선택자에 쓰지 않는다.**
- 삽입 1순위는 합성 `paste`, 2순위는 `document.execCommand('insertText', ...)`. `el.textContent` 직접 대입은 Lexical이 되돌리므로 **사용 금지**.
- 삽입은 비동기로 반영된다. 성공 판정은 최소 한 틱 뒤에 `__lexicalTextContent`(없으면 `textContent`)를 다시 읽어서 한다.
- 저장은 `chrome.storage.local`. `chrome.storage.sync`를 쓰지 않는다(항목당 8KB 제한).
- `content_scripts.matches`에 `threads.com`과 `threads.net`을 www 유무 포함 4개 모두 넣는다.
- 사용자 노출 문자열은 한국어로 쓴다.
- 1차 범위 밖(구현하지 않음): 카테고리/태그, 키보드 단축키, 변수 치환, 가져오기/내보내기, 사용 통계, 드래그 정렬.

## File Structure

| 파일 | 책임 |
|---|---|
| `manifest.json` | MV3 선언, 콘텐츠 스크립트 로드 순서 |
| `src/content/panel-css.js` | 사이드바 CSS를 문자열로 보관 (`TSNIP.css`) — Shadow DOM에는 `content_scripts.css`를 쓸 수 없다 |
| `src/content/storage.js` | `chrome.storage.local` 래퍼, 문구 CRUD, 패널 열림 상태 |
| `src/content/detector.js` | 에디터 탐지 + 삽입 대상 선택 |
| `src/content/inserter.js` | 삽입 전략 폴백 사다리 |
| `src/content/panel.js` | Shadow DOM 사이드바 UI + 문구 CRUD 화면 |
| `src/content/index.js` | 진입점: 모듈 배선, MutationObserver |
| `tests/setup.js` | `chrome`, `DataTransfer`, `ClipboardEvent` 스텁 |
| `tests/*.test.js` | 모듈별 단위 테스트 |

콘텐츠 스크립트 실행 순서는 의존 순서와 같다: `panel-css` → `storage` → `detector` → `inserter` → `panel` → `index`.

---

### Task 1: 프로젝트 초기화 + storage 모듈

**Files:**
- Create: `package.json`, `vitest.config.js`, `tests/setup.js`, `manifest.json`, `src/content/storage.js`
- Test: `tests/storage.test.js`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `globalThis.TSNIP.storage` —
  - `list(): Promise<Snippet[]>`
  - `add({ title?: string, body: string }): Promise<Snippet>`
  - `update(id: string, { title?: string, body?: string }): Promise<Snippet|null>`
  - `remove(id: string): Promise<boolean>`
  - `isOpen(): Promise<boolean>`
  - `setOpen(open: boolean): Promise<void>`
  - `Snippet = { id: string, title: string, body: string, createdAt: number }`

- [ ] **Step 1: 의존성 설치**

```bash
npm init -y
npm install -D vitest jsdom
npm pkg set type=module
npm pkg set scripts.test="vitest run"
npm pkg set scripts.test:watch="vitest"
npm pkg delete main
```

- [ ] **Step 2: vitest 설정 파일 작성**

`vitest.config.js`:

```js
export default {
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
  },
};
```

- [ ] **Step 3: 테스트 스텁 작성**

jsdom에는 `chrome`, `DataTransfer`, `ClipboardEvent`, `document.execCommand`가 없다. 최소한으로 흉내 낸다.

`tests/setup.js`:

```js
import { beforeEach, vi } from 'vitest';

// --- chrome.storage.local 스텁 -------------------------------------------
globalThis.__store = {};
globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn(async (key) =>
        key in globalThis.__store ? { [key]: globalThis.__store[key] } : {}
      ),
      set: vi.fn(async (obj) => {
        Object.assign(globalThis.__store, obj);
      }),
    },
  },
};

// --- DataTransfer / ClipboardEvent 스텁 -----------------------------------
if (typeof globalThis.DataTransfer !== 'function') {
  globalThis.DataTransfer = class {
    constructor() {
      this._data = new Map();
    }
    setData(type, value) {
      this._data.set(type, String(value));
    }
    getData(type) {
      return this._data.get(type) ?? '';
    }
  };
}

if (typeof globalThis.ClipboardEvent !== 'function') {
  globalThis.ClipboardEvent = class extends Event {
    constructor(type, init = {}) {
      super(type, init);
      this.clipboardData = init.clipboardData ?? null;
    }
  };
}

beforeEach(() => {
  for (const k of Object.keys(globalThis.__store)) delete globalThis.__store[k];
  document.documentElement.innerHTML = '<head></head><body></body>';
});
```

- [ ] **Step 4: 실패하는 테스트 작성**

`tests/storage.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import '../src/content/storage.js';

const storage = () => globalThis.TSNIP.storage;

describe('storage', () => {
  it('빈 상태에서 빈 배열을 돌려준다', async () => {
    expect(await storage().list()).toEqual([]);
  });

  it('문구를 추가하면 id와 createdAt이 붙는다', async () => {
    const sn = await storage().add({ title: '인사', body: '안녕하세요' });
    expect(sn.id).toBeTypeOf('string');
    expect(sn.id.length).toBeGreaterThan(0);
    expect(sn.title).toBe('인사');
    expect(sn.body).toBe('안녕하세요');
    expect(sn.createdAt).toBeTypeOf('number');
    expect(await storage().list()).toHaveLength(1);
  });

  it('title을 생략하면 빈 문자열이 된다', async () => {
    const sn = await storage().add({ body: '본문만' });
    expect(sn.title).toBe('');
  });

  it('여러 줄 본문을 그대로 보존한다', async () => {
    const body = '첫째 줄\n둘째 줄\n셋째 줄';
    await storage().add({ body });
    const [sn] = await storage().list();
    expect(sn.body).toBe(body);
  });

  it('update는 지정한 필드만 바꾼다', async () => {
    const sn = await storage().add({ title: '원본', body: '본문' });
    const updated = await storage().update(sn.id, { body: '새 본문' });
    expect(updated.title).toBe('원본');
    expect(updated.body).toBe('새 본문');
  });

  it('없는 id로 update하면 null을 돌려준다', async () => {
    expect(await storage().update('없음', { body: 'x' })).toBeNull();
  });

  it('remove는 삭제 성공 여부를 돌려준다', async () => {
    const sn = await storage().add({ body: '지울 것' });
    expect(await storage().remove(sn.id)).toBe(true);
    expect(await storage().remove(sn.id)).toBe(false);
    expect(await storage().list()).toEqual([]);
  });

  it('저장된 값이 배열이 아니면 빈 배열로 복구한다', async () => {
    globalThis.__store.snippets = { 망가진: '데이터' };
    expect(await storage().list()).toEqual([]);
  });

  it('형태가 잘못된 항목은 걸러낸다', async () => {
    globalThis.__store.snippets = [
      { id: 'a', body: '정상' },
      { id: 'b' },
      null,
      { body: 'id 없음' },
    ];
    const list = await storage().list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('a');
  });

  it('패널 열림 상태를 저장하고 읽는다', async () => {
    expect(await storage().isOpen()).toBe(false);
    await storage().setOpen(true);
    expect(await storage().isOpen()).toBe(true);
  });
});
```

- [ ] **Step 5: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `Failed to load url ../src/content/storage.js` (파일이 아직 없음)

- [ ] **Step 6: storage 모듈 구현**

`src/content/storage.js`:

```js
(() => {
  const NS = (globalThis.TSNIP = globalThis.TSNIP || {});
  const KEY_SNIPPETS = 'snippets';
  const KEY_OPEN = 'panelOpen';

  const area = () => globalThis.chrome?.storage?.local;

  async function read(key, fallback) {
    const a = area();
    if (!a) return fallback;
    try {
      const res = await a.get(key);
      return res && key in res ? res[key] : fallback;
    } catch (err) {
      console.warn('[TSNIP] storage read failed', err);
      return fallback;
    }
  }

  async function write(key, value) {
    const a = area();
    if (!a) return;
    try {
      await a.set({ [key]: value });
    } catch (err) {
      console.warn('[TSNIP] storage write failed', err);
    }
  }

  function normalize(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (s) => s && typeof s.id === 'string' && typeof s.body === 'string'
      )
      .map((s) => ({
        id: s.id,
        title: typeof s.title === 'string' ? s.title : '',
        body: s.body,
        createdAt: typeof s.createdAt === 'number' ? s.createdAt : 0,
      }));
  }

  function newId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return 'sn-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  NS.storage = {
    async list() {
      return normalize(await read(KEY_SNIPPETS, []));
    },

    async add({ title = '', body }) {
      const snippet = {
        id: newId(),
        title: String(title),
        body: String(body),
        createdAt: Date.now(),
      };
      const list = await this.list();
      list.push(snippet);
      await write(KEY_SNIPPETS, list);
      return snippet;
    },

    async update(id, { title, body } = {}) {
      const list = await this.list();
      const i = list.findIndex((s) => s.id === id);
      if (i === -1) return null;
      if (title !== undefined) list[i].title = String(title);
      if (body !== undefined) list[i].body = String(body);
      await write(KEY_SNIPPETS, list);
      return list[i];
    },

    async remove(id) {
      const list = await this.list();
      const next = list.filter((s) => s.id !== id);
      if (next.length === list.length) return false;
      await write(KEY_SNIPPETS, next);
      return true;
    },

    async isOpen() {
      return !!(await read(KEY_OPEN, false));
    },

    async setOpen(open) {
      await write(KEY_OPEN, !!open);
    },
  };
})();
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — storage 테스트 11개 전부 통과

- [ ] **Step 8: .gitignore에 node_modules 확인**

`.gitignore`에 `node_modules/`가 이미 있는지 확인하고, 없으면 추가한다.

Run: `grep -q '^node_modules/$' .gitignore || echo 'node_modules/' >> .gitignore`

- [ ] **Step 9: 커밋**

`manifest.json`은 Task 5에서 만든다. 참조할 파일이 전부 존재할 때 써야 로드 가능한 상태가 유지된다.

```bash
git add package.json package-lock.json vitest.config.js .gitignore tests/setup.js tests/storage.test.js src/content/storage.js
git commit -m "feat: chrome.storage.local 기반 문구 저장 모듈"
```

---

### Task 2: 에디터 탐지 및 삽입 대상 선택

**Files:**
- Create: `src/content/detector.js`
- Test: `tests/detector.test.js`

**Interfaces:**
- Consumes: 없음
- Produces: `globalThis.TSNIP.detector` —
  - `EDITOR_SELECTOR: string`
  - `isEditor(node: unknown): boolean`
  - `findEditors(root?: ParentNode): HTMLElement[]`
  - `createTracker(doc?: Document): Tracker`
  - `Tracker = { start(): void, stop(): void, getTarget(): HTMLElement|null, notifyDomChanged(): void, onChange(cb: (t: HTMLElement|null) => void): () => void }`

대상 선택 우선순위(설계 문서 §4.2):
1. 마지막으로 포커스됐던 에디터가 아직 DOM에 붙어 있으면 그것
2. 없으면 `[role="dialog"]` 안의 에디터 중 마지막 것
3. 없으면 에디터가 정확히 하나일 때 그것
4. 그 외에는 `null`

> jsdom은 `getBoundingClientRect()`가 항상 0을 돌려주므로 "화면에 보이는지"로 판정할 수 없다. 실제 Threads에서 작성창은 항상 다이얼로그 안에 열리므로, 가시성 대신 다이얼로그 포함 여부로 판정한다. 동작이 같으면서 테스트가 가능하다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/detector.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import '../src/content/detector.js';

const detector = () => globalThis.TSNIP.detector;

function makeEditor({ inDialog = false } = {}) {
  const el = document.createElement('div');
  el.setAttribute('contenteditable', 'true');
  el.setAttribute('data-lexical-editor', 'true');
  el.setAttribute('role', 'textbox');
  if (inDialog) {
    const dlg = document.createElement('div');
    dlg.setAttribute('role', 'dialog');
    dlg.appendChild(el);
    document.body.appendChild(dlg);
  } else {
    document.body.appendChild(el);
  }
  return el;
}

describe('detector.isEditor', () => {
  it('세 속성을 모두 갖춘 요소만 에디터로 본다', () => {
    expect(detector().isEditor(makeEditor())).toBe(true);
  });

  it('data-lexical-editor가 없으면 에디터가 아니다', () => {
    const el = document.createElement('div');
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('role', 'textbox');
    document.body.appendChild(el);
    expect(detector().isEditor(el)).toBe(false);
  });

  it('요소가 아닌 값에도 안전하다', () => {
    expect(detector().isEditor(null)).toBe(false);
    expect(detector().isEditor(document.createTextNode('x'))).toBe(false);
  });
});

describe('detector.createTracker', () => {
  it('에디터가 없으면 null을 돌려준다', () => {
    const t = detector().createTracker();
    expect(t.getTarget()).toBeNull();
  });

  it('에디터가 하나뿐이면 그것을 고른다', () => {
    const dm = makeEditor();
    const t = detector().createTracker();
    expect(t.getTarget()).toBe(dm);
  });

  it('둘 이상이고 포커스 이력이 없으면 다이얼로그 안쪽을 고른다', () => {
    makeEditor();
    const composer = makeEditor({ inDialog: true });
    const t = detector().createTracker();
    expect(t.getTarget()).toBe(composer);
  });

  it('마지막으로 포커스된 에디터를 우선한다', () => {
    const dm = makeEditor();
    makeEditor({ inDialog: true });
    const t = detector().createTracker();
    t.start();
    dm.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(t.getTarget()).toBe(dm);
  });

  it('포커스된 에디터가 DOM에서 사라지면 다음 후보로 넘어간다', () => {
    const dm = makeEditor();
    const composer = makeEditor({ inDialog: true });
    const t = detector().createTracker();
    t.start();
    composer.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(t.getTarget()).toBe(composer);

    composer.closest('[role="dialog"]').remove();
    expect(t.getTarget()).toBe(dm);
  });

  it('에디터가 아닌 곳의 focusin은 무시한다', () => {
    const dm = makeEditor();
    const t = detector().createTracker();
    t.start();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(t.getTarget()).toBe(dm);
  });

  it('onChange 구독자에게 대상 변경을 알린다', () => {
    const dm = makeEditor();
    const t = detector().createTracker();
    t.start();
    const seen = [];
    t.onChange((target) => seen.push(target));
    dm.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(seen).toEqual([dm]);
  });

  it('notifyDomChanged가 구독자를 다시 호출한다', () => {
    makeEditor();
    const t = detector().createTracker();
    t.start();
    let calls = 0;
    t.onChange(() => calls++);
    t.notifyDomChanged();
    expect(calls).toBe(1);
  });

  it('stop 이후에는 focusin을 추적하지 않는다', () => {
    const dm = makeEditor();
    const composer = makeEditor({ inDialog: true });
    const t = detector().createTracker();
    t.start();
    t.stop();
    dm.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(t.getTarget()).toBe(composer);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test tests/detector.test.js`
Expected: FAIL — `Failed to load url ../src/content/detector.js`

- [ ] **Step 3: detector 모듈 구현**

`src/content/detector.js`:

```js
(() => {
  const NS = (globalThis.TSNIP = globalThis.TSNIP || {});

  // 클래스명은 해시라 쓸 수 없고, aria-placeholder는 UI 언어에 따라 달라진다.
  // 구조적 속성만으로 식별한다.
  const EDITOR_SELECTOR =
    '[contenteditable="true"][data-lexical-editor="true"][role="textbox"]';

  function isEditor(node) {
    return !!(
      node &&
      node.nodeType === 1 &&
      typeof node.matches === 'function' &&
      node.matches(EDITOR_SELECTOR)
    );
  }

  function findEditors(root = document) {
    return Array.from(root.querySelectorAll(EDITOR_SELECTOR));
  }

  function createTracker(doc = document) {
    let lastFocused = null;
    const listeners = new Set();

    function getTarget() {
      if (lastFocused && lastFocused.isConnected) return lastFocused;
      lastFocused = null;

      const editors = findEditors(doc);
      const inDialog = editors.filter((el) => el.closest('[role="dialog"]'));
      if (inDialog.length) return inDialog[inDialog.length - 1];
      if (editors.length === 1) return editors[0];
      return null;
    }

    function emit() {
      const target = getTarget();
      listeners.forEach((cb) => cb(target));
    }

    function onFocusIn(event) {
      if (!isEditor(event.target)) return;
      lastFocused = event.target;
      emit();
    }

    return {
      start() {
        doc.addEventListener('focusin', onFocusIn, true);
      },
      stop() {
        doc.removeEventListener('focusin', onFocusIn, true);
        listeners.clear();
        lastFocused = null;
      },
      getTarget,
      notifyDomChanged: emit,
      onChange(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    };
  }

  NS.detector = { EDITOR_SELECTOR, isEditor, findEditors, createTracker };
})();
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — storage + detector 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add src/content/detector.js tests/detector.test.js
git commit -m "feat: Lexical 에디터 탐지 및 삽입 대상 선택"
```

---

### Task 3: 삽입 전략

**Files:**
- Create: `src/content/inserter.js`
- Test: `tests/inserter.test.js`

**Interfaces:**
- Consumes: 없음
- Produces: `globalThis.TSNIP.inserter` —
  - `readText(editor: HTMLElement): string` — `__lexicalTextContent`가 문자열이면 그것, 아니면 `textContent`
  - `insert(editor, text, opts?): Promise<'paste'|'execCommand'|'clipboard'|'failed'>`
  - `opts = { strategies?: Strategy[], wait?: () => Promise<void> }`
  - `Strategy = { name: string, run(editor, text): boolean }` — `run`이 `false`를 돌려주면 시도조차 못 한 것으로 보고 다음 전략으로 넘어간다
  - `pasteStrategy: Strategy`, `execCommandStrategy: Strategy`

폴백 사다리: `paste` → `execCommand` → 클립보드 복사 → `'failed'`.

`paste`가 1순위인 이유는 실측 결과 `execCommand('insertText')`가 줄바꿈을 삼키기 때문이다(설계 문서 §4.4).

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/inserter.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../src/content/inserter.js';

const inserter = () => globalThis.TSNIP.inserter;

function makeEditor(initial = '') {
  const el = document.createElement('div');
  el.setAttribute('contenteditable', 'true');
  el.setAttribute('data-lexical-editor', 'true');
  el.setAttribute('role', 'textbox');
  el.textContent = initial;
  document.body.appendChild(el);
  return el;
}

/** 텍스트를 실제로 덧붙이는 가짜 전략 */
function workingStrategy(name) {
  return {
    name,
    run(editor, text) {
      editor.textContent += text;
      return true;
    },
  };
}

/** 시도는 하지만 아무 변화도 못 만드는 가짜 전략 */
function noopStrategy(name) {
  return { name, run: () => true };
}

describe('inserter.readText', () => {
  it('__lexicalTextContent가 있으면 그것을 읽는다', () => {
    const el = makeEditor('DOM 텍스트');
    el.__lexicalTextContent = '렉시컬 텍스트';
    expect(inserter().readText(el)).toBe('렉시컬 텍스트');
  });

  it('__lexicalTextContent가 없으면 textContent로 떨어진다', () => {
    expect(inserter().readText(makeEditor('DOM 텍스트'))).toBe('DOM 텍스트');
  });
});

describe('inserter.insert', () => {
  it('첫 전략이 성공하면 그 이름을 돌려준다', async () => {
    const el = makeEditor();
    const how = await inserter().insert(el, '안녕', {
      strategies: [workingStrategy('paste'), workingStrategy('execCommand')],
    });
    expect(how).toBe('paste');
    expect(el.textContent).toBe('안녕');
  });

  it('첫 전략이 아무 변화를 못 만들면 다음 전략으로 넘어간다', async () => {
    const el = makeEditor();
    const how = await inserter().insert(el, '안녕', {
      strategies: [noopStrategy('paste'), workingStrategy('execCommand')],
    });
    expect(how).toBe('execCommand');
    expect(el.textContent).toBe('안녕');
  });

  it('전략이 예외를 던져도 다음 전략으로 넘어간다', async () => {
    const el = makeEditor();
    const throwing = {
      name: 'paste',
      run() {
        throw new Error('DataTransfer 없음');
      },
    };
    const how = await inserter().insert(el, '안녕', {
      strategies: [throwing, workingStrategy('execCommand')],
    });
    expect(how).toBe('execCommand');
  });

  it('전부 실패하면 클립보드에 복사하고 clipboard를 돌려준다', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const el = makeEditor();
    const how = await inserter().insert(el, '안녕', {
      strategies: [noopStrategy('paste')],
    });
    expect(how).toBe('clipboard');
    expect(writeText).toHaveBeenCalledWith('안녕');
    vi.unstubAllGlobals();
  });

  it('클립보드까지 실패하면 failed를 돌려준다', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: async () => {
          throw new Error('권한 없음');
        },
      },
    });
    const how = await inserter().insert(makeEditor(), '안녕', {
      strategies: [noopStrategy('paste')],
    });
    expect(how).toBe('failed');
    vi.unstubAllGlobals();
  });

  it('editor나 text가 비면 failed를 돌려준다', async () => {
    expect(await inserter().insert(null, '안녕')).toBe('failed');
    expect(await inserter().insert(makeEditor(), '')).toBe('failed');
  });

  it('__lexicalTextContent 변화도 성공으로 인정한다', async () => {
    const el = makeEditor('고정');
    el.__lexicalTextContent = '이전';
    const lexicalOnly = {
      name: 'paste',
      run(editor) {
        editor.__lexicalTextContent = '이후';
        return true;
      },
    };
    expect(await inserter().insert(el, '안녕', { strategies: [lexicalOnly] })).toBe('paste');
  });
});

describe('inserter.pasteStrategy', () => {
  it('text/plain을 담은 paste 이벤트를 에디터에 보낸다', () => {
    const el = makeEditor();
    let received = null;
    el.addEventListener('paste', (e) => {
      received = e.clipboardData.getData('text/plain');
    });
    expect(inserter().pasteStrategy.run(el, '첫째 줄\n둘째 줄')).toBe(true);
    expect(received).toBe('첫째 줄\n둘째 줄');
  });
});

describe('inserter.execCommandStrategy', () => {
  it('document.execCommand("insertText")를 호출한다', () => {
    const el = makeEditor();
    const spy = vi.fn(() => true);
    document.execCommand = spy;
    expect(inserter().execCommandStrategy.run(el, '안녕')).toBe(true);
    expect(spy).toHaveBeenCalledWith('insertText', false, '안녕');
    delete document.execCommand;
  });

  it('execCommand가 없으면 false를 돌려준다', () => {
    delete document.execCommand;
    expect(inserter().execCommandStrategy.run(makeEditor(), '안녕')).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test tests/inserter.test.js`
Expected: FAIL — `Failed to load url ../src/content/inserter.js`

- [ ] **Step 3: inserter 모듈 구현**

`src/content/inserter.js`:

```js
(() => {
  const NS = (globalThis.TSNIP = globalThis.TSNIP || {});

  function readText(editor) {
    const lexical = editor.__lexicalTextContent;
    return typeof lexical === 'string' ? lexical : editor.textContent;
  }

  // Lexical은 삽입을 다음 틱에 reconcile한다. 즉시 읽으면 빈 문자열이 나온다.
  const defaultWait = () =>
    new Promise((resolve) => setTimeout(resolve, 0));

  // 1순위. execCommand와 달리 줄바꿈을 보존한다.
  const pasteStrategy = {
    name: 'paste',
    run(editor, text) {
      if (
        typeof DataTransfer !== 'function' ||
        typeof ClipboardEvent !== 'function'
      ) {
        return false;
      }
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      editor.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        })
      );
      return true;
    },
  };

  // 2순위. 줄바꿈을 삼키므로 paste가 실패했을 때만 쓴다.
  const execCommandStrategy = {
    name: 'execCommand',
    run(editor, text) {
      if (typeof document.execCommand !== 'function') return false;
      return document.execCommand('insertText', false, text) !== false;
    },
  };

  async function insert(editor, text, opts = {}) {
    if (!editor || !text) return 'failed';

    const strategies = opts.strategies || [pasteStrategy, execCommandStrategy];
    const wait = opts.wait || defaultWait;

    // 정상 경로에서는 mousedown preventDefault 덕분에 이미 포커스가 있다.
    // 패널 자체 입력 필드를 거쳐 온 경우를 위한 안전망.
    if (document.activeElement !== editor && typeof editor.focus === 'function') {
      editor.focus();
    }

    for (const strategy of strategies) {
      const before = readText(editor);
      let attempted;
      try {
        attempted = strategy.run(editor, text) !== false;
      } catch (err) {
        console.warn('[TSNIP] 삽입 전략 실패:', strategy.name, err);
        attempted = false;
      }
      if (!attempted) continue;

      await wait();
      if (readText(editor) !== before) return strategy.name;
    }

    try {
      await navigator.clipboard.writeText(text);
      return 'clipboard';
    } catch (err) {
      console.warn('[TSNIP] 클립보드 복사 실패', err);
      return 'failed';
    }
  }

  NS.inserter = { insert, readText, pasteStrategy, execCommandStrategy };
})();
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — storage + detector + inserter 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add src/content/inserter.js tests/inserter.test.js
git commit -m "feat: paste 우선 삽입 전략과 폴백 사다리"
```

---

### Task 4: Shadow DOM 사이드바 UI

**Files:**
- Create: `src/content/panel-css.js`, `src/content/panel.js`
- Test: `tests/panel.test.js`

**Interfaces:**
- Consumes:
  - `TSNIP.storage` (Task 1) — `list`, `add`, `update`, `remove`, `isOpen`, `setOpen`
  - `TSNIP.css` (이 태스크에서 만드는 CSS 문자열)
- Produces:
  - `globalThis.TSNIP.css: string`
  - `globalThis.TSNIP.panel.mount(deps): PanelHandle`
  - `deps = { storage, getTarget: () => HTMLElement|null, insert: (editor, text) => Promise<string>, doc?: Document }`
  - `PanelHandle = { host: HTMLElement, shadow: ShadowRoot, refresh(): Promise<void>, updateTargetState(): void, setOpen(open: boolean): Promise<void>, destroy(): void }`
  - 호스트 요소 id는 `tsnip-host`

핵심 요구사항: 문구 버튼(`.pick`)의 `mousedown`에서 `preventDefault()`를 호출해야 한다. 이게 없으면 클릭 순간 컴포저의 포커스와 커서가 날아가 삽입이 실패한다. 수정(`.edit`)·삭제(`.del`) 버튼에는 걸지 않는다.

- [ ] **Step 1: CSS 모듈 작성**

Shadow DOM에는 `content_scripts.css`를 넣을 수 없으므로 문자열로 보관한다.

`src/content/panel-css.js`:

```js
(() => {
  const NS = (globalThis.TSNIP = globalThis.TSNIP || {});

  NS.css = `
:host { all: initial; }

.root {
  position: fixed;
  top: 96px;
  right: 0;
  z-index: 2147483647;
  display: flex;
  align-items: flex-start;
  font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo",
    "Malgun Gothic", "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: #f5f5f5;
}

.tab {
  writing-mode: vertical-rl;
  padding: 14px 6px;
  background: #181818;
  color: #f5f5f5;
  border: 1px solid #303030;
  border-right: 0;
  border-radius: 8px 0 0 8px;
  cursor: pointer;
  font: inherit;
  letter-spacing: 2px;
}
.tab:hover { background: #242424; }

.panel {
  width: 300px;
  max-height: 70vh;
  overflow-y: auto;
  background: #181818;
  border: 1px solid #303030;
  border-right: 0;
  border-radius: 12px 0 0 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  padding: 12px;
  box-sizing: border-box;
}
.panel[hidden] { display: none; }

.head { display: flex; align-items: center; justify-content: space-between; }
.head h1 { margin: 0; font-size: 14px; font-weight: 600; }
.close {
  background: none; border: 0; color: #999;
  font-size: 18px; cursor: pointer; padding: 0 4px;
}
.close:hover { color: #f5f5f5; }

.status { margin: 8px 0; min-height: 18px; font-size: 12px; color: #999; }
.status.ok { color: #4ba3f2; }
.status.warn { color: #e8b64c; }
.status.error { color: #f2645a; }

.list { list-style: none; margin: 0 0 12px; padding: 0; }
.list .empty { color: #777; padding: 12px 4px; text-align: center; }

.item { display: flex; gap: 4px; margin-bottom: 4px; }
.item .pick {
  flex: 1; min-width: 0;
  text-align: left;
  padding: 8px 10px;
  background: #242424;
  color: #f5f5f5;
  border: 1px solid #303030;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.item .pick:hover { background: #2f2f2f; }
.item .edit, .item .del {
  background: none; border: 0; color: #888;
  cursor: pointer; padding: 0 6px; font-size: 13px;
}
.item .edit:hover, .item .del:hover { color: #f5f5f5; }

.root.no-target .item .pick { opacity: 0.45; cursor: not-allowed; }

.form { display: flex; flex-direction: column; gap: 6px;
  border-top: 1px solid #303030; padding-top: 10px; }
.form input, .form textarea {
  background: #101010;
  border: 1px solid #303030;
  border-radius: 8px;
  padding: 8px;
  color: #f5f5f5;
  font: inherit;
  resize: vertical;
  box-sizing: border-box;
  width: 100%;
}
.form input:focus, .form textarea:focus { outline: 1px solid #4ba3f2; }

.actions { display: flex; gap: 6px; }
.actions button {
  flex: 1; padding: 8px; border-radius: 8px;
  border: 1px solid #303030; cursor: pointer; font: inherit;
}
.actions .save { background: #f5f5f5; color: #101010; border-color: #f5f5f5; }
.actions .cancel { background: none; color: #999; }
.actions .cancel[hidden] { display: none; }
`;
})();
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/panel.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../src/content/panel-css.js';
import '../src/content/storage.js';
import '../src/content/panel.js';

const panel = () => globalThis.TSNIP.panel;
const storage = () => globalThis.TSNIP.storage;

function mountWith({ target = null, insert = vi.fn(async () => 'paste') } = {}) {
  const handle = panel().mount({
    storage: storage(),
    getTarget: () => target,
    insert,
  });
  return { handle, insert, $: (sel) => handle.shadow.querySelector(sel),
           $$: (sel) => Array.from(handle.shadow.querySelectorAll(sel)) };
}

describe('panel.mount', () => {
  it('documentElement에 shadow 호스트를 붙인다', () => {
    const { handle } = mountWith();
    expect(handle.host.parentElement).toBe(document.documentElement);
    expect(handle.host.id).toBe('tsnip-host');
    expect(handle.shadow.mode).toBe('open');
  });

  it('두 번 마운트해도 호스트는 하나만 남는다', () => {
    mountWith();
    mountWith();
    expect(document.querySelectorAll('#tsnip-host')).toHaveLength(1);
  });

  it('destroy는 호스트를 제거한다', () => {
    const { handle } = mountWith();
    handle.destroy();
    expect(document.getElementById('tsnip-host')).toBeNull();
  });
});

describe('panel 열고 닫기', () => {
  it('처음에는 닫혀 있다', async () => {
    const { $ } = mountWith();
    await new Promise((r) => setTimeout(r, 0));
    expect($('.panel').hidden).toBe(true);
  });

  it('탭 버튼을 누르면 열리고 상태가 저장된다', async () => {
    const { $ } = mountWith();
    $('.tab').click();
    await new Promise((r) => setTimeout(r, 0));
    expect($('.panel').hidden).toBe(false);
    expect($('.tab').getAttribute('aria-expanded')).toBe('true');
    expect(await storage().isOpen()).toBe(true);
  });

  it('열린 상태에서 닫기 버튼을 누르면 닫힌다', async () => {
    const { $ } = mountWith();
    $('.tab').click();
    await new Promise((r) => setTimeout(r, 0));
    $('.close').click();
    await new Promise((r) => setTimeout(r, 0));
    expect($('.panel').hidden).toBe(true);
    expect(await storage().isOpen()).toBe(false);
  });
});

describe('문구 목록', () => {
  it('비어 있으면 안내 문구를 보여준다', async () => {
    const { handle, $ } = mountWith();
    await handle.refresh();
    expect($('.list .empty')).not.toBeNull();
  });

  it('제목이 있으면 제목을, 없으면 본문 첫 줄을 보여준다', async () => {
    await storage().add({ title: '인사말', body: '안녕하세요' });
    await storage().add({ body: '제목 없는 문구\n둘째 줄' });
    const { handle, $$ } = mountWith();
    await handle.refresh();
    const labels = $$('.item .pick').map((b) => b.textContent);
    expect(labels).toEqual(['인사말', '제목 없는 문구']);
  });

  it('긴 본문 첫 줄은 잘라서 보여준다', async () => {
    await storage().add({ body: '가'.repeat(50) });
    const { handle, $ } = mountWith();
    await handle.refresh();
    expect($('.item .pick').textContent.endsWith('…')).toBe(true);
    expect($('.item .pick').textContent.length).toBeLessThanOrEqual(25);
  });

  it('문구 버튼의 title 속성에 본문 전체가 들어간다', async () => {
    await storage().add({ title: '짧은 제목', body: '첫째 줄\n둘째 줄' });
    const { handle, $ } = mountWith();
    await handle.refresh();
    expect($('.item .pick').title).toBe('첫째 줄\n둘째 줄');
  });
});

describe('문구 삽입', () => {
  it('문구 버튼의 mousedown 기본동작을 막는다', async () => {
    await storage().add({ body: '안녕하세요' });
    const target = document.createElement('div');
    const { handle, $ } = mountWith({ target });
    await handle.refresh();

    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    $('.item .pick').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('수정·삭제 버튼의 mousedown은 막지 않는다', async () => {
    await storage().add({ body: '안녕하세요' });
    const { handle, $ } = mountWith();
    await handle.refresh();

    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    $('.item .edit').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('클릭하면 대상 에디터에 본문을 삽입한다', async () => {
    await storage().add({ title: '인사', body: '첫째 줄\n둘째 줄' });
    const target = document.createElement('div');
    const insert = vi.fn(async () => 'paste');
    const { handle, $ } = mountWith({ target, insert });
    await handle.refresh();

    $('.item .pick').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(insert).toHaveBeenCalledWith(target, '첫째 줄\n둘째 줄');
  });

  it('대상이 없으면 삽입하지 않고 안내한다', async () => {
    await storage().add({ body: '안녕하세요' });
    const insert = vi.fn();
    const { handle, $ } = mountWith({ target: null, insert });
    await handle.refresh();

    $('.item .pick').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(insert).not.toHaveBeenCalled();
    expect($('.status').textContent).toContain('입력창');
  });

  it('클립보드 폴백이 쓰이면 붙여넣기를 안내한다', async () => {
    await storage().add({ body: '안녕하세요' });
    const { handle, $ } = mountWith({
      target: document.createElement('div'),
      insert: vi.fn(async () => 'clipboard'),
    });
    await handle.refresh();

    $('.item .pick').click();
    await new Promise((r) => setTimeout(r, 0));
    expect($('.status').textContent).toContain('클립보드');
  });
});

describe('문구 CRUD', () => {
  it('폼을 제출하면 문구가 추가된다', async () => {
    const { handle, $ } = mountWith();
    await handle.refresh();
    $('.f-title').value = '인사';
    $('.f-body').value = '안녕하세요';
    $('.form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));

    const list = await storage().list();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('인사');
  });

  it('본문이 비면 저장하지 않는다', async () => {
    const { handle, $ } = mountWith();
    await handle.refresh();
    $('.f-body').value = '   ';
    $('.form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(await storage().list()).toHaveLength(0);
  });

  it('수정 버튼을 누르면 폼에 값이 채워지고, 제출 시 갱신된다', async () => {
    const sn = await storage().add({ title: '원본', body: '원본 본문' });
    const { handle, $ } = mountWith();
    await handle.refresh();

    $('.item .edit').click();
    await new Promise((r) => setTimeout(r, 0));
    expect($('.f-body').value).toBe('원본 본문');

    $('.f-body').value = '수정된 본문';
    $('.form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));

    const list = await storage().list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(sn.id);
    expect(list[0].body).toBe('수정된 본문');
  });

  it('삭제 버튼을 누르면 목록에서 사라진다', async () => {
    await storage().add({ body: '지울 문구' });
    const { handle, $ } = mountWith();
    await handle.refresh();

    $('.item .del').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(await storage().list()).toHaveLength(0);
  });
});

describe('updateTargetState', () => {
  it('대상이 없으면 no-target 클래스를 붙인다', () => {
    const { handle } = mountWith({ target: null });
    handle.updateTargetState();
    expect(handle.shadow.querySelector('.root').classList.contains('no-target')).toBe(true);
  });

  it('대상이 있으면 no-target 클래스를 뗀다', () => {
    const { handle } = mountWith({ target: document.createElement('div') });
    handle.updateTargetState();
    expect(handle.shadow.querySelector('.root').classList.contains('no-target')).toBe(false);
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npm test tests/panel.test.js`
Expected: FAIL — `Failed to load url ../src/content/panel.js`

- [ ] **Step 4: panel 모듈 구현**

`src/content/panel.js`:

```js
(() => {
  const NS = (globalThis.TSNIP = globalThis.TSNIP || {});
  const HOST_ID = 'tsnip-host';
  const LABEL_MAX = 24;

  const TEMPLATE = `
<button class="tab" type="button" aria-expanded="false">문구</button>
<section class="panel" hidden>
  <header class="head">
    <h1>저장된 문구</h1>
    <button class="close" type="button" aria-label="닫기">&times;</button>
  </header>
  <p class="status" role="status"></p>
  <ul class="list"></ul>
  <form class="form">
    <input class="f-title" type="text" placeholder="제목 (선택)" />
    <textarea class="f-body" rows="3" placeholder="문구 내용"></textarea>
    <div class="actions">
      <button class="save" type="submit">저장</button>
      <button class="cancel" type="button" hidden>취소</button>
    </div>
  </form>
</section>`;

  function labelFor(snippet) {
    const title = (snippet.title || '').trim();
    if (title) return title;
    const firstLine = (snippet.body || '').trim().split('\n')[0];
    return firstLine.length > LABEL_MAX
      ? firstLine.slice(0, LABEL_MAX) + '…'
      : firstLine;
  }

  function mount({ storage, getTarget, insert, doc = document }) {
    doc.getElementById(HOST_ID)?.remove();

    const host = doc.createElement('div');
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: 'open' });

    const style = doc.createElement('style');
    style.textContent = NS.css || '';
    shadow.appendChild(style);

    const root = doc.createElement('div');
    root.className = 'root';
    root.innerHTML = TEMPLATE;
    shadow.appendChild(root);
    doc.documentElement.appendChild(host);

    const $ = (sel) => root.querySelector(sel);
    const tabBtn = $('.tab');
    const panelEl = $('.panel');
    const listEl = $('.list');
    const statusEl = $('.status');
    const formEl = $('.form');
    const titleInput = $('.f-title');
    const bodyInput = $('.f-body');
    const cancelBtn = $('.cancel');
    const saveBtn = $('.save');

    let editingId = null;

    function setStatus(message, kind = '') {
      statusEl.textContent = message || '';
      statusEl.className = 'status' + (kind ? ' ' + kind : '');
    }

    function updateTargetState() {
      const hasTarget = !!getTarget();
      root.classList.toggle('no-target', !hasTarget);
      if (!hasTarget) setStatus('입력창을 먼저 클릭하세요.', 'warn');
      else if (statusEl.classList.contains('warn')) setStatus('');
    }

    function resetForm() {
      editingId = null;
      titleInput.value = '';
      bodyInput.value = '';
      cancelBtn.hidden = true;
      saveBtn.textContent = '저장';
    }

    async function refresh() {
      const snippets = await storage.list();
      listEl.textContent = '';

      if (!snippets.length) {
        const empty = doc.createElement('li');
        empty.className = 'empty';
        empty.textContent = '저장된 문구가 없습니다.';
        listEl.appendChild(empty);
        return;
      }

      for (const snippet of snippets) {
        const item = doc.createElement('li');
        item.className = 'item';
        item.dataset.id = snippet.id;

        const pick = doc.createElement('button');
        pick.type = 'button';
        pick.className = 'pick';
        pick.textContent = labelFor(snippet);
        pick.title = snippet.body;

        const edit = doc.createElement('button');
        edit.type = 'button';
        edit.className = 'edit';
        edit.textContent = '✎';
        edit.setAttribute('aria-label', '수정');

        const del = doc.createElement('button');
        del.type = 'button';
        del.className = 'del';
        del.textContent = '🗑';
        del.setAttribute('aria-label', '삭제');

        item.append(pick, edit, del);
        listEl.appendChild(item);
      }
    }

    async function setOpen(open) {
      panelEl.hidden = !open;
      tabBtn.setAttribute('aria-expanded', String(open));
      await storage.setOpen(open);
      if (open) {
        await refresh();
        updateTargetState();
      }
    }

    // 이 preventDefault가 이 확장의 핵심이다.
    // 없으면 클릭하는 순간 컴포저의 포커스와 커서 위치가 날아간다.
    listEl.addEventListener('mousedown', (event) => {
      if (event.target.closest('.pick')) event.preventDefault();
    });

    listEl.addEventListener('click', async (event) => {
      const item = event.target.closest('.item');
      if (!item) return;

      const id = item.dataset.id;
      const snippets = await storage.list();
      const snippet = snippets.find((s) => s.id === id);
      if (!snippet) return;

      if (event.target.closest('.pick')) {
        const target = getTarget();
        if (!target) {
          setStatus('입력창을 먼저 클릭하세요.', 'warn');
          return;
        }
        const how = await insert(target, snippet.body);
        if (how === 'clipboard') {
          setStatus('삽입에 실패해 클립보드에 복사했습니다. 직접 붙여넣어 주세요.', 'warn');
        } else if (how === 'failed') {
          setStatus('삽입에 실패했습니다.', 'error');
        } else {
          setStatus('삽입했습니다.', 'ok');
        }
        return;
      }

      if (event.target.closest('.edit')) {
        editingId = id;
        titleInput.value = snippet.title;
        bodyInput.value = snippet.body;
        cancelBtn.hidden = false;
        saveBtn.textContent = '수정';
        bodyInput.focus();
        return;
      }

      if (event.target.closest('.del')) {
        await storage.remove(id);
        if (editingId === id) resetForm();
        await refresh();
        setStatus('삭제했습니다.', 'ok');
      }
    });

    formEl.addEventListener('submit', async (event) => {
      event.preventDefault();
      const body = bodyInput.value.trim();
      if (!body) {
        setStatus('문구 내용을 입력하세요.', 'warn');
        return;
      }
      if (editingId) {
        await storage.update(editingId, { title: titleInput.value, body });
      } else {
        await storage.add({ title: titleInput.value, body });
      }
      resetForm();
      await refresh();
      setStatus('저장했습니다.', 'ok');
    });

    cancelBtn.addEventListener('click', resetForm);
    tabBtn.addEventListener('click', () => setOpen(panelEl.hidden));
    $('.close').addEventListener('click', () => setOpen(false));

    // 저장된 열림 상태 복원
    storage.isOpen().then((open) => {
      if (open) setOpen(true);
    });

    return {
      host,
      shadow,
      refresh,
      updateTargetState,
      setOpen,
      destroy() {
        host.remove();
      },
    };
  }

  NS.panel = { mount, labelFor, HOST_ID };
})();
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 네 모듈 테스트 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add src/content/panel-css.js src/content/panel.js tests/panel.test.js
git commit -m "feat: Shadow DOM 사이드바와 문구 CRUD 화면"
```

---

### Task 5: 진입점 배선

**Files:**
- Create: `src/content/index.js`, `manifest.json`
- Test: `tests/index.test.js`

**Interfaces:**
- Consumes: `TSNIP.storage`, `TSNIP.detector`, `TSNIP.inserter`, `TSNIP.panel` (Task 1–4)
- Produces: `globalThis.TSNIP.boot(doc?: Document): PanelHandle|null` — 중복 실행 시 `null`을 돌려준다

`index.js`는 로드되면 자동으로 `boot()`를 실행하되, 테스트에서 제어할 수 있도록 함수를 네임스페이스에 노출한다.

MutationObserver는 Threads에서 초당 수백 번 발화하므로 `requestAnimationFrame`으로 합친다. 에디터별 리스너를 붙이지 않고 `focusin`을 document에 위임했기 때문에, 설계 문서 §4.1의 `WeakSet` 중복 부착 방지는 불필요하다 — 위임 자체가 멱등이다. 관찰자가 하는 일은 두 가지뿐이다: 패널 호스트가 사라졌으면 다시 붙이고, 트래커에게 DOM이 바뀌었음을 알린다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/index.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '../src/content/panel-css.js';
import '../src/content/storage.js';
import '../src/content/detector.js';
import '../src/content/inserter.js';
import '../src/content/panel.js';
import '../src/content/index.js';

const NS = () => globalThis.TSNIP;

function makeEditor() {
  const el = document.createElement('div');
  el.setAttribute('contenteditable', 'true');
  el.setAttribute('data-lexical-editor', 'true');
  el.setAttribute('role', 'textbox');
  document.body.appendChild(el);
  return el;
}

// boot()은 관찰자와 문서 리스너를 남기므로 테스트마다 반드시 정리한다.
// 정리하지 않으면 이전 테스트의 관찰자가 다음 테스트에서 패널을 다시 붙여 실패한다.
let booted = null;

function boot() {
  booted = NS().boot();
  return booted;
}

beforeEach(() => {
  globalThis.__tsnipBooted = false;
});

afterEach(() => {
  booted?.destroy();
  booted = null;
  globalThis.__tsnipBooted = false;
});

describe('boot', () => {
  it('패널을 마운트한다', () => {
    expect(boot()).not.toBeNull();
    expect(document.getElementById('tsnip-host')).not.toBeNull();
  });

  it('두 번째 호출은 null을 돌려주고 아무것도 하지 않는다', () => {
    boot();
    expect(NS().boot()).toBeNull();
    expect(document.querySelectorAll('#tsnip-host')).toHaveLength(1);
  });

  it('포커스된 에디터를 삽입 대상으로 넘긴다', async () => {
    const editor = makeEditor();
    const handle = boot();
    editor.dispatchEvent(new Event('focusin', { bubbles: true }));

    await NS().storage.add({ body: '안녕하세요' });
    await handle.refresh();

    const spy = vi.spyOn(NS().inserter, 'insert').mockResolvedValue('paste');
    handle.shadow.querySelector('.item .pick').click();
    await new Promise((r) => setTimeout(r, 0));

    expect(spy).toHaveBeenCalledWith(editor, '안녕하세요');
    spy.mockRestore();
  });

  it('호스트가 제거되면 다시 붙인다', async () => {
    boot();
    document.getElementById('tsnip-host').remove();

    // MutationObserver를 깨우기 위한 DOM 변경
    document.body.appendChild(document.createElement('div'));
    await new Promise((r) => setTimeout(r, 50));

    expect(document.getElementById('tsnip-host')).not.toBeNull();
  });

  it('destroy는 관찰자를 끊어 더 이상 다시 붙이지 않는다', async () => {
    const handle = boot();
    handle.destroy();
    booted = null;

    document.body.appendChild(document.createElement('div'));
    await new Promise((r) => setTimeout(r, 50));

    expect(document.getElementById('tsnip-host')).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test tests/index.test.js`
Expected: FAIL — `Failed to load url ../src/content/index.js`

- [ ] **Step 3: index 모듈 구현**

`src/content/index.js`:

```js
(() => {
  const NS = (globalThis.TSNIP = globalThis.TSNIP || {});

  function boot(doc = document) {
    if (globalThis.__tsnipBooted) return null;
    if (!NS.storage || !NS.detector || !NS.inserter || !NS.panel) {
      console.warn('[TSNIP] 모듈 로드 실패 — 부팅을 건너뜁니다.');
      return null;
    }
    globalThis.__tsnipBooted = true;

    const tracker = NS.detector.createTracker(doc);
    tracker.start();

    let handle = mountPanel();

    function mountPanel() {
      return NS.panel.mount({
        storage: NS.storage,
        getTarget: () => tracker.getTarget(),
        insert: (editor, text) => NS.inserter.insert(editor, text),
        doc,
      });
    }

    tracker.onChange(() => handle.updateTargetState());

    // Threads는 SPA라 DOM이 끊임없이 바뀐다. 프레임 단위로 합쳐서 처리한다.
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        if (!doc.getElementById(NS.panel.HOST_ID)) handle = mountPanel();
        tracker.notifyDomChanged();
      });
    });
    observer.observe(doc.body, { childList: true, subtree: true });

    return {
      get host() {
        return handle.host;
      },
      get shadow() {
        return handle.shadow;
      },
      refresh: (...args) => handle.refresh(...args),
      updateTargetState: () => handle.updateTargetState(),
      setOpen: (open) => handle.setOpen(open),
      destroy() {
        observer.disconnect();
        tracker.stop();
        handle.destroy();
        globalThis.__tsnipBooted = false;
      },
    };
  }

  NS.boot = boot;

  // chrome.runtime.id는 실제 확장 컨텍스트에서만 존재한다.
  // 테스트(jsdom)에서는 자동 부팅하지 않고 boot()을 직접 호출한다.
  if (globalThis.chrome?.runtime?.id && globalThis.document?.body) boot();
})();
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 다섯 모듈 테스트 전부 통과

- [ ] **Step 5: manifest.json 작성**

이제 참조할 파일이 전부 존재한다. `js` 배열 순서가 곧 로드 순서이고, 의존 순서와 같아야 한다.

`manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Threads 저장된 문구",
  "description": "threads.com 메시지·게시물 입력창에 저장된 문구를 한 번에 넣습니다.",
  "version": "0.1.0",
  "permissions": ["storage"],
  "content_scripts": [
    {
      "matches": [
        "https://www.threads.com/*",
        "https://threads.com/*",
        "https://www.threads.net/*",
        "https://threads.net/*"
      ],
      "js": [
        "src/content/panel-css.js",
        "src/content/storage.js",
        "src/content/detector.js",
        "src/content/inserter.js",
        "src/content/panel.js",
        "src/content/index.js"
      ],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 6: manifest가 참조하는 파일이 모두 존재하는지 확인**

Run:

```bash
node -e "const m=require('./manifest.json'),f=require('fs');const miss=m.content_scripts[0].js.filter(p=>!f.existsSync(p));if(miss.length){console.error('없는 파일:',miss);process.exit(1)}console.log('manifest 파일 참조 정상:',m.content_scripts[0].js.length,'개')"
```

Expected: `manifest 파일 참조 정상: 6 개`

- [ ] **Step 7: 확장 로드 확인**

Chrome에서 `chrome://extensions` → 개발자 모드 켜기 → "압축해제된 확장 프로그램을 로드" → 이 저장소 폴더 선택.

Expected: 오류 없이 로드되고 확장 카드에 "Threads 저장된 문구 0.1.0"이 보인다. 카드에 빨간 "오류" 배지가 있으면 눌러서 내용을 확인한다 — 대개 `manifest.json`의 파일 경로 오타다.

- [ ] **Step 8: 커밋**

```bash
git add src/content/index.js tests/index.test.js manifest.json
git commit -m "feat: 콘텐츠 스크립트 진입점 배선과 manifest"
```

---

### Task 6: 실제 브라우저 검증

**Files:**
- Create: `README.md`
- Modify: 검증에서 발견된 결함이 있으면 해당 소스 파일

**Interfaces:**
- Consumes: 완성된 확장 전체
- Produces: 없음 (검증 및 문서화)

단위 테스트는 jsdom에서 돌기 때문에 진짜 Lexical 에디터를 검증하지 못한다. 아래는 실제 threads.com에서 직접 확인해야 한다.

- [ ] **Step 1: Chrome에서 DM 입력창 검증**

1. 확장을 로드하고 `https://www.threads.com/messages` 에서 대화방을 연다.
2. 우측 「문구」 탭을 눌러 패널을 연다.
3. 여러 줄 문구를 저장한다. 본문에 `첫째 줄` / `둘째 줄` / `셋째 줄`을 줄바꿈으로 넣는다.
4. DM 입력창을 클릭해 커서를 둔다.
5. 저장한 문구를 클릭한다.

Expected:
- 입력창에 세 줄이 **줄바꿈이 살아있는 상태로** 들어간다
- 상태 표시줄에 "삽입했습니다."가 뜬다
- 실제로 전송하면 한 개의 메시지로 줄바꿈이 보존되어 나간다

- [ ] **Step 2: 문장 중간 삽입 검증**

1. DM 입력창에 `앞부분뒷부분`을 직접 타이핑한다.
2. 방향키로 커서를 `앞부분|뒷부분` 위치로 옮긴다.
3. 문구를 클릭한다.

Expected: 커서 위치에 정확히 삽입되어 `앞부분<문구>뒷부분`이 된다. 맨 뒤에 붙으면 `mousedown`의 `preventDefault()`가 동작하지 않는 것이다.

- [ ] **Step 3: 게시물 작성창 검증**

1. 좌측 `+` 버튼으로 작성창을 연다.
2. 작성창을 클릭해 커서를 둔다.
3. 문구를 클릭한다.

Expected: 작성창에 삽입되고 「게시」 버튼이 활성화된다(흐릿하던 것이 또렷해진다).

- [ ] **Step 4: 대상 없음 상태 검증**

1. 페이지를 새로고침하고 어떤 입력창도 클릭하지 않은 채 패널을 연다.

Expected: DM 페이지라면 입력창이 하나뿐이므로 정상 동작한다. 입력창이 없는 페이지(예: 프로필 탐색 화면)에서는 문구 버튼이 흐려지고 "입력창을 먼저 클릭하세요."가 뜬다.

- [ ] **Step 5: SPA 라우팅 검증**

1. 패널을 연 채로 홈 → 메시지 → 프로필 순으로 이동한다.

Expected: 패널이 사라지지 않고 계속 떠 있으며, 각 화면에서 삽입이 정상 동작한다.

- [ ] **Step 6: 새로고침 후 상태 유지 검증**

1. 패널을 열어 둔 채 새로고침한다.

Expected: 패널이 열린 상태로 복원되고 저장한 문구가 그대로 보인다.

- [ ] **Step 7: Edge에서 Step 1–6 재확인**

`edge://extensions` → 개발자 모드 → "압축 풀린 확장 로드"로 같은 폴더를 선택하고 위 여섯 항목을 그대로 반복한다.

Expected: Chrome과 동일하게 동작한다. `chrome.*` API는 Edge에서 그대로 쓸 수 있다.

- [ ] **Step 8: 발견된 결함 수정**

위 단계에서 실패한 항목이 있으면 원인을 파악해 고치고, 가능하면 재발 방지 단위 테스트를 추가한다. 전부 통과했다면 이 단계는 건너뛴다.

- [ ] **Step 9: README 작성**

`README.md`:

````markdown
# Threads 저장된 문구

threads.com의 메시지 입력창과 게시물 작성창에, 저장해 둔 문구를 사이드바에서 클릭 한 번으로 넣는 브라우저 확장 프로그램입니다. Chrome과 Edge에서 동작합니다.

## 설치

빌드 과정이 없습니다. 저장소를 내려받아 그대로 로드하면 됩니다.

**Chrome:** `chrome://extensions` → 우측 상단 "개발자 모드" 켜기 → "압축해제된 확장 프로그램을 로드" → 이 폴더 선택

**Edge:** `edge://extensions` → 좌측 "개발자 모드" 켜기 → "압축 풀린 확장 로드" → 이 폴더 선택

## 사용법

1. threads.com에 접속하면 화면 우측에 「문구」 탭이 생깁니다.
2. 탭을 눌러 패널을 열고, 아래 입력란에 문구를 저장합니다. 제목은 선택 사항이며, 비우면 본문 첫 줄이 목록에 표시됩니다.
3. 메시지 입력창이나 게시물 작성창을 클릭해 커서를 둡니다.
4. 목록에서 문구를 클릭하면 커서 위치에 삽입됩니다.

여러 줄 문구도 줄바꿈이 그대로 보존됩니다.

## 개발

```bash
npm install
npm test
```

테스트는 Vitest + jsdom으로 돌아갑니다. 다만 jsdom은 실제 Lexical 에디터를 흉내 내지 못하므로, 삽입 동작 자체는 실제 threads.com에서 확인해야 합니다. 검증 항목은 `docs/superpowers/plans/2026-08-08-threads-snippets.md`의 Task 6에 있습니다.

## 구조

| 파일 | 책임 |
|---|---|
| `src/content/panel-css.js` | 사이드바 CSS (Shadow DOM에 주입할 문자열) |
| `src/content/storage.js` | `chrome.storage.local` 래퍼, 문구 CRUD |
| `src/content/detector.js` | Lexical 에디터 탐지, 삽입 대상 선택 |
| `src/content/inserter.js` | 삽입 전략 폴백 사다리 |
| `src/content/panel.js` | Shadow DOM 사이드바 UI |
| `src/content/index.js` | 진입점, MutationObserver |

빌드 도구를 쓰지 않으므로 소스에 `import`/`export`가 없습니다. 각 파일은 IIFE로 감싸 `globalThis.TSNIP` 네임스페이스에 기능을 붙이고, `manifest.json`에 적힌 순서대로 로드됩니다.

## 설계 배경

주요 결정의 근거와 실측 결과는 [설계 문서](docs/superpowers/specs/2026-08-08-threads-snippets-design.md)에 있습니다. 특히:

- 왜 `chrome.sidePanel` API를 쓰지 않았는지
- 왜 `execCommand`가 아니라 합성 `paste`가 1순위인지 (줄바꿈 보존)
- 왜 `mousedown`의 `preventDefault()`가 필수인지 (포커스·커서 보존)

## 범위 밖

카테고리·태그, 키보드 단축키, 변수 치환, 가져오기/내보내기, 사용 통계, 드래그 정렬은 넣지 않았습니다.
````

- [ ] **Step 10: 커밋**

```bash
git add README.md
git commit -m "docs: README 추가 및 실제 브라우저 검증 완료"
```
