(() => {
  const NS = (globalThis.TSNIP = globalThis.TSNIP || {});
  const KEY_SNIPPETS = 'snippets';
  const KEY_OPEN = 'panelOpen';
  const KEY_SIDE = 'panelSide';

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

  // add/update/remove가 "읽기 → 배열 수정 → 쓰기"를 하기 직전의 읽기에서만
  // 쓴다. read()와 달리 실패를 fallback으로 감추지 않고 그대로 던진다 —
  // 삼키면 호출자가 "원래 비어 있었다"고 오인해 빈 배열 위에 새 항목
  // 하나만 써서 기존 문구를 전부 지워버릴 수 있기 때문이다. 값이 아직
  // 없는 정상 상태(첫 add 등)는 예외가 아니라 undefined를 돌려준다.
  async function readForWrite(key) {
    const a = area();
    if (!a) throw new Error('[TSNIP] storage area unavailable');
    const res = await a.get(key);
    return res && key in res ? res[key] : undefined;
  }

  async function write(key, value) {
    const a = area();
    if (!a) return false;
    try {
      await a.set({ [key]: value });
      return true;
    } catch (err) {
      console.warn('[TSNIP] storage write failed', err);
      return false;
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

  // 쓰기 경로 전용: 읽기가 실패하면 던진다(위 readForWrite 참고).
  async function listSnippetsForWrite() {
    return normalize(await readForWrite(KEY_SNIPPETS));
  }

  async function writeSnippetsOrThrow(list) {
    const ok = await write(KEY_SNIPPETS, list);
    if (!ok) throw new Error('[TSNIP] 문구 저장 실패');
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
        const list = await listSnippetsForWrite();
        list.push(snippet);
        await writeSnippetsOrThrow(list);
        return snippet;
      });
    },

    async update(id, { title, body } = {}) {
      return enqueueWrite(async () => {
        const list = await listSnippetsForWrite();
        const i = list.findIndex((s) => s.id === id);
        if (i === -1) return null;
        if (title !== undefined) list[i].title = String(title);
        if (body !== undefined) list[i].body = String(body);
        await writeSnippetsOrThrow(list);
        return list[i];
      });
    },

    async remove(id) {
      return enqueueWrite(async () => {
        const list = await listSnippetsForWrite();
        const next = list.filter((s) => s.id !== id);
        if (next.length === list.length) return false;
        await writeSnippetsOrThrow(next);
        return true;
      });
    },

    async isOpen() {
      return !!(await read(KEY_OPEN, false));
    },

    async setOpen(open) {
      await write(KEY_OPEN, !!open);
    },

    async getSide() {
      const side = await read(KEY_SIDE, 'right');
      return side === 'left' ? 'left' : 'right';
    },

    async setSide(side) {
      await write(KEY_SIDE, side === 'left' ? 'left' : 'right');
    },
  };
})();
