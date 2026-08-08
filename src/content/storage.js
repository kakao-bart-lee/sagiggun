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

  async function listSnippets() {
    return normalize(await read(KEY_SNIPPETS, []));
  }

  // --- 쓰기 직렬화 큐 --------------------------------------------------------
  // add/update/remove는 모두 "읽기 → 배열 수정 → 쓰기"의 read-modify-write
  // 패턴이다. 두 호출이 겹치면 나중 쓰기가 앞선 쓰기를 덮어써 항목이
  // 유실될 수 있으므로(예: 저장 버튼 빠르게 두 번 클릭), 각 쓰기 작업 전체를
  // 하나의 단위로 체인에 이어붙여 순서대로만 실행되게 한다. list()는
  // 읽기 전용이라 큐에 넣지 않는다.
  let chain = Promise.resolve();

  function enqueueWrite(task) {
    // 이전 작업의 성공/실패와 무관하게 이번 task를 실행한다.
    const run = chain.then(task, task);
    // 체인 자체는 절대 reject되지 않게 해서, 한 작업이 실패해도 뒤이은
    // 쓰기들이 영영 멈추지 않도록 한다. 호출자에게 돌려주는 것은 run이므로
    // 실제 성공/실패는 그대로 전달된다.
    chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  NS.storage = {
    async list() {
      return listSnippets();
    },

    async add({ title = '', body }) {
      return enqueueWrite(async () => {
        const snippet = {
          id: newId(),
          title: String(title),
          body: String(body),
          createdAt: Date.now(),
        };
        const list = await listSnippets();
        list.push(snippet);
        await write(KEY_SNIPPETS, list);
        return snippet;
      });
    },

    async update(id, { title, body } = {}) {
      return enqueueWrite(async () => {
        const list = await listSnippets();
        const i = list.findIndex((s) => s.id === id);
        if (i === -1) return null;
        if (title !== undefined) list[i].title = String(title);
        if (body !== undefined) list[i].body = String(body);
        await write(KEY_SNIPPETS, list);
        return list[i];
      });
    },

    async remove(id) {
      return enqueueWrite(async () => {
        const list = await listSnippets();
        const next = list.filter((s) => s.id !== id);
        if (next.length === list.length) return false;
        await write(KEY_SNIPPETS, next);
        return true;
      });
    },

    async isOpen() {
      return !!(await read(KEY_OPEN, false));
    },

    async setOpen(open) {
      await write(KEY_OPEN, !!open);
    },
  };
})();
