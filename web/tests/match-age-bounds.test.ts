import { describe, it, expect } from 'vitest';
import { parseAgeBounds } from '@/lib/match/age-bounds';

/**
 * 실제 게시 프로필 69건의 partnerAgeRaw 문장에서 뽑은 패턴들이다.
 * min = 허용하는 가장 이른 출생연도(= 가장 연상), max = 가장 늦은 출생연도(= 가장 연하).
 */
describe('parseAgeBounds', () => {
  it('「위로 N살, 아래로 M살」을 양쪽 출생연도로 바꾼다', () => {
    expect(parseAgeBounds(['위로 2살, 아래로 3살 가능해요!'], 1998)).toEqual({
      min: 1996,
      max: 2001,
    });
  });

  it('「위로 N살」만 있으면 연하 쪽은 열어 둔다', () => {
    expect(parseAgeBounds(['위로 3살까지 가능해요!'], 2000)).toEqual({ min: 1997, max: null });
  });

  it('「아래로 N살」만 있으면 연상 쪽은 열어 둔다', () => {
    expect(parseAgeBounds(['아래로 2살까지 가능해요!'], 1998)).toEqual({ min: null, max: 2000 });
  });

  it('「위아래 N살」을 대칭 구간으로 바꾼다', () => {
    expect(parseAgeBounds(['위아래 4살까지 가능해요!'], 1998)).toEqual({ min: 1994, max: 2002 });
  });

  it('쉼표가 낀 「위, 아래 N살」도 대칭 구간이다', () => {
    expect(parseAgeBounds(['위, 아래 5살까지 가능해요!'], 1997)).toEqual({ min: 1992, max: 2002 });
  });

  it('두 자리 연도 범위를 네 자리로 편다', () => {
    expect(parseAgeBounds(['95년생 ~ 02년생 까지 가능해요!'], 1999)).toEqual({
      min: 1995,
      max: 2002,
    });
  });

  it('연도 범위가 거꾸로 적혀 있어도 바로잡는다', () => {
    // 07년생(2007)이 먼저, 98년생(1998)이 나중에 적힌 실제 사례
    expect(parseAgeBounds(['07년생 ~ 98년생 까지 가능해요!'], 2003)).toEqual({
      min: 1998,
      max: 2007,
    });
  });

  it('앞쪽 「년생」이 생략된 범위도 읽는다', () => {
    expect(parseAgeBounds(['92~97년생 가능해요!'], 1997)).toEqual({ min: 1992, max: 1997 });
  });

  it('「나이는 상관 없어요」는 구간을 두지 않는다', () => {
    expect(parseAgeBounds(['나이는 상관 없어요!'], 1998)).toEqual({ min: null, max: null });
  });

  it('한쪽만 「크게 상관 없어요」면 그쪽만 열어 둔다', () => {
    expect(parseAgeBounds(['위로 2살 , 아래로는 크게 상관 없어요!'], 1996)).toEqual({
      min: 1994,
      max: null,
    });
  });

  it('「동갑이나 아래로 N살」은 본인 연도를 연상 한계로 잡는다', () => {
    expect(parseAgeBounds(['동갑이나 아래로 3살까지 가능해요!'], 1998)).toEqual({
      min: 1998,
      max: 2001,
    });
  });

  it('「살고 계신」 같은 지역 문장을 나이로 오해하지 않는다', () => {
    expect(parseAgeBounds(['서울, 경기권에 살고 계신 분 선호 해요.'], 1998)).toEqual({
      min: null,
      max: null,
    });
  });

  it('나이 문장과 지역 문장이 같이 와도 나이 문장만 쓴다', () => {
    expect(
      parseAgeBounds(['위로 2살 , 아래로는 크게 상관 없어요!', '경상도권 여성분 선호합니다.'], 1996)
    ).toEqual({ min: 1994, max: null });
  });

  it('조사 「는」이 붙어도 읽는다', () => {
    // 「아래로는 5살」 — 실제 문장에 조사가 붙어 오는데 놓치고 있었다
    expect(parseAgeBounds(['나이차이 위로는 상관없고, 아래로는 5살 가능해요!'], 1997)).toEqual({
      min: null,
      max: 2002,
    });
  });

  it('한쪽에 범위로 적으면 넓은 쪽을 한계로 잡는다', () => {
    expect(parseAgeBounds(['아래로 2~5살까지 가능해요!'], 1998)).toEqual({ min: null, max: 2003 });
  });

  it('「N년생까지」 하나만 적으면 연상 한계로 읽는다', () => {
    expect(parseAgeBounds(['95년생까지 가능해요!'], 2002)).toEqual({ min: 1995, max: null });
  });

  it('빈 입력은 구간 없음이다', () => {
    expect(parseAgeBounds(null, 1998)).toEqual({ min: null, max: null });
    expect(parseAgeBounds([], 1998)).toEqual({ min: null, max: null });
  });
});
