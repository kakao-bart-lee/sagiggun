import { filterCandidates, type MatchProfileSlice } from '@/lib/match/filter';
import { rankMatches, type MatchRankItem } from '@/lib/llm/match';
import type { DeliveryStatus, MatchSuggestion, MatchSuggestionStatus } from '@prisma/client';

const SELECT_SLICE = {
  id: true,
  sourceHandle: true,
  status: true,
  gender: true,
  birthYear: true,
  region: true,
  partnerBirthYearMin: true,
  partnerBirthYearMax: true,
  partnerRegions: true,
  dealBreakers: true,
  idealType: true,
  hobbies: true,
  appealPoints: true,
  job: true,
  heightCm: true,
} as const;

export const DEFAULT_TOP_N = 5;
export const MAX_LLM_CANDIDATES = 30;

export type RunMatchResult =
  | {
      ok: true;
      runId: string;
      filteredCount: number;
      suggestions: MatchSuggestion[];
    }
  | { ok: false; status: 400 | 404; error: string };

export type RunMatchDeps = {
  findSubject?: (id: string) => Promise<MatchProfileSlice | null>;
  listPool?: () => Promise<MatchProfileSlice[]>;
  rank?: (
    subject: MatchProfileSlice,
    candidates: MatchProfileSlice[],
    topN: number
  ) => Promise<MatchRankItem[]>;
  saveRun?: (args: {
    subjectId: string;
    rankings: MatchRankItem[];
  }) => Promise<{ runId: string; suggestions: MatchSuggestion[] }>;
};

export async function runMatch(
  subjectId: string,
  topN: number = DEFAULT_TOP_N,
  deps: RunMatchDeps = {}
): Promise<RunMatchResult> {
  const findSubject =
    deps.findSubject ??
    (async (id: string) => {
      const { prisma } = await import('@/lib/prisma');
      return prisma.profile.findUnique({ where: { id }, select: SELECT_SLICE });
    });

  const listPool =
    deps.listPool ??
    (async () => {
      const { prisma } = await import('@/lib/prisma');
      return prisma.profile.findMany({
        where: { status: { in: ['APPROVED', 'PUBLISHED'] } },
        select: SELECT_SLICE,
        orderBy: { updatedAt: 'desc' },
      });
    });

  const rank =
    deps.rank ??
    ((subject, candidates, n) => rankMatches(subject, candidates, n));

  const saveRun =
    deps.saveRun ??
    (async ({ subjectId: sid, rankings }) => {
      const { prisma } = await import('@/lib/prisma');
      const run = await prisma.matchRun.create({
        data: {
          subjectId: sid,
          suggestions: {
            create: rankings.map((r, i) => ({
              candidateId: r.candidateId,
              rank: i + 1,
              score: r.score,
              rationale: r.rationale,
              draftForSubject: r.draftForSubject,
              draftForCandidate: r.draftForCandidate,
            })),
          },
        },
        include: { suggestions: { orderBy: { rank: 'asc' } } },
      });
      return { runId: run.id, suggestions: run.suggestions };
    });

  const subject = await findSubject(subjectId);
  if (!subject) return { ok: false, status: 404, error: '없는 프로필입니다.' };

  const pool = await listPool();
  const filtered = filterCandidates(subject, pool).slice(0, MAX_LLM_CANDIDATES);
  if (filtered.length === 0) {
    return { ok: false, status: 400, error: '하드필터를 통과한 후보가 없습니다.' };
  }

  const rankings = await rank(subject, filtered, topN);
  if (rankings.length === 0) {
    return { ok: false, status: 400, error: 'LLM이 유효한 추천을 반환하지 않았습니다.' };
  }

  const saved = await saveRun({ subjectId, rankings });
  return {
    ok: true,
    runId: saved.runId,
    filteredCount: filtered.length,
    suggestions: saved.suggestions,
  };
}

export type AcceptSuggestionResult =
  | { ok: true; suggestion: MatchSuggestion; deliveryIds: string[] }
  | { ok: false; status: 400 | 404 | 409; error: string };

export type AcceptSuggestionDeps = {
  find?: (id: string) => Promise<{
    id: string;
    status: MatchSuggestionStatus;
    draftForSubject: string;
    draftForCandidate: string;
    candidateId: string;
    run: { subjectId: string; subject: { sourceHandle: string } };
    candidate: { sourceHandle: string };
  } | null>;
  accept?: (args: {
    suggestionId: string;
    subjectId: string;
    subjectHandle: string;
    candidateId: string;
    candidateHandle: string;
    draftForSubject: string;
    draftForCandidate: string;
  }) => Promise<{ suggestion: MatchSuggestion; deliveryIds: string[] } | null>;
};

