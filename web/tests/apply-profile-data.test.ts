import { describe, it, expect } from 'vitest';
import { buildApplyProfileData, type ApplyFields } from '@/lib/profile/apply';

function fields(partial: Partial<ApplyFields> = {}): ApplyFields {
  return {
    applicantType: 'SELF',
    handle: 'someone',
    gender: 'F',
    birthYear: 1998,
    heightCm: 163,
    region: '수원',
    job: '직장인',
    hobbies: '운동, 사진',
    appeal1: '다정하다',
    appeal2: '',
    appeal3: '',
    idealHeight: '',
    idealVibe: '',
    idealInner: '',
    idealAgeGap: '',
    idealRegions: '',
    dealBreakers: '',
    ...partial,
  };
}

describe('buildApplyProfileData', () => {
  it('「위로 2살, 아래로 3살」을 출생연도 구간으로 저장한다', () => {
    const data = buildApplyProfileData(fields({ birthYear: 1998, idealAgeGap: '위로 2살, 아래로 3살 가능' }));
    expect(data.partnerBirthYearMin).toBe(1996);
    expect(data.partnerBirthYearMax).toBe(2001);
  });

  it('나이차이를 안 적으면 구간을 비워 둔다', () => {
    const data = buildApplyProfileData(fields({ idealAgeGap: '' }));
    expect(data.partnerBirthYearMin).toBeNull();
    expect(data.partnerBirthYearMax).toBeNull();
  });

  it('읽어내지 못한 나이 표현은 비워 둔다 — 추측하지 않는다', () => {
    const data = buildApplyProfileData(fields({ idealAgeGap: '비슷한 또래면 좋아요' }));
    expect(data.partnerBirthYearMin).toBeNull();
    expect(data.partnerBirthYearMax).toBeNull();
  });

  it('이상형 키를 숫자 구간으로 저장한다', () => {
    const data = buildApplyProfileData(fields({ idealHeight: '175 이상' }));
    expect(data.partnerHeightMin).toBe(175);
    expect(data.partnerHeightMax).toBeNull();
  });

  it('이상형 얼굴상을 닫힌 어휘로 저장한다', () => {
    const data = buildApplyProfileData(fields({ idealVibe: '강아지상, 두부상' }));
    expect(data.partnerFaceTypes).toEqual(['강아지상', '두부상']);
  });

  it('읽어내지 못한 이상형은 비워 둔다', () => {
    const data = buildApplyProfileData(fields({ idealHeight: '보통', idealVibe: '귀여운 느낌' }));
    expect(data.partnerHeightMin).toBeNull();
    expect(data.partnerHeightMax).toBeNull();
    expect(data.partnerFaceTypes).toEqual([]);
  });

  // ── 아래는 라우트에서 옮겨온 기존 동작이 그대로인지 지키는 회귀 테스트 ──

  it('이상형 항목들을 접두어와 함께 한 배열로 모은다', () => {
    const data = buildApplyProfileData(
      fields({
        idealHeight: '175 이상',
        idealVibe: '강아지상',
        idealInner: '다정한 분',
        idealAgeGap: '위로 2살',
      })
    );
    expect(data.idealType).toEqual([
      '키 175 이상',
      '얼굴 느낌: 강아지상',
      '다정한 분',
      '나이차이: 위로 2살',
    ]);
  });

  it('콤마로 적은 값을 배열로 나눈다', () => {
    const data = buildApplyProfileData(
      fields({ hobbies: '운동, 야구 관람', idealRegions: '서울, 경기', dealBreakers: '흡연, 문신' })
    );
    expect(data.hobbies).toEqual(['운동', '야구 관람']);
    expect(data.partnerRegions).toEqual(['서울', '경기']);
    expect(data.dealBreakers).toEqual(['흡연', '문신']);
  });

  it('비어 있는 어필은 버린다', () => {
    const data = buildApplyProfileData(fields({ appeal1: '다정하다', appeal2: '', appeal3: '성실' }));
    expect(data.appealPoints).toEqual(['다정하다', '성실']);
  });

  it('원문을 보존한다', () => {
    const data = buildApplyProfileData(fields({ idealAgeGap: '위로 2살, 아래로 3살 가능' }));
    expect(data.rawText).toContain('[웹 신청]');
    expect(data.rawText).toContain('위로 2살, 아래로 3살 가능');
  });
});
