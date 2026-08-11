import { describe, it, expect } from 'vitest';
import {
  applyInquiryAction,
  createInquiry,
  normalizeHandle,
  planInquiryAction,
  type InquirySlice,
} from '@/lib/inquiry/service';

function slice(extra: Partial<InquirySlice> = {}): InquirySlice {
  return {
    id: 'inq1',
    targetId: 'target1',
    fromHandle: 'alice',
    fromProfileId: null,
    status: 'RECEIVED',
    source: 'THREADS',
    note: null,
    target: { id: 'target1', seq: 67, sourceHandle: 'target_handle' },
    fromProfile: null,
    ...extra,
  };
}

describe('normalizeHandle', () => {
  it('@와 공백 이후를 제거한다', () => {
    expect(normalizeHandle('@alice')).toBe('alice');
    expect(normalizeHandle('  bob 님')).toBe('bob');
  });
});

describe('createInquiry', () => {
  const target = { id: 'target1', seq: 67, sourceHandle: 'target_handle', status: 'PUBLISHED' };

  it('게시 번호로 대상을 찾아 접수한다', async () => {
    let createdWith: unknown;
    const result = await createInquiry(
      { targetSeq: 67, fromHandle: '@alice', note: '67번 맘에 들어요' },
      {
        findTarget: async (by) => ('seq' in by && by.seq === 67 ? target : null),
        findOpen: async () => null,
        create: async (data) => {
          createdWith = data;
          return slice();
        },
      }
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reused).toBe(false);
    expect(createdWith).toMatchObject({
      targetId: 'target1',
      fromHandle: 'alice',
      note: '67번 맘에 들어요',
      source: 'THREADS',
    });
  });

  it('같은 (대상, 핸들)의 열린 문의가 있으면 재사용한다', async () => {
    const existing = slice({ status: 'SPEC_REQUESTED' });
    const result = await createInquiry(
      { targetSeq: 67, fromHandle: 'alice' },
      {
        findTarget: async () => target,
        findOpen: async () => existing,
        create: async () => {
          throw new Error('재사용해야 하는데 create가 불렸다');
        },
      }
    );
    expect(result).toEqual({ ok: true, inquiry: existing, reused: true });
  });

  it('없는 번호면 404', async () => {
    const result = await createInquiry(
      { targetSeq: 999, fromHandle: 'alice' },
      { findTarget: async () => null }
    );
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it('본인 프로필에 관심은 400', async () => {
    const result = await createInquiry(
      { targetSeq: 67, fromHandle: '@Target_Handle' },
      { findTarget: async () => target }
    );
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('대상 지정이 없으면 400', async () => {
    const result = await createInquiry({ fromHandle: 'alice' }, {});
    expect(result).toMatchObject({ ok: false, status: 400 });
  });
});

describe('planInquiryAction', () => {
  it('REQUEST_SPEC — 관심자에게 스펙 문의 전달을 만든다', () => {
    const plan = planInquiryAction(slice(), { action: 'REQUEST_SPEC', body: '스펙 보내주세요' });
    expect(plan).toMatchObject({ ok: true, toStatus: 'SPEC_REQUESTED' });
    if (plan.ok) {
      expect(plan.deliveries).toEqual([
        { kind: 'SPEC_REQUEST', toProfileId: null, toHandle: 'alice', body: '스펙 보내주세요' },
      ]);
    }
  });

  it('REQUEST_SPEC — 빈 문안이면 거부한다', () => {
    const plan = planInquiryAction(slice(), { action: 'REQUEST_SPEC', body: '  ' });
    expect(plan.ok).toBe(false);
  });

  it('FORWARD — 관심자 프로필이 연결돼야 하고, 후보에게 전달을 만든다', () => {
    const notAttached = planInquiryAction(slice({ status: 'SPEC_RECEIVED' }), {
      action: 'FORWARD',
      body: '전달문',
    });
    expect(notAttached.ok).toBe(false);

    const attached = planInquiryAction(
      slice({
        status: 'SPEC_RECEIVED',
        fromProfileId: 'from1',
        fromProfile: { id: 'from1', sourceHandle: 'alice' },
      }),
      { action: 'FORWARD', body: '전달문' }
    );
    expect(attached).toMatchObject({ ok: true, toStatus: 'FORWARDED' });
    if (attached.ok) {
      expect(attached.deliveries).toEqual([
        { kind: 'SPEC_FORWARD', toProfileId: 'target1', toHandle: 'target_handle', body: '전달문' },
      ]);
    }
  });

  it('ACCEPT — 넣은 문안 수만큼 CONNECT 전달을 만든다', () => {
    const base = slice({ status: 'FORWARDED', fromProfileId: 'from1' });
    const both = planInquiryAction(base, {
      action: 'ACCEPT',
      bodyForFrom: 'a에게',
      bodyForTarget: 'b에게',
    });
    expect(both).toMatchObject({ ok: true, toStatus: 'ACCEPTED' });
    if (both.ok) {
      expect(both.deliveries.map((d) => d.kind)).toEqual(['CONNECT', 'CONNECT']);
    }

    const none = planInquiryAction(base, { action: 'ACCEPT' });
    if (none.ok) expect(none.deliveries).toEqual([]);
  });

  it('상태에 맞지 않는 액션은 거부한다', () => {
    expect(planInquiryAction(slice(), { action: 'FORWARD', body: 'x' }).ok).toBe(false);
    expect(planInquiryAction(slice({ status: 'FORWARDED' }), { action: 'REQUEST_SPEC', body: 'x' }).ok).toBe(
      false
    );
    expect(planInquiryAction(slice(), { action: 'ACCEPT' }).ok).toBe(false);
  });

  it('ATTACH_PROFILE — 대상 프로필 자신은 관심자로 연결할 수 없다', () => {
    const plan = planInquiryAction(slice(), { action: 'ATTACH_PROFILE', fromProfileId: 'target1' });
    expect(plan.ok).toBe(false);
  });
});

describe('applyInquiryAction', () => {
  it('전이·전달 생성을 커밋하고 결과를 돌려준다', async () => {
    let committed: unknown;
    const result = await applyInquiryAction(
      'inq1',
      { action: 'REQUEST_SPEC', body: '스펙 주세요' },
      {
        find: async () => slice(),
        commit: async (args) => {
          committed = args;
          return { deliveryIds: ['d1'] };
        },
      }
    );
    expect(result).toEqual({ ok: true, status: 'SPEC_REQUESTED', deliveryIds: ['d1'] });
    expect(committed).toMatchObject({ inquiryId: 'inq1', fromStatus: 'RECEIVED', toStatus: 'SPEC_REQUESTED' });
  });

  it('없는 문의는 404, 종결된 문의는 409', async () => {
    expect(
      await applyInquiryAction('x', { action: 'CLOSE' }, { find: async () => null })
    ).toMatchObject({ ok: false, status: 404 });
    expect(
      await applyInquiryAction('x', { action: 'CLOSE' }, { find: async () => slice({ status: 'CLOSED' }) })
    ).toMatchObject({ ok: false, status: 409 });
  });

  it('ATTACH_PROFILE — 프로필 존재를 확인하고 커밋에 fromProfileId를 넘긴다', async () => {
    let committed: { fromProfileId?: string } | undefined;
    const ok = await applyInquiryAction(
      'inq1',
      { action: 'ATTACH_PROFILE', fromProfileId: 'from1' },
      {
        find: async () => slice(),
        findProfile: async (id) => (id === 'from1' ? { id, sourceHandle: 'alice' } : null),
        commit: async (args) => {
          committed = args;
          return { deliveryIds: [] };
        },
      }
    );
    expect(ok).toMatchObject({ ok: true, status: 'SPEC_RECEIVED' });
    expect(committed?.fromProfileId).toBe('from1');

    const missing = await applyInquiryAction(
      'inq1',
      { action: 'ATTACH_PROFILE', fromProfileId: 'ghost' },
      { find: async () => slice(), findProfile: async () => null }
    );
    expect(missing).toMatchObject({ ok: false, status: 404 });
  });

  it('동시 변경으로 커밋이 비면 409', async () => {
    const result = await applyInquiryAction(
      'inq1',
      { action: 'CLOSE' },
      { find: async () => slice(), commit: async () => null }
    );
    expect(result).toMatchObject({ ok: false, status: 409 });
  });
});
