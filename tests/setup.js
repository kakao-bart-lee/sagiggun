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
