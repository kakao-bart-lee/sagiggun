/**
 * @some_us.love 게시 프로필 JSON을 DB로 들인다.
 *
 *   pnpm tsx scripts/import-published.ts            미리보기 (기본)
 *   pnpm tsx scripts/import-published.ts --apply    게시번호(seq) 기준으로 넣고 갱신한다
 *
 * **아무것도 지우지 않는다.** 운영에는 신청서로 들어온 사람이 이미 있다.
 * 우리가 넣지 않은 번호는 건드리지 않고 충돌로 보고하며, 들여올 목록에 없는
 * 기존 행은 그대로 둔다. 두 번 돌려도 결과가 같다(§planImport).
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { parseAgeBounds } from '@/lib/match/age-bounds';
import { parseFaceTypes, parseHeightBounds } from '@/lib/match/ideal';
import { planImport, syntheticHandle } from '@/lib/profile/import-plan';

const SOURCE = new URL('../../some_us_love_profiles.json', import.meta.url).pathname;

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const apply = process.argv.includes('--apply');

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
    sourceHandle: syntheticHandle(p.index),
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

  const existing = await prisma.profile.findMany({ select: { seq: true, sourceHandle: true } });
  const plan = planImport(rows, existing);

  console.log(`\n기존 ${existing.length}건 → 새로 ${plan.create.length} · 갱신 ${plan.update.length} · 충돌 ${plan.conflict.length}`);
  for (const c of plan.conflict) {
    console.log(`  ! ${c.seq}번은 ${c.sourceHandle}이(가) 쓰고 있다 — 건드리지 않는다`);
  }

  if (!apply) {
    console.log('\n[미리보기] --apply 를 붙이면 위 계획대로 실행한다. 삭제는 없다.');
    return;
  }

  if (plan.create.length) await prisma.profile.createMany({ data: plan.create });
  for (const r of plan.update) {
    await prisma.profile.update({ where: { seq: r.seq }, data: r });
  }
  console.log(`\n완료. 전체 Profile ${await prisma.profile.count()}건`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
