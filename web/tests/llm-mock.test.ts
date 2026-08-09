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
