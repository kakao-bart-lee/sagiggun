import { describe, it, expect, vi } from 'vitest';
import { deleteProfile } from '@/lib/profile/service';

describe('deleteProfile', () => {
  it('사진 파일을 모두 지운 뒤 행을 지운다', async () => {
    const order: string[] = [];
    const removeFile = vi.fn(async (key: string) => {
      order.push(`file:${key}`);
    });
    const deleteRow = vi.fn(async () => {
      order.push('row');
    });

    await deleteProfile('p1', {
      listKeys: async () => ['p1/a.png', 'p1/b.png'],
      removeFile,
      deleteRow,
    });

    expect(removeFile).toHaveBeenCalledTimes(2);
    expect(deleteRow).toHaveBeenCalledWith('p1');
    expect(order).toEqual(['file:p1/a.png', 'file:p1/b.png', 'row']);
  });

  it('사진이 없어도 행을 지운다', async () => {
    const deleteRow = vi.fn(async () => {});
    await deleteProfile('p1', {
      listKeys: async () => [],
      removeFile: vi.fn(),
      deleteRow,
    });
    expect(deleteRow).toHaveBeenCalledWith('p1');
  });

  it('파일 삭제가 실패해도 행은 지운다', async () => {
    const deleteRow = vi.fn(async () => {});
    await deleteProfile('p1', {
      listKeys: async () => ['p1/a.png'],
      removeFile: async () => {
        throw new Error('EACCES');
      },
      deleteRow,
    });
    expect(deleteRow).toHaveBeenCalledWith('p1');
  });
});
