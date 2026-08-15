/**
 * 기존 프로필의 idealType 텍스트에서 키 구간과 얼굴상을 뽑아 새 컬럼에 채운다.
 * 실행: `pnpm backfill:ideal` (--dry 로 미리보기)
 *
 * 멱등하다 — 이미 값이 있는 행은 건드리지 않는다. 읽어내지 못한 문장은 비워 둔다.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { parseFaceTypes, parseHeightBounds } from '../src/lib/match/ideal';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const dry = process.argv.includes('--dry');

async function main() {
  const rows = await prisma.profile.findMany({
    select: {
      id: true,
      seq: true,
      idealType: true,
      partnerHeightMin: true,
      partnerHeightMax: true,
      partnerFaceTypes: true,
    },
  });

  let height = 0;
  let faces = 0;

  for (const r of rows) {
    const hasHeight = r.partnerHeightMin != null || r.partnerHeightMax != null;
    const hasFaces = (r.partnerFaceTypes ?? []).length > 0;
    if (hasHeight && hasFaces) continue;

    const h = hasHeight ? null : parseHeightBounds(r.idealType ?? []);
    const f = hasFaces ? null : parseFaceTypes(r.idealType ?? []);

    const data: Record<string, unknown> = {};
    if (h && (h.min != null || h.max != null)) {
      data.partnerHeightMin = h.min;
      data.partnerHeightMax = h.max;
      height += 1;
    }
    if (f && f.length) {
      data.partnerFaceTypes = f;
      faces += 1;
    }
    if (Object.keys(data).length === 0) continue;

    console.log(
      `  ${r.seq != null ? `${r.seq}번` : r.id.slice(0, 8)}  ${JSON.stringify(data)}  ← ${(r.idealType ?? []).join(' | ').slice(0, 60)}`
    );
    if (!dry) await prisma.profile.update({ where: { id: r.id }, data });
  }

  console.log(
    `\n${dry ? '[미리보기] ' : ''}프로필 ${rows.length}건 중 — 키 ${height}건, 얼굴상 ${faces}건 채움`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
