import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createInquiry } from '@/lib/inquiry/service';

const createBody = z.object({
  targetId: z.string().min(1).optional(),
  targetSeq: z.number().int().positive().optional(),
  fromHandle: z.string().min(1),
  fromProfileId: z.string().min(1).optional(),
  note: z.string().max(4000).optional(),
  source: z.enum(['THREADS', 'WEB']).optional(),
});

export async function POST(request: Request) {
  const parsed = createBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const result = await createInquiry(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(
    { inquiry: result.inquiry, reused: result.reused },
    { status: result.reused ? 200 : 201 }
  );
}

const statusFilter = z.enum([
  'RECEIVED',
  'SPEC_REQUESTED',
  'SPEC_RECEIVED',
  'FORWARDED',
  'ACCEPTED',
  'DECLINED',
  'CLOSED',
]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const statusRaw = searchParams.get('status');
  const handle = searchParams.get('handle')?.replace(/^@/, '').trim();
  const openOnly = searchParams.get('open') === '1';

  const parsedStatus = statusFilter.safeParse(statusRaw);
  if (statusRaw !== null && !parsedStatus.success) {
    return NextResponse.json({ error: '알 수 없는 상태 값입니다.' }, { status: 400 });
  }

  const inquiries = await prisma.inquiry.findMany({
    where: {
      ...(parsedStatus.success ? { status: parsedStatus.data } : {}),
      ...(openOnly ? { status: { notIn: ['ACCEPTED', 'DECLINED', 'CLOSED'] } } : {}),
      ...(handle ? { fromHandle: { equals: handle, mode: 'insensitive' } } : {}),
    },
    include: {
      target: { select: { id: true, seq: true, sourceHandle: true } },
      fromProfile: { select: { id: true, sourceHandle: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({ inquiries });
}