export async function acceptSuggestion(
  suggestionId: string,
  deps: AcceptSuggestionDeps = {}
): Promise<AcceptSuggestionResult> {
  const find =
    deps.find ??
    (async (id: string) => {
      const { prisma } = await import('@/lib/prisma');
      return prisma.matchSuggestion.findUnique({
        where: { id },
        include: {
          run: { include: { subject: { select: { sourceHandle: true } } } },
          candidate: { select: { sourceHandle: true } },
        },
      });
    });

  const accept =
    deps.accept ??
    (async (args) => {
      const { prisma } = await import('@/lib/prisma');
      return prisma.$transaction(async (tx) => {
        const updated = await tx.matchSuggestion.updateMany({
          where: { id: args.suggestionId, status: 'PENDING' },
          data: { status: 'ACCEPTED' },
        });
        if (updated.count !== 1) return null;

        const d1 = await tx.deliveryItem.create({
          data: {
            suggestionId: args.suggestionId,
            toProfileId: args.subjectId,
            toHandle: args.subjectHandle,
            body: args.draftForSubject,
          },
        });
        const d2 = await tx.deliveryItem.create({
          data: {
            suggestionId: args.suggestionId,
            toProfileId: args.candidateId,
            toHandle: args.candidateHandle,
            body: args.draftForCandidate,
          },
        });
        const suggestion = await tx.matchSuggestion.findUniqueOrThrow({
          where: { id: args.suggestionId },
        });
        return { suggestion, deliveryIds: [d1.id, d2.id] };
      });
    });

  const row = await find(suggestionId);
  if (!row) return { ok: false, status: 404, error: '없는 추천입니다.' };
  if (row.status !== 'PENDING') {
    return { ok: false, status: 409, error: '이미 처리된 추천입니다.' };
  }

  const result = await accept({
    suggestionId,
    subjectId: row.run.subjectId,
    subjectHandle: row.run.subject.sourceHandle,
    candidateId: row.candidateId,
    candidateHandle: row.candidate.sourceHandle,
    draftForSubject: row.draftForSubject,
    draftForCandidate: row.draftForCandidate,
  });
  if (!result) {
    return { ok: false, status: 409, error: '이미 처리된 추천입니다.' };
  }
  return { ok: true, suggestion: result.suggestion, deliveryIds: result.deliveryIds };
}

export type DismissSuggestionResult =
  | { ok: true }
  | { ok: false; status: 404 | 409; error: string };

export async function dismissSuggestion(
  suggestionId: string,
  deps: {
    update?: (id: string) => Promise<number>;
  } = {}
): Promise<DismissSuggestionResult> {
  const update =
    deps.update ??
    (async (id: string) => {
      const { prisma } = await import('@/lib/prisma');
      const r = await prisma.matchSuggestion.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'DISMISSED' },
      });
      return r.count;
    });

  const count = await update(suggestionId);
  if (count === 0) {
    // 존재 여부 구분
    const { prisma } = await import('@/lib/prisma');
    const exists = await prisma.matchSuggestion.findUnique({
      where: { id: suggestionId },
      select: { id: true },
    });
    if (!exists) return { ok: false, status: 404, error: '없는 추천입니다.' };
    return { ok: false, status: 409, error: '이미 처리된 추천입니다.' };
  }
  return { ok: true };
}

const DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  PENDING: ['INSERTED', 'DONE', 'CANCELLED'],
  INSERTED: ['DONE', 'CANCELLED'],
  DONE: [],
  CANCELLED: [],
};

export type PatchDeliveryResult =
  | { ok: true; status: DeliveryStatus }
  | { ok: false; status: 400 | 404 | 409; error: string };

export async function patchDeliveryStatus(
  id: string,
  next: DeliveryStatus,
  deps: {
    find?: (id: string) => Promise<{ id: string; status: DeliveryStatus } | null>;
    update?: (id: string, from: DeliveryStatus, to: DeliveryStatus) => Promise<number>;
  } = {}
): Promise<PatchDeliveryResult> {
  const find =
    deps.find ??
    (async (deliveryId: string) => {
      const { prisma } = await import('@/lib/prisma');
      return prisma.deliveryItem.findUnique({
        where: { id: deliveryId },
        select: { id: true, status: true },
      });
    });
  const update =
    deps.update ??
    (async (deliveryId, from, to) => {
      const { prisma } = await import('@/lib/prisma');
      const r = await prisma.deliveryItem.updateMany({
        where: { id: deliveryId, status: from },
        data: { status: to },
      });
      return r.count;
    });

  const row = await find(id);
  if (!row) return { ok: false, status: 404, error: '없는 전달 항목입니다.' };
  const allowed = DELIVERY_TRANSITIONS[row.status];
  if (!allowed.includes(next)) {
    return {
      ok: false,
      status: 400,
      error: `${row.status} → ${next} 전이는 허용되지 않습니다.`,
    };
  }
  const count = await update(id, row.status, next);
  if (count !== 1) {
    return { ok: false, status: 409, error: '상태가 이미 변경되었습니다.' };
  }
  return { ok: true, status: next };
}
