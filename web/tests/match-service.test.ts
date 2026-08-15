import { describe, it, expect } from 'vitest';
import { rankMatches } from '@/lib/llm/match';
import type { MatchProfileSlice } from '@/lib/match/filter';
import {
  acceptSuggestion,
  dismissSuggestion,
  patchDeliveryStatus,
  runMatch,
} from '@/lib/match/service';

function slice(id: string, extra: Partial<MatchProfileSlice> = {}): MatchProfileSlice {
  return {
    id,
    sourceHandle: id,
    status: 'PUBLISHED',
    gender: null,
    birthYear: 1995,
    region: '서울',
    partnerBirthYearMin: null,
    partnerBirthYearMax: null,
    partnerRegions: [],
    dealBreakers: [],
    idealType: [],
    hobbies: [],
    appealPoints: [],
    job: null,
    heightCm: null,
    ...extra,
  };
}

describe('rankMatches', () => {
  it('목록에 없는 candidateId와 빈 초안을 버린다', async () => {
    const subject = slice('s');
    const candidates = [slice('c1'), slice('c2')];
    const rankings = await rankMatches(subject, candidates, 5, {
      parse: async () => ({
        parsed_output: {
          rankings: [
            {
              candidateId: 'ghost',
              score: 0.9,
              rationale: 'x',
              draftForSubject: 'a',
              draftForCandidate: 'b',
            },
            {
              candidateId: 'c1',
              score: 0.8,
              rationale: 'ok',
              draftForSubject: '',
              draftForCandidate: 'b',
            },
            {
              candidateId: 'c2',
              score: 0.7,
              rationale: 'ok',
              draftForSubject: 'to s',
              draftForCandidate: 'to c',
            },
            {
              candidateId: 'c2',
              score: 0.6,
              rationale: 'dup',
              draftForSubject: 'x',
              draftForCandidate: 'y',
            },
          ],
        },
      }),
    });
    expect(rankings).toEqual([
      {
        candidateId: 'c2',
        score: 0.7,
        rationale: 'ok',
        draftForSubject: 'to s',
        draftForCandidate: 'to c',
      },
    ]);
  });
});

describe('runMatch', () => {
  it('이미 판정한 상대는 후보에서 뺀다', async () => {
    const ranked: string[] = [];
    await runMatch('s', 5, {
      findSubject: async () => slice('s', { gender: 'M' }),
      listPool: async () => [slice('judged', { gender: 'F' }), slice('fresh', { gender: 'F' })],
      listJudged: async () => ['judged'],
      rank: async (_subject, candidates) => {
        ranked.push(...candidates.map((c) => c.id));
        return [];
      },
      saveRun: async () => {
        throw new Error('should not save');
      },
    });
    expect(ranked).toEqual(['fresh']);
  });

  it('필터 통과 후보가 없으면 400', async () => {
    const result = await runMatch('s', 5, {
      findSubject: async () => slice('s'),
      listPool: async () => [],
      rank: async () => [],
      saveRun: async () => {
        throw new Error('should not save');
      },
    });
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: '하드필터를 통과한 후보가 없습니다.',
    });
  });

  it('LLM 순위를 저장한다', async () => {
    const result = await runMatch('s', 5, {
      findSubject: async () => slice('s'),
      listPool: async () => [slice('c1')],
      rank: async () => [
        {
          candidateId: 'c1',
          score: 0.9,
          rationale: '맞음',
          draftForSubject: 'hi',
          draftForCandidate: 'yo',
        },
      ],
      saveRun: async ({ rankings }) => ({
        runId: 'run1',
        suggestions: rankings.map((r, i) => ({
          id: 'sug' + i,
          runId: 'run1',
          candidateId: r.candidateId,
          rank: i + 1,
          score: r.score,
          rationale: r.rationale,
          draftForSubject: r.draftForSubject,
          draftForCandidate: r.draftForCandidate,
          status: 'PENDING' as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.runId).toBe('run1');
      expect(result.suggestions).toHaveLength(1);
    }
  });
});

describe('acceptSuggestion / dismiss', () => {
  it('PENDING만 수락한다', async () => {
    const ok = await acceptSuggestion('sug1', {
      find: async () => ({
        id: 'sug1',
        status: 'PENDING',
        draftForSubject: 'a',
        draftForCandidate: 'b',
        candidateId: 'c1',
        run: { subjectId: 's', subject: { sourceHandle: 's' } },
        candidate: { sourceHandle: 'c1' },
      }),
      accept: async () => ({
        suggestion: {
          id: 'sug1',
          runId: 'r',
          candidateId: 'c1',
          rank: 1,
          score: 1,
          rationale: 'x',
          draftForSubject: 'a',
          draftForCandidate: 'b',
          status: 'ACCEPTED',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        deliveryIds: ['d1', 'd2'],
      }),
    });
    expect(ok.ok).toBe(true);

    const conflict = await acceptSuggestion('sug1', {
      find: async () => ({
        id: 'sug1',
        status: 'ACCEPTED',
        draftForSubject: 'a',
        draftForCandidate: 'b',
        candidateId: 'c1',
        run: { subjectId: 's', subject: { sourceHandle: 's' } },
        candidate: { sourceHandle: 'c1' },
      }),
    });
    expect(conflict).toEqual({
      ok: false,
      status: 409,
      error: '이미 처리된 추천입니다.',
    });
  });

  it('dismiss는 update count를 본다', async () => {
    expect(await dismissSuggestion('x', { update: async () => 1 })).toEqual({ ok: true });
  });
});

describe('patchDeliveryStatus', () => {
  it('허용된 전이만 통과', async () => {
    const ok = await patchDeliveryStatus('d1', 'INSERTED', {
      find: async () => ({ id: 'd1', status: 'PENDING' }),
      update: async () => 1,
    });
    expect(ok).toEqual({ ok: true, status: 'INSERTED' });

    const bad = await patchDeliveryStatus('d1', 'INSERTED', {
      find: async () => ({ id: 'd1', status: 'DONE' }),
      update: async () => 1,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.status).toBe(400);
  });
});
