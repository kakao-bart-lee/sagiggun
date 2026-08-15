import type { MatchProfileSlice } from '@/lib/match/filter';

/**
 * 매칭이 읽는 필드. runMatch와 화면용 조회가 같은 걸 봐야 하므로 한 곳에 둔다 —
 * 나뉘어 있으면 필드를 더할 때 한쪽만 빠진다.
 */
export const CANDIDATE_SELECT = {
  id: true,
  seq: true,
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

export function defaultCandidateDeps() {
  return {
    findSubject: async (id: string): Promise<MatchProfileSlice | null> => {
      const { prisma } = await import('@/lib/prisma');
      return prisma.profile.findUnique({ where: { id }, select: CANDIDATE_SELECT });
    },

    listPool: async (): Promise<MatchProfileSlice[]> => {
      const { prisma } = await import('@/lib/prisma');
      return prisma.profile.findMany({
        where: { status: { in: ['APPROVED', 'PUBLISHED'] } },
        select: CANDIDATE_SELECT,
        orderBy: { updatedAt: 'desc' },
      });
    },

    // 한 번 수락하거나 거절한 짝은 다시 올리지 않는다. 짝은 방향이 없으므로
    // subject가 어느 쪽에 있었든 같은 상대로 본다.
    listJudged: async (subjectId: string): Promise<string[]> => {
      const { prisma } = await import('@/lib/prisma');
      const rows = await prisma.matchSuggestion.findMany({
        where: {
          status: { not: 'PENDING' },
          OR: [{ run: { subjectId } }, { candidateId: subjectId }],
        },
        select: { candidateId: true, run: { select: { subjectId: true } } },
      });
      return rows.map((r) => (r.candidateId === subjectId ? r.run.subjectId : r.candidateId));
    },
  };
}
