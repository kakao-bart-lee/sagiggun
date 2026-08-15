import { describe, it, expect } from 'vitest';
import { rankMatches, MATCH_SYSTEM } from '@/lib/llm/match';
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
    seq: null,
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
    faceType: null,
    partnerFaceTypes: [],
    partnerHeightMin: null,
    partnerHeightMax: null,
    ...extra,
  };
}

describe('rankMatches — 양방향', () => {
  it('LLM에 게시번호를 넘기고 핸들은 넘기지 않는다', async () => {
    // 핸들이 프롬프트에 들어가면 LLM이 DM 초안에 그대로 쓴다. 번호로만 지칭해야 한다.
    let sent = '';
    await rankMatches(
      slice('s', { seq: 12, sourceHandle: 'subject_handle' }),
      [slice('c1', { seq: 43, sourceHandle: 'secret_handle' })],
      5,
      {
        parse: async (req) => {
          sent = JSON.stringify(req);
          return { parsed_output: { rankings: [] } };
        },
      }
    );
    expect(sent).toContain('43');
    expect(sent).not.toContain('secret_handle');
    expect(sent).not.toContain('subject_handle');
    expect(sent).toContain('c1'); // id는 남아야 candidateId를 되돌려받는다
  });

  it('두 방향 점수를 조화평균으로 묶는다', async () => {
    const [item] = await rankMatches(slice('s'), [slice('c1')], 5, {
      parse: async () => ({
        parsed_output: {
          rankings: [
            {
              candidateId: 'c1',
              scoreForSubject: 0.9,
              scoreForCandidate: 0.5,
              rationale: 'ok',
              draftForSubject: 'a',
              draftForCandidate: 'b',
            },
          ],
        },
      }),
    });
    expect(item.scoreForSubject).toBe(0.9);
    expect(item.scoreForCandidate).toBe(0.5);
    expect(item.score).toBeCloseTo(0.643, 3); // 2*.9*.5/1.4
  });

  it('한쪽 점수가 0이면 짝 점수도 0이다', async () => {
    const [item] = await rankMatches(slice('s'), [slice('c1')], 5, {
      parse: async () => ({
        parsed_output: {
          rankings: [
            {
              candidateId: 'c1',
              scoreForSubject: 0.9,
              scoreForCandidate: 0,
              rationale: 'ok',
              draftForSubject: 'a',
              draftForCandidate: 'b',
            },
          ],
        },
      }),
    });
    expect(item.score).toBe(0);
  });

  it('프롬프트가 상대의 선별 기준 누설을 금지한다', () => {
    expect(MATCH_SYSTEM).toMatch(/선별|조건|기준/);
    expect(MATCH_SYSTEM).toContain('번호');
    expect(MATCH_SYSTEM).not.toContain('핸들은 @로 표기');
  });
});

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
              scoreForSubject: 0.9,
              scoreForCandidate: 0.9,
              rationale: 'x',
              draftForSubject: 'a',
              draftForCandidate: 'b',
            },
            {
              candidateId: 'c1',
              scoreForSubject: 0.8,
              scoreForCandidate: 0.8,
              rationale: 'ok',
              draftForSubject: '',
              draftForCandidate: 'b',
            },
            {
              candidateId: 'c2',
              scoreForSubject: 0.8,
              scoreForCandidate: 0.6,
              rationale: 'ok',
              draftForSubject: 'to s',
              draftForCandidate: 'to c',
            },
            {
              candidateId: 'c2',
              scoreForSubject: 0.6,
              scoreForCandidate: 0.6,
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
        scoreForSubject: 0.8,
        scoreForCandidate: 0.6,
        score: 2 * 0.8 * 0.6 / 1.4, // 조화평균
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

  it('짝 점수가 높은 후보부터 LLM에 넘긴다', async () => {
    const subject = slice('s', { gender: 'M', region: '서울', partnerRegions: ['서울'] });
    // 둘 다 하드필터는 통과하지만, poor는 자기 지역 조건을 안 적어 반대 방향 점수가 낮다
    const good = slice('good', { gender: 'F', region: '서울', partnerRegions: ['서울'] });
    const poor = slice('poor', { gender: 'F', region: '서울', partnerRegions: [] });

    let seen: string[] = [];
    await runMatch('s', 5, {
      findSubject: async () => subject,
      listPool: async () => [poor, good], // 일부러 낮은 쪽을 먼저 둔다
      listJudged: async () => [],
      rank: async (_s, candidates) => {
        seen = candidates.map((c) => c.id);
        return [];
      },
      saveRun: async () => {
        throw new Error('should not save');
      },
    });
    expect(seen).toEqual(['good', 'poor']);
  });

  it('LLM에 넘기는 후보를 8명으로 자른다', async () => {
    const subject = slice('s', { gender: 'M' });
    const pool = Array.from({ length: 12 }, (_, i) => slice(`c${i}`, { gender: 'F' }));

    let count = 0;
    await runMatch('s', 5, {
      findSubject: async () => subject,
      listPool: async () => pool,
      listJudged: async () => [],
      rank: async (_s, candidates) => {
        count = candidates.length;
        return [];
      },
      saveRun: async () => {
        throw new Error('should not save');
      },
    });
    expect(count).toBe(8);
  });

  it('filteredCount는 LLM에 넘긴 수가 아니라 실제 필터 통과 수다', async () => {
    const subject = slice('s', { gender: 'M' });
    const pool = Array.from({ length: 12 }, (_, i) => slice(`c${i}`, { gender: 'F' }));

    const result = await runMatch('s', 5, {
      findSubject: async () => subject,
      listPool: async () => pool,
      listJudged: async () => [],
      rank: async () => [
        {
          candidateId: 'c0',
          scoreForSubject: 0.9,
          scoreForCandidate: 0.9,
          score: 0.9,
          rationale: 'ok',
          draftForSubject: 'a',
          draftForCandidate: 'b',
        },
      ],
      saveRun: async () => ({ runId: 'r', suggestions: [] }),
    });
    expect(result).toMatchObject({ ok: true, filteredCount: 12 });
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
          scoreForSubject: 0.9,
          scoreForCandidate: 0.9,
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
