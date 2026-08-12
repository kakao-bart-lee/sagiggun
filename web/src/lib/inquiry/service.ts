import type { DeliveryKind, Inquiry, InquirySource, InquiryStatus } from '@prisma/client';
import { ACTION_NEXT_STATUS, canTransition, isTerminal, type InquiryAction } from '@/lib/inquiry/state';

// match/service.ts와 같은 구조: 기본 구현은 prisma를 함수 안에서 동적으로 불러오고,
// 테스트는 deps로 가짜 구현을 주입한다.

export type InquirySlice = Pick<
  Inquiry,
  'id' | 'targetId' | 'fromHandle' | 'fromProfileId' | 'status' | 'source' | 'note'
> & {
  target: { id: string; seq: number | null; sourceHandle: string };
  fromProfile: { id: string; sourceHandle: string } | null;
};

export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@/, '').replace(/\s.*$/, '');
}

// ---------------------------------------------------------------------------
// 생성 — 관심 접수. 같은 (대상, 핸들)의 열린 문의가 있으면 새로 만들지 않고 재사용한다.
// 같은 사람이 같은 게시글에 DM을 두 번 보내는 일은 흔하고, 문의가 둘로 갈리면
// 스펙 문의·전달이 어느 건에 붙었는지 운영자가 헷갈리게 된다.
// ---------------------------------------------------------------------------

export type CreateInquiryInput = {
  targetId?: string;
  /** 게시 번호로도 받을 수 있다 — 관심 DM은 "67번"처럼 번호로 온다. */
  targetSeq?: number;
  fromHandle: string;
  fromProfileId?: string;
  note?: string;
  source?: InquirySource;
};

export type CreateInquiryResult =
  | { ok: true; inquiry: InquirySlice; reused: boolean }
  | { ok: false; status: 400 | 404; error: string };

export type CreateInquiryDeps = {
  findTarget?: (
    by: { id: string } | { seq: number }
  ) => Promise<{ id: string; seq: number | null; sourceHandle: string; status: string } | null>;
  findOpen?: (targetId: string, fromHandle: string) => Promise<InquirySlice | null>;
  create?: (data: {
    targetId: string;
    fromHandle: string;
    fromProfileId: string | null;
    note: string | null;
    source: InquirySource;
  }) => Promise<InquirySlice>;
};

const SLICE_INCLUDE = {
  target: { select: { id: true, seq: true, sourceHandle: true } },
  fromProfile: { select: { id: true, sourceHandle: true } },
} as const;

export async function createInquiry(
  input: CreateInquiryInput,
  deps: CreateInquiryDeps = {}
): Promise<CreateInquiryResult> {
  const findTarget =
    deps.findTarget ??
    (async (by: { id: string } | { seq: number }) => {
      const { prisma } = await import('@/lib/prisma');
      return prisma.profile.findUnique({
        where: 'id' in by ? { id: by.id } : { seq: by.seq },
        select: { id: true, seq: true, sourceHandle: true, status: true },
      });
    });

  const findOpen =
    deps.findOpen ??
    (async (targetId: string, fromHandle: string) => {
      const { prisma } = await import('@/lib/prisma');
      return prisma.inquiry.findFirst({
        where: {
          targetId,
          fromHandle: { equals: fromHandle, mode: 'insensitive' },
          status: { notIn: ['ACCEPTED', 'DECLINED', 'CLOSED'] },
        },
        include: SLICE_INCLUDE,
      });
    });

  const create =
    deps.create ??
    (async (data) => {
      const { prisma } = await import('@/lib/prisma');
      return prisma.inquiry.create({ data, include: SLICE_INCLUDE });
    });

  const fromHandle = normalizeHandle(input.fromHandle ?? '');
  if (!fromHandle) return { ok: false, status: 400, error: '관심 보낸 분의 핸들이 필요합니다.' };

  const by =
    input.targetId != null
      ? { id: input.targetId }
      : input.targetSeq != null
        ? { seq: input.targetSeq }
        : null;
  if (!by) return { ok: false, status: 400, error: '대상 프로필(id 또는 게시 번호)이 필요합니다.' };

  const target = await findTarget(by);
  if (!target) return { ok: false, status: 404, error: '대상 프로필을 찾지 못했습니다.' };
  if (normalizeHandle(target.sourceHandle).toLowerCase() === fromHandle.toLowerCase()) {
    return { ok: false, status: 400, error: '본인 프로필에는 관심을 접수할 수 없습니다.' };
  }

  const existing = await findOpen(target.id, fromHandle);
  if (existing) return { ok: true, inquiry: existing, reused: true };

  const inquiry = await create({
    targetId: target.id,
    fromHandle,
    fromProfileId: input.fromProfileId ?? null,
    note: input.note?.trim() || null,
    source: input.source ?? 'THREADS',
  });
  return { ok: true, inquiry, reused: false };
}

