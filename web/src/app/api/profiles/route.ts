import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { findDuplicates } from '@/lib/profile/service';

const createBody = z.object({
  sourceHandle: z.string().min(1),
  rawText: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = createBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: '핸들과 원문이 필요합니다.' }, { status: 400 });
  }

  const handle = parsed.data.sourceHandle.trim().replace(/^@/, '');
  const duplicates = await findDuplicates(handle);

  const profile = await prisma.profile.create({
    data: { sourceHandle: handle, rawText: parsed.data.rawText },
    select: { id: true, status: true },
  });

  return NextResponse.json({ profile, duplicates }, { status: 201 });
}

// 쿼리 파라미터를 Prisma enum으로 그냥 캐스팅하면 임의 입력이 쿼리에 들어간다.
const statusFilter = z.enum(['COLLECTED', 'DRAFTED', 'APPROVED', 'PUBLISHED', 'ARCHIVED']);

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('status');
  const parsed = statusFilter.safeParse(raw);
  if (raw !== null && !parsed.success) {
    return NextResponse.json({ error: '알 수 없는 상태 값입니다.' }, { status: 400 });
  }

  const profiles = await prisma.profile.findMany({
    where: parsed.success ? { status: parsed.data } : { status: { not: 'ARCHIVED' } },
    select: {
      id: true,
      seq: true,
      status: true,
      sourceHandle: true,
      region: true,
      birthYear: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ profiles });
}
