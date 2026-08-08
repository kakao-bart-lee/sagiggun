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