// ---------------------------------------------------------------------------
// 액션 — 상태 전이 + 전달 큐 생성을 한 트랜잭션으로 묶는다.
// ---------------------------------------------------------------------------

export type InquiryActionInput =
  | { action: 'REQUEST_SPEC'; body: string }
  | { action: 'ATTACH_PROFILE'; fromProfileId: string }
  | { action: 'FORWARD'; body: string }
  | { action: 'ACCEPT'; bodyForFrom?: string; bodyForTarget?: string }
  | { action: 'DECLINE'; body?: string }
  | { action: 'CLOSE' };

export type DeliveryDraft = {
  kind: DeliveryKind;
  toProfileId: string | null;
  toHandle: string;
  body: string;
};

export type ApplyInquiryActionResult =
  | { ok: true; status: InquiryStatus; deliveryIds: string[] }
  | { ok: false; status: 400 | 404 | 409; error: string };

export type ApplyInquiryActionDeps = {
  find?: (id: string) => Promise<InquirySlice | null>;
  findProfile?: (id: string) => Promise<{ id: string; sourceHandle: string } | null>;
  commit?: (args: {
    inquiryId: string;
    fromStatus: InquiryStatus;
    toStatus: InquiryStatus;
    fromProfileId?: string;
    deliveries: DeliveryDraft[];
  }) => Promise<{ deliveryIds: string[] } | null>;
};

/**
 * 액션의 유효성 검사·전달 초안 계산만 하는 순수 함수.
 * 트랜잭션 바깥에서 실패를 조기에 돌려주기 위해 분리했다.
 */
export function planInquiryAction(
  inquiry: InquirySlice,
  input: InquiryActionInput
): { ok: true; toStatus: InquiryStatus; deliveries: DeliveryDraft[] } | { ok: false; error: string } {
  const toStatus = ACTION_NEXT_STATUS[input.action as InquiryAction];
  if (!toStatus) return { ok: false, error: '알 수 없는 액션입니다.' };
  if (!canTransition(inquiry.status, toStatus)) {
    return { ok: false, error: `${inquiry.status} 상태에서는 ${input.action}을 할 수 없습니다.` };
  }

  const deliveries: DeliveryDraft[] = [];

  switch (input.action) {
    case 'REQUEST_SPEC': {
      if (!input.body?.trim()) return { ok: false, error: '보낼 문안이 비어 있습니다.' };
      deliveries.push({
        kind: 'SPEC_REQUEST',
        toProfileId: inquiry.fromProfileId,
        toHandle: inquiry.fromHandle,
        body: input.body,
      });
      break;
    }
    case 'ATTACH_PROFILE': {
      if (!input.fromProfileId) return { ok: false, error: '연결할 프로필이 필요합니다.' };
      if (input.fromProfileId === inquiry.targetId) {
        return { ok: false, error: '관심 대상 프로필을 관심자로 연결할 수 없습니다.' };
      }
      break;
    }
    case 'FORWARD': {
      if (!inquiry.fromProfileId) {
        return { ok: false, error: '관심자 프로필이 연결되지 않았습니다. 스펙을 먼저 수집하세요.' };
      }
      if (!input.body?.trim()) return { ok: false, error: '보낼 문안이 비어 있습니다.' };
      deliveries.push({
        kind: 'SPEC_FORWARD',
        toProfileId: inquiry.targetId,
        toHandle: inquiry.target.sourceHandle,
        body: input.body,
      });
      break;
    }
    case 'ACCEPT': {
      if (input.bodyForFrom?.trim()) {
        deliveries.push({
          kind: 'CONNECT',
          toProfileId: inquiry.fromProfileId,
          toHandle: inquiry.fromHandle,
          body: input.bodyForFrom,
        });
      }
      if (input.bodyForTarget?.trim()) {
        deliveries.push({
          kind: 'CONNECT',
          toProfileId: inquiry.targetId,
          toHandle: inquiry.target.sourceHandle,
          body: input.bodyForTarget,
        });
      }
      break;
    }
    case 'DECLINE': {
      if (input.body?.trim()) {
        deliveries.push({
          kind: 'OTHER',
          toProfileId: inquiry.fromProfileId,
          toHandle: inquiry.fromHandle,
          body: input.body,
        });
      }
      break;
    }
    case 'CLOSE':
      break;
  }

  return { ok: true, toStatus, deliveries };
}

