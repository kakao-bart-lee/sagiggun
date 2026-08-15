/**
 * @some_us.love 게시 프로필 JSON을 DB로 들인다. 개발·검증용이다.
 *
 *   pnpm tsx scripts/import-published.ts            미리보기 (기본)
 *   pnpm tsx scripts/import-published.ts --fresh    기존 Profile 전부 지우고 넣는다
 *
 * seq가 unique라 게시번호를 그대로 쓰려면 기존 행과 충돌한다. 그래서 --fresh는
 * Profile을 전부 지운다 — Photo·MatchRun·MatchSuggestion·Inquiry·DeliveryItem이
 * cascade로 함께 사라진다. 실행 전 백업을 뜬다.
 *
 * 원본에 핸들이 없다. sourceHandle은 명백히 합성인 값을 넣는다 — 실제 계정으로
 * 오인하면 안 된다.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { parseAgeBounds } from '@/lib/match/age-bounds';
import { parseFaceTypes, parseHeightBounds } from '@/lib/match/ideal';

const SOURCE = new URL('../../some_us_love_profiles.json', import.meta.url).pathname;

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const fresh = process.argv.includes('--fresh');

type Raw = {
  index: number;
  gender: 'male' | 'female';
  birthYear: number;
  region: string | null;
  heightCm: number | null;
  job: string | null;
  faceType: string | null;
  hobbies: string[] | null;
  appealPoints: string[] | null;
  idealType: string[] | null;
  partnerBirthYearMin: number | null;
  partnerBirthYearMax: number | null;
  partnerAgeRaw: string[] | null;
  partnerRegions: string[] | null;
  dealBreakers: string[] | null;
  rawText: string;
};

function toRow(p: Raw) {
  const idealType = p.idealType ?? [];
  const age =
    p.partnerBirthYearMin != null || p.partnerBirthYearMax != null
      ? { min: p.partnerBirthYearMin, max: p.partnerBirthYearMax }
      : parseAgeBounds(p.partnerAgeRaw ?? [], p.birthYear);
  const height = parseHeightBounds(idealType);

  return {
    seq: p.index,
    status: 'PUBLISHED' as const,
    // 원본에 핸들이 없다. 실제 계정으로 오인되지 않을 합성 값을 쓴다.
    sourceHandle: `someuslove-${p.index}`,
    rawText: p.rawText,
    gender: p.gender === 'female' ? 'F' : 'M',
    birthYear: p.birthYear,
    region: p.region,
    heightCm: p.heightCm,
    job: p.job,
    hobbies: p.hobbies ?? [],
    appealPoints: p.appealPoints ?? [],
    idealType,
    partnerBirthYearMin: age.min,
    partnerBirthYearMax: age.max,
    partnerRegions: p.partnerRegions ?? [],
    dealBreakers: p.dealBreakers ?? [],
    faceType: parseFaceTypes([p.faceType ?? ''])[0] ?? null,
    partnerFaceTypes: parseFaceTypes(idealType),
    partnerHeightMin: height.min,
    partnerHeightMax: height.max,
  };
}

async function main() {
  const profiles: Raw[] = JSON.parse(readFileSync(SOURCE, 'utf8')).profiles;
  const rows = profiles.map(toRow);

  const count = (pred: (r: (typeof rows)[number]) => boolean) => rows.filter(pred).length;

  console.log(`원본 ${rows.length}건`);
  console.log(
    `  나이 구간 ${count((r) => r.partnerBirthYearMin != null || r.partnerBirthYearMax != null)}`
  );
  console.log(
    `  키 구간   ${count((r) => r.partnerHeightMin != null || r.partnerHeightMax != null)}`
  );
  console.log(
    `  본인 얼굴상 ${count((r) => r.faceType != null)} · 원하는 얼굴상 ${count((r) => r.partnerFaceTypes.length > 0)}`
  );
  console.log(`  성별 여 ${rows.filter((r) => r.gender === 'F').length} / 남 ${rows.filter((r) => r.gender === 'M').length}`);

  if (!fresh) {
    console.log('\n[미리보기] --fresh 를 붙이면 기존 Profile을 전부 지우고 넣는다.');
    return;
  }

  const before = await prisma.profile.count();
  console.log(`\n기존 Profile ${before}건을 지운다 (Photo·MatchRun·Inquiry 등 cascade)`);
  await prisma.profile.deleteMany({});
  await prisma.profile.createMany({ data: rows });
  console.log(`들임 완료: ${await prisma.profile.count()}건`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
