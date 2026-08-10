import type { InquiryStatus } from '@prisma/client';

// 수작업 흐름 그대로: 접수 → 스펙 문의 → 스펙 수신 → 후보 전달 → 성사/거절.
// CLOSED는 어느 단계에서든 갈 수 있는 종료(무응답·중단)다.
export const INQUIRY_TRANSITIONS: Record<InquiryStatus, InquiryStatus[]> = {
  RECEIVED: ['SPEC_REQUESTED', 'SPEC_RECEIVED', 'CLOSED'],
  SPEC_REQUESTED: ['SPEC_RECEIVED', 'CLOSED'],
  SPEC_RECEIVED: ['FORWARDED', 'CLOSED'],
  FORWARDED: ['ACCEPTED', 'DECLINED', 'CLOSED'],
  ACCEPTED: [],
  DECLINED: [],
  CLOSED: [],
};

export function canTransition(from: InquiryStatus, to: InquiryStatus): boolean {
  return INQUIRY_TRANSITIONS[from].includes(to);
}

export type InquiryAction =
  | 'REQUEST_SPEC'
  | 'ATTACH_PROFILE'
  | 'FORWARD'
  | 'ACCEPT'
  | 'DECLINE'
  | 'CLOSE';

export const ACTION_NEXT_STATUS: Record<InquiryAction, InquiryStatus> = {
  REQUEST_SPEC: 'SPEC_REQUESTED',
  ATTACH_PROFILE: 'SPEC_RECEIVED',
  FORWARD: 'FORWARDED',
  ACCEPT: 'ACCEPTED',
  DECLINE: 'DECLINED',
  CLOSE: 'CLOSED',
};

/** 종결 상태 — 재사용(중복 접수 방지) 판단에서 "열린 문의"가 아닌 것들. */
export const TERMINAL_STATUSES: InquiryStatus[] = ['ACCEPTED', 'DECLINED', 'CLOSED'];

export function isTerminal(status: InquiryStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
