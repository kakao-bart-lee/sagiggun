import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../src/content/storage.js';

const storage = () => globalThis.TSNIP.storage;

// tests/setup.js의 전역 beforeEach가 먼저 실행되어 __store를 비우고 즉시-resolve
// 스텁을 설치한다. 여기서는 그 뒤에 지연이 있는 버전으로 다시 덮어써서
// get/set 사이에 실제 인터리빙이 발생하도록 만든다 (경합을 재현하기 위함).
beforeEach(() => {
  globalThis.chrome = {
    storage: {
      local: {
        get: vi.fn(
          (key) =>
            new Promise((resolve) => {
              setTimeout(() => {
                resolve(
                  key in globalThis.__store
                    ? { [key]: globalThis.__store[key] }
                    : {}
                );
              }, 0);
            })
        ),
        set: vi.fn(
          (obj) =>
            new Promise((resolve) => {
              setTimeout(() => {
                Object.assign(globalThis.__store, obj);
                resolve();
              }, 0);
            })
        ),
      },
    },
  };
});

describe('storage 동시성 (경합 회귀)', () => {
  it('await 없이 동시에 시작한 add 세 개가 전부 반영된다', async () => {
    await Promise.all([
      storage().add({ body: 'A' }),
      storage().add({ body: 'B' }),
      storage().add({ body: 'C' }),
    ]);
    const list = await storage().list();
    expect(list).toHaveLength(3);
    expect(list.map((s) => s.body).sort()).toEqual(['A', 'B', 'C']);
  });

  it('동시에 시작한 add와 remove가 섞여도 최종 상태가 일관적이다', async () => {
    const existing = await storage().add({ body: '기존' });
    const [added] = await Promise.all([
      storage().add({ body: '새로 추가' }),
      storage().remove(existing.id),
    ]);
    const list = await storage().list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(added.id);
    expect(list[0].body).toBe('새로 추가');
  });

  it('큐 안에서 예외가 나도 이어지는 쓰기가 계속 실행된다', async () => {
    const explosive = {
      toString() {
        throw new Error('boom');
      },
    };
    await expect(storage().add({ body: explosive })).rejects.toThrow('boom');
    const ok = await storage().add({ body: '정상' });
    expect(ok.body).toBe('정상');
    expect(await storage().list()).toHaveLength(1);
  });

  it('구조분해해서 호출해도 동작한다 (this 바인딩에 의존하지 않는다)', async () => {
    const { add, list } = globalThis.TSNIP.storage;
    await add({ body: '구조분해' });
    expect(await list()).toHaveLength(1);
  });
});
