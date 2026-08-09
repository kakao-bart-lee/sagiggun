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

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}
