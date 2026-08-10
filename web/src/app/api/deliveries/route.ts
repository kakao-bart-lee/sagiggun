import { NextResponse } from 'next/server';
import type { DeliveryStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const STATUSES = new Set<DeliveryStatus>(['PENDING', 'INSERTED', 'DONE', 'CANCELLED']);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const statusRaw = searchParams.get('status');
  const handle = searchParams.get('handle')?.replace(/^@/, '').trim();

  const where: {
    status?: DeliveryStatus;
    toHandle?: string;
  } = {};

  if (statusRaw) {
    if (!STATUSES.has(statusRaw as DeliveryStatus)) {
      return NextResponse.json({ error: '잘못된 status입니다.' }, { status: 400 });
    }
    where.status = statusRaw as DeliveryStatus;
  }
  if (handle) where.toHandle = handle;

  const items = await prisma.deliveryItem.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      toProfile: { select: { id: true, sourceHandle: true, status: true } },
      suggestion: {
        select: {
          id: true,
          rank: true,
          rationale: true,
          run: { select: { subjectId: true } },
        },
      },
    },
  });

  return NextResponse.json({ items });
}
