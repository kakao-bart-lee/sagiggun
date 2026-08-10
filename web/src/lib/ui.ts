export const STATUS_LABEL: Record<string, string> = {
  COLLECTED: '대기',
  DRAFTED: '초안',
  APPROVED: '승인',
  PUBLISHED: '게시',
  ARCHIVED: '보관',
};

/** Telop seal color by workflow status */
export function statusTone(status: string): 'yellow' | 'red' | 'blue' {
  switch (status) {
    case 'APPROVED':
    case 'PUBLISHED':
      return 'red';
    case 'DRAFTED':
      return 'blue';
    default:
      return 'yellow';
  }
}

export const INQUIRY_STATUS_LABEL: Record<string, string> = {
  RECEIVED: '접수',
  SPEC_REQUESTED: '스펙 문의중',
  SPEC_RECEIVED: '스펙 도착',
  FORWARDED: '전달됨',
  ACCEPTED: '성사',
  DECLINED: '거절',
  CLOSED: '종료',
};

/** Telop seal color by inquiry status — 대기(노랑)·진행(파랑)·종결(빨강) 구분. */
export function inquiryStatusTone(status: string): 'yellow' | 'red' | 'blue' {
  switch (status) {
    case 'ACCEPTED':
    case 'DECLINED':
    case 'CLOSED':
      return 'red';
    case 'SPEC_REQUESTED':
    case 'SPEC_RECEIVED':
    case 'FORWARDED':
      return 'blue';
    default:
      return 'yellow';
  }
}

export const DELIVERY_KIND_LABEL: Record<string, string> = {
  MATCH_PROPOSAL: '매칭 제안',
  SPEC_REQUEST: '스펙 문의',
  SPEC_FORWARD: '스펙 전달',
  CONNECT: '성사 안내',
  OTHER: '기타',
};

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}
