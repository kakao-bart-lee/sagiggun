import { beforeEach, vi } from 'vitest';

// --- chrome.storage.local 스텁 -------------------------------------------
// get/set을 beforeEach마다 새로 만든다. 개별 테스트가 실패를 재현하려고
// globalThis.chrome.storage.local.get/set을 던지는 걸로 덮어쓰는 경우가
// 있는데(예: tests/storage.test.js의 "storage 읽기/쓰기 실패" 스위트),
// 여기서 매번 재생성하지 않으면 그 오염된 스텁이 파일 끝까지, 심지어
// 다음 테스트 파일까지 살아남아 원인 불명의 실패를 만든다.
globalThis.__store = {};
function freshChromeStub() {
  return {
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
}
globalThis.chrome = freshChromeStub();

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
  globalThis.chrome = freshChromeStub();
  document.documentElement.innerHTML = '<head></head><body></body>';
});
