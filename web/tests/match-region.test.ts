import { describe, it, expect } from 'vitest';
import { regionTags, regionsOverlap, regionLabel, REGION_CODES } from '@/lib/match/region';

describe('regionTags', () => {
  it('시·구가 붙어 있어도 광역으로 잡는다', () => {
    expect(regionTags('서울 강남')).toEqual(['서울']);
    expect(regionTags('경기 성남')).toEqual(['경기']);
  });

  it('광역시는 자기 코드와 상위 도를 함께 갖는다', () => {
    // 대구는 「경상도권」을 원하는 사람에게 맞아야 한다
    expect(regionTags('대구')).toContain('대구');
    expect(regionTags('대구')).toContain('경북');
  });

  it('「수도권」을 서울·경기·인천으로 편다', () => {
    expect(regionTags('수도권 선호해요!').sort()).toEqual(['경기', '서울', '인천']);
  });

  it('「경상도」를 경북·경남·대구·울산·부산으로 편다', () => {
    expect(regionTags('경상도권 여성분 선호합니다.').sort()).toEqual(
      ['경남', '경북', '대구', '부산', '울산'].sort()
    );
  });

  it('문장에 섞인 지명을 모두 뽑는다', () => {
    expect(regionTags('서울, 경기, 인천 등 대중교통으로 편도 1시간 거리 까지 가능해요!').sort()).toEqual(
      ['경기', '서울', '인천']
    );
  });

  it('앞 글자가 한글이면 건너뛴다 — 「대전남부」에서 「전남」을 읽지 않는다', () => {
    expect(regionTags('대전남부')).toEqual(['충남', '대전']);
  });

  it('긴 이름이 먼저 걸린다 — 「경상남도」가 경상 전체로 퍼지지 않는다', () => {
    expect(regionTags('경상남도')).toEqual(['경남']);
  });

  it('지명이 없으면 빈 배열', () => {
    expect(regionTags('거리는 크게 상관 없어요!')).toEqual([]);
    expect(regionTags(null)).toEqual([]);
  });

  it('돌려주는 코드는 모두 정해진 목록 안에 있다', () => {
    for (const t of regionTags('대구, 경상도를 선호하지만 서울도 괜찮아요')) {
      expect(REGION_CODES).toContain(t);
    }
  });
});

describe('regionsOverlap', () => {
  it('대구 사람은 경상도를 원하는 사람과 맞는다', () => {
    expect(regionsOverlap(['대구'], ['경상도권 여성분 선호합니다.'])).toBe(true);
  });

  it('부산 사람은 서울만 원하는 사람과 안 맞는다', () => {
    expect(regionsOverlap(['부산 해운대'], ['서울'])).toBe(false);
  });

  it('한쪽이 비면 판단하지 않는다', () => {
    expect(regionsOverlap(['서울'], [])).toBeNull();
    expect(regionsOverlap([], ['서울'])).toBeNull();
  });

  it('어디든 좋다고 적었으면 맞는다 — 가장 유연한 사람에게 벌점을 주지 않는다', () => {
    expect(regionsOverlap(['서울'], ['장거리 가능해요!'])).toBe(true);
    expect(regionsOverlap(['서울'], ['거리 상관 없어요'])).toBe(true);
    expect(regionsOverlap(['서울'], ['전국 어디든 괜찮아요'])).toBe(true);
  });

  it('그래도 못 읽어내면 판단하지 않는다', () => {
    expect(regionsOverlap(['서울'], ['미국'])).toBeNull();
  });
});

describe('regionLabel', () => {
  it('묶음이 다 차면 묶음 이름으로 줄인다 — 다섯 개를 늘어놓지 않는다', () => {
    expect(regionLabel(['경상도권 여성분 선호합니다.'])).toBe('경상');
    expect(regionLabel(['서울, 경기, 인천 가능해요!'])).toBe('수도권');
  });

  it('묶음이 덜 차면 그대로 나열한다', () => {
    expect(regionLabel(['대구 또는 경북 선호해요!'])).toBe('경북·대구');
  });

  it('어디든 좋다는 뜻이면 그렇게 적는다 — 문장을 그대로 흘리지 않는다', () => {
    expect(regionLabel(['장거리 가능해요!'])).toBe('어디든');
  });

  it('정말 못 읽어내면 null', () => {
    expect(regionLabel(['미국'])).toBeNull();
  });
});