export async function applyInquiryAction(
  id: string,
  input: InquiryActionInput,
  deps: ApplyInquiryActionDeps = {}
): Promise<ApplyInquiryActionResult> {
  const find =
    deps.find ??
    (async (inquiryId: string) => {
      const { prisma } = await import('@/lib/prisma');
      return prisma.inquiry.findUnique({ where: { id: inquiryId }, include: SLICE_INCLUDE });
    });

  const findProfile =
    deps.findProfile ??
    (async (profileId: string) => {
      const { prisma } = await import('@/lib/prisma');
      return prisma.profile.findUnique({
        where: { id: profileId },
        select: { id: true, sourceHandle: true },
      });
    });

  const commit =
    deps.commit ??
    (async ({ inquiryId, fromStatus, toStatus, fromProfileId, deliveries }) => {
      const { prisma } = await import('@/lib/prisma');
      return prisma.$transaction(async (tx) => {
        // 상태 가드가 있는 updateMany — 두 탭에서 같은 액션을 눌러도 한 번만 적용된다.
        const updated = await tx.inquiry.updateMany({
          where: { id: inquiryId, status: fromStatus },
          data: { status: toStatus, ...(fromProfileId ? { fromProfileId } : {}) },
        });
        if (updated.count !== 1) return null;

        const deliveryIds: string[] = [];
        for (const draft of deliveries) {
          const created = await tx.deliveryItem.create({
            data: { inquiryId, ...draft },
            select: { id: true },
          });
          deliveryIds.push(created.id);
        }
        return { deliveryIds };
      });
    });

  const inquiry = await find(id);
  if (!inquiry) return { ok: false, status: 404, error: '없는 관심 건입니다.' };
  if (isTerminal(inquiry.status)) {
    return { ok: false, status: 409, error: '이미 종결된 문의입니다.' };
  }

  if (input.action === 'ATTACH_PROFILE') {
    const profile = input.fromProfileId ? await findProfile(input.fromProfileId) : null;
    if (!profile) return { ok: false, status: 404, error: '연결할 프로필을 찾지 못했습니다.' };
  }

  const plan = planInquiryAction(inquiry, input);
  if (!plan.ok) return { ok: false, status: 400, error: plan.error };

  const committed = await commit({
    inquiryId: id,
    fromStatus: inquiry.status,
    toStatus: plan.toStatus,
    fromProfileId: input.action === 'ATTACH_PROFILE' ? input.fromProfileId : undefined,
    deliveries: plan.deliveries,
  });
  if (!committed) {
    return { ok: false, status: 409, error: '상태가 이미 변경되었습니다. 새로고침 후 다시 시도하세요.' };
  }
  return { ok: true, status: plan.toStatus, deliveryIds: committed.deliveryIds };
}
