import type { Status } from '@prisma/client';

export type Check = { ok: true } | { ok: false; reason: string };

function hasBody(body: string | null): boolean {
  return !!body && body.trim().length > 0;
}

export function canApprove(p: { finalBody: string | null; status: Status }): Check {
  if (p.status === 'ARCHIVED') return { ok: false, reason: '보관된 프로필은 승인할 수 없습니다.' };
  if (!hasBody(p.finalBody)) return { ok: false, reason: '게시 문구가 비어 있습니다.' };
  return { ok: true };
}

export function canPublish(p: { status: Status; finalBody: string | null }): Check {
  if (p.status === 'PUBLISHED') return { ok: false, reason: '이미 게시된 프로필입니다.' };
  if (p.status !== 'APPROVED') return { ok: false, reason: '승인된 프로필만 게시할 수 있습니다.' };
  if (!hasBody(p.finalBody)) return { ok: false, reason: '게시 문구가 비어 있습니다.' };
  return { ok: true };
}

// 승인 후 문구를 고치면 승인이 무효가 된다. 사람이 다시 봐야 한다.
export function statusAfterEdit(current: Status): Status {
  if (current === 'APPROVED') return 'DRAFTED';
  return current;
}

export function statusAfterUnarchive(p: { draftBody: string | null }): Status {
  return hasBody(p.draftBody) ? 'DRAFTED' : 'COLLECTED';
}
