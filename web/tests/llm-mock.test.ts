import { describe, it, expect } from 'vitest';
import { mockCompose, mockExtract, mockRankMatches } from '@/lib/llm/mock';
import { hasTemplateShape } from '@/lib/llm/template';

describe('llm mock fixtures', () => {
  it('mockExtract는 키워드를 반영한다', () => {
    const f = mockExtract('남성 95년생 서울 마포 178cm 개발자');
    expect(f.gender).toBe('M');
    expect(f.birthYear).toBe(1995);
    expect(f.region).toContain('서울');
  });

  it('mockCompose는 템플릿 마커를 포함한다', () => {
    const body = mockCompose(mockExtract('여성 01년생 서울'));
    expect(hasTemplateShape(body)).toBe(true);
  });

  it('mockRankMatches는 topN개를 돌려준다', () => {
    const subject = {
      id: 's',
      seq: null,
      sourceHandle: 's',
      status: 'PUBLISHED' as const,
      gender: 'F',
      birthYear: 1998,
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
    };
    const ranks = mockRankMatches(
      subject,
      [
        { ...subject, id: 'c1', sourceHandle: 'c1' },
        { ...subject, id: 'c2', sourceHandle: 'c2' },
      ],
      1
    );
    expect(ranks).toHaveLength(1);
    expect(ranks[0].candidateId).toBe('c1');
  });
});

describe('mockRankMatches — 계약 준수', () => {
  const base = {
    id: 's',
    seq: 12,
    sourceHandle: 'subject_handle',
    status: 'PUBLISHED' as const,
    gender: 'M',
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
  };

  it('초안에 핸들을 쓰지 않고 게시번호로 지칭한다', () => {
    const [r] = mockRankMatches(base, [{ ...base, id: 'c', seq: 43, sourceHandle: 'secret_handle' }], 1);
    expect(r.draftForSubject).not.toContain('secret_handle');
    expect(r.draftForSubject).not.toContain('subject_handle');
    expect(r.draftForCandidate).not.toContain('secret_handle');
    expect(r.draftForSubject).toContain('43번');
    expect(r.draftForCandidate).toContain('12번');
  });

  it('번호가 아직 없으면 번호인 척하지 않는다', () => {
    const [r] = mockRankMatches(base, [{ ...base, id: 'c', seq: null }], 1);
    expect(r.draftForSubject).not.toContain('null');
  });

  it('score는 두 방향의 조화평균이다', () => {
    const [r] = mockRankMatches(base, [{ ...base, id: 'c', seq: 43 }], 1);
    const h = (2 * r.scoreForSubject * r.scoreForCandidate) / (r.scoreForSubject + r.scoreForCandidate);
    expect(r.score).toBeCloseTo(h, 10);
  });
});
