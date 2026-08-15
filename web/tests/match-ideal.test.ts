import { describe, it, expect } from 'vitest';
import { parseHeightBounds, parseFaceTypes } from '@/lib/match/ideal';

/** 실제 게시 프로필 69건의 idealType 문장에서 뽑은 형태들. */
describe('parseHeightBounds', () => {
  it('「165cm 이하」는 상한만 잡는다', () => {
    expect(parseHeightBounds(['키 165cm 이하 고양이상'])).toEqual({ min: null, max: 165 });
  });

  it('「175cm 이상」은 하한만 잡는다', () => {
    expect(parseHeightBounds(['키 175cm 이상의 강아지, 두부상'])).toEqual({ min: 175, max: null });
  });

  it('구간으로 적으면 양쪽을 잡는다', () => {
    expect(parseHeightBounds(['키 155cm~165cm 의 귀엽게 생기신 분'])).toEqual({
      min: 155,
      max: 165,
    });
  });

  it('cm를 안 붙여도 읽는다 — 신청 폼이 「175 이상」으로 받는다', () => {
    expect(parseHeightBounds(['키 175 이상'])).toEqual({ min: 175, max: null });
  });

  it('여러 줄이면 키가 적힌 줄만 쓴다', () => {
    expect(parseHeightBounds(['180cm 이상', '다정하신 분', '경상도 가능해요'])).toEqual({
      min: 180,
      max: null,
    });
  });

  it('키 얘기가 없으면 비워 둔다', () => {
    expect(parseHeightBounds(['다정하신 분', '유머 있는 분'])).toEqual({ min: null, max: null });
    expect(parseHeightBounds([])).toEqual({ min: null, max: null });
  });

  it('나이를 키로 오해하지 않는다', () => {
    expect(parseHeightBounds(['1994년생 이상'])).toEqual({ min: null, max: null });
  });
});

describe('parseFaceTypes', () => {
  it('「고양이상」을 뽑는다', () => {
    expect(parseFaceTypes(['키 165cm 이하 고양이상'])).toEqual(['고양이상']);
  });

  it('쉼표로 이어 적으면 앞쪽에 「상」이 없어도 뽑는다', () => {
    expect(parseFaceTypes(['키 175cm 이상의 강아지, 두부상(김재원, 정해인)'])).toEqual([
      '강아지상',
      '두부상',
    ]);
  });

  it('여러 줄에 흩어져 있어도 모은다', () => {
    expect(parseFaceTypes(['180cm 이상', '공룡상', '다정하신 분'])).toEqual(['공룡상']);
  });

  it('중복은 한 번만 담는다', () => {
    expect(parseFaceTypes(['두부상', '하얀 두부상, 강아지상'])).toEqual(['두부상', '강아지상']);
  });

  it('「말투」를 「말상」으로 오해하지 않는다', () => {
    expect(parseFaceTypes(['말투가 다정하신 분'])).toEqual([]);
  });

  it('얼굴상 얘기가 없으면 빈 배열', () => {
    expect(parseFaceTypes(['귀엽게 생기신 분'])).toEqual([]);
  });
});
