import { normalizeHandle } from '@/lib/inquiry/service';
import { parseAgeBounds } from '@/lib/match/age-bounds';

export type ApplyFields = {
  applicantType: 'SELF' | 'FRIEND';
  handle: string;
  gender: 'F' | 'M';
  birthYear: number;
  heightCm: number;
  region: string;
  job: string;
  hobbies: string;
  appeal1: string;
  appeal2: string;
  appeal3: string;
  idealHeight: string;
  idealVibe: string;
  idealInner: string;
  idealAgeGap: string;
  idealRegions: string;
  dealBreakers: string;
};

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function serializeRawText(f: ApplyFields): string {
  const appeals = [f.appeal1, f.appeal2, f.appeal3].filter(Boolean);
  return `[웹 신청] ${f.applicantType === 'SELF' ? '본인' : '친구 대신 신청'}
스레드 아이디: @${normalizeHandle(f.handle)}

🤍 본인 소개
- 나이 / 성별 / 키: ${f.birthYear}년생 / ${f.gender === 'F' ? '여' : '남'} / ${f.heightCm}cm
- 지역: ${f.region}
- 직업: ${f.job}
- 취미: ${f.hobbies}
- 본인 어필
${appeals.map((a, i) => `${i + 1}. ${a}`).join('\n')}

💛 원하는 이상형
- 키: ${f.idealHeight || '-'}
- 얼굴 느낌: ${f.idealVibe || '-'}
- 내적: ${f.idealInner || '-'}
- 나이차이: ${f.idealAgeGap || '-'}
- 가능한 지역이나 거리: ${f.idealRegions || '-'}
- 이건 절대 안 돼요: ${f.dealBreakers || '-'}

성인 확인·개인정보 수집 동의 완료 (웹 신청 폼)`;
}

/**
 * 공개 신청 폼의 입력을 Profile 생성 데이터로 옮긴다.
 *
 * 「나이차이」는 폼에서 상대적으로 적히는데(「위로 2살」) 저장은 절대 출생연도라,
 * 여기서 변환하지 않으면 조건이 통째로 사라진다 — 그러면 하드필터가
 * partnerBirthYear가 비었다고 보고 그 신청자를 나이 조건 없이 통과시킨다.
 */
export function buildApplyProfileData(f: ApplyFields) {
  const idealType = [
    f.idealHeight && `키 ${f.idealHeight}`,
    f.idealVibe && `얼굴 느낌: ${f.idealVibe}`,
    f.idealInner,
    f.idealAgeGap && `나이차이: ${f.idealAgeGap}`,
  ].filter((v): v is string => Boolean(v));

  const age = parseAgeBounds(f.idealAgeGap ? [f.idealAgeGap] : [], f.birthYear);

  return {
    sourceHandle: normalizeHandle(f.handle),
    rawText: serializeRawText(f),
    gender: f.gender,
    birthYear: f.birthYear,
    heightCm: f.heightCm,
    region: f.region,
    job: f.job,
    hobbies: splitList(f.hobbies),
    appealPoints: [f.appeal1, f.appeal2, f.appeal3].filter(Boolean),
    idealType,
    partnerBirthYearMin: age.min,
    partnerBirthYearMax: age.max,
    partnerRegions: splitList(f.idealRegions),
    dealBreakers: splitList(f.dealBreakers),
  };
}
