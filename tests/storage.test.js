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

  it('패널 위치 기본값은 right다', async () => {
    expect(await storage().getSide()).toBe('right');
  });

  it('패널 위치를 저장하고 읽는다', async () => {
    await storage().setSide('left');
    expect(await storage().getSide()).toBe('left');
  });

  it('left/right가 아닌 값은 right로 정규화한다', async () => {
    await storage().setSide('center');
    expect(await storage().getSide()).toBe('right');

    await storage().setSide(undefined);
    expect(await storage().getSide()).toBe('right');
  });
});
