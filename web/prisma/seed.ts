/**
 * 데모·e2e용 프로필 시드.
 * 실행: `pnpm db:seed` (LLM 호출 없음)
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type SeedProfile = {
  sourceHandle: string;
  status: 'COLLECTED' | 'DRAFTED' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
  gender: 'F' | 'M';
  birthYear: number;
  region: string;
  heightCm: number;
  job: string;
  hobbies: string[];
  appealPoints: string[];
  idealType: string[];
  partnerBirthYearMin: number;
  partnerBirthYearMax: number;
  partnerRegions: string[];
  dealBreakers: string[];
  seq?: number;
};

const SEEDS: SeedProfile[] = [
  {
    sourceHandle: 'mina_seoul',
    status: 'PUBLISHED',
    gender: 'F',
    birthYear: 1998,
    region: '서울 강남',
    heightCm: 165,
    job: '디자이너',
    hobbies: ['카페', '전시'],
    appealPoints: ['밝음', '성실', '유머'],
    idealType: ['진솔한 사람', '유머'],
    partnerBirthYearMin: 1993,
    partnerBirthYearMax: 2002,
    partnerRegions: ['서울', '경기'],
    dealBreakers: ['흡연'],
    seq: 1,
  },
  {
    sourceHandle: 'jun_mapo',
    status: 'PUBLISHED',
    gender: 'M',
    birthYear: 1995,
    region: '서울 마포',
    heightCm: 178,
    job: '개발자',
    hobbies: ['등산', '영화'],
    appealPoints: ['차분함', '배려'],
    idealType: ['솔직한 사람'],
    partnerBirthYearMin: 1994,
    partnerBirthYearMax: 2003,
    partnerRegions: ['서울'],
    dealBreakers: ['불성실'],
    seq: 2,
  },
  {
    sourceHandle: 'hana_bundang',
    status: 'APPROVED',
    gender: 'F',
    birthYear: 1997,
    region: '경기 성남',
    heightCm: 162,
    job: '마케터',
    hobbies: ['요가', '카페'],
    appealPoints: ['긍정적'],
    idealType: ['유머', '성실'],
    partnerBirthYearMin: 1992,
    partnerBirthYearMax: 2001,
    partnerRegions: ['서울', '경기'],
    dealBreakers: ['흡연'],
  },
  {
    sourceHandle: 'teo_busan',
    status: 'PUBLISHED',
    gender: 'M',
    birthYear: 1994,
    region: '부산 해운대',
    heightCm: 180,
    job: '금융',
    hobbies: ['서핑', '독서'],
    appealPoints: ['책임감'],
    idealType: ['밝은 사람'],
    partnerBirthYearMin: 1993,
    partnerBirthYearMax: 2002,
    partnerRegions: ['부산', '경남'],
    dealBreakers: [],
    seq: 3,
  },
  {
    sourceHandle: 'soyeon_yd',
    status: 'PUBLISHED',
    gender: 'F',
    birthYear: 1999,
    region: '서울 영등포',
    heightCm: 168,
    job: '교사',
    hobbies: ['독서', '산책'],
    appealPoints: ['다정함'],
    idealType: ['성숙한 사람'],
    partnerBirthYearMin: 1994,
    partnerBirthYearMax: 2003,
    partnerRegions: ['서울'],
    dealBreakers: ['흡연'],
    seq: 4,
  },
  {
    sourceHandle: 'kyle_Songpa',
    status: 'APPROVED',
    gender: 'M',
    birthYear: 1996,
    region: '서울 송파',
    heightCm: 175,
    job: '회사원',
    hobbies: ['헬스', '요리'],
    appealPoints: ['성실'],
    idealType: ['유머'],
    partnerBirthYearMin: 1995,
    partnerBirthYearMax: 2004,
    partnerRegions: ['서울', '경기'],
    dealBreakers: [],
  },
  {
    sourceHandle: 'archived_old',
    status: 'ARCHIVED',
    gender: 'F',
    birthYear: 1990,
    region: '대구',
    heightCm: 160,
    job: '자영업',
    hobbies: ['카페'],
    appealPoints: ['친절'],
    idealType: ['성실'],
    partnerBirthYearMin: 1985,
    partnerBirthYearMax: 1995,
    partnerRegions: ['대구'],
    dealBreakers: [],
  },
  {
    sourceHandle: 'draft_only',
    status: 'DRAFTED',
    gender: 'M',
    birthYear: 2000,
    region: '인천',
    heightCm: 172,
    job: '프리랜서',
    hobbies: ['게임'],
    appealPoints: ['유머'],
    idealType: ['활발'],
    partnerBirthYearMin: 1998,
    partnerBirthYearMax: 2005,
    partnerRegions: ['인천', '서울'],
    dealBreakers: [],
  },
];

function rawTextFor(p: SeedProfile): string {
  return [
    `안녕하세요 저는 ${p.gender === 'F' ? '여성' : '남성'} ${String(p.birthYear).slice(2)}년생입니다.`,
    `${p.region} 살고 ${p.heightCm}cm / ${p.job} 합니다.`,
    `취미는 ${p.hobbies.join(', ')}.`,
    `장점: ${p.appealPoints.join(', ')}.`,
    `이상형: ${p.idealType.join(', ')}.`,
    `희망 나이 ${p.partnerBirthYearMin}~${p.partnerBirthYearMax}, 지역 ${p.partnerRegions.join('/')}.`,
    p.dealBreakers.length ? `절대 안 됨: ${p.dealBreakers.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function finalBodyFor(p: SeedProfile): string {
  return `✨ ${p.region}에 거주중인 ${p.birthYear}년생 ${p.gender === 'F' ? '여성' : '남성'}분 입니다.
${p.job}에서 근무중이신 ${p.heightCm}cm 단정한 인상 🙂
취미: ${p.hobbies.join(' / ')}
사진처럼 맑고 밝은 인상입니다.
정돈된 분위기예요.
본인의 장점은 💖
1. ${p.appealPoints[0] ?? '성실'}
2. ${p.appealPoints[1] ?? '배려'}
3. ${p.appealPoints[2] ?? '유머'}
이상형은 📌
1. ${p.idealType[0] ?? '성실'}
2. ${p.idealType[1] ?? '유머'}
3. ${p.idealType[2] ?? '배려'}
✔️ ${String(p.partnerBirthYearMin).slice(2)}년생~${String(p.partnerBirthYearMax).slice(2)}년생 가능해요!
✔️ ${p.partnerRegions.join(', ')} 가능해요!
❌이건 절대 안 돼요.
${p.dealBreakers.join('\n') || '없음'}
📨 관심 있으신 분은 메세지 주세요!`;
}

async function main() {
  // 시드 핸들만 지우고 다시 넣는다 (운영 DB에서 실수 방지용 좁은 범위).
  const handles = SEEDS.map((s) => s.sourceHandle);
  await prisma.profile.deleteMany({ where: { sourceHandle: { in: handles } } });

  for (const p of SEEDS) {
    const rawText = rawTextFor(p);
    const body =
      p.status === 'COLLECTED' ? null : ['DRAFTED', 'APPROVED', 'PUBLISHED', 'ARCHIVED'].includes(p.status)
        ? finalBodyFor(p)
        : null;
    await prisma.profile.create({
      data: {
        sourceHandle: p.sourceHandle,
        rawText,
        status: p.status,
        gender: p.gender,
        birthYear: p.birthYear,
        region: p.region,
        heightCm: p.heightCm,
        job: p.job,
        hobbies: p.hobbies,
        appealPoints: p.appealPoints,
        idealType: p.idealType,
        partnerBirthYearMin: p.partnerBirthYearMin,
        partnerBirthYearMax: p.partnerBirthYearMax,
        partnerRegions: p.partnerRegions,
        dealBreakers: p.dealBreakers,
        draftBody: body,
        finalBody: body,
        seq: p.seq ?? null,
        publishedAt: p.status === 'PUBLISHED' ? new Date() : null,
      },
    });
  }

  console.log(`seeded ${SEEDS.length} profiles`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
