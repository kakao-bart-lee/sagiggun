import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canApprove } from '@/lib/profile/state';

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const profile = await prisma.profile.findUnique({
    where: { id },
    select: { finalBody: true, status: true },
  });
  if (!profile) return NextResponse.json({ error: '없는 프로필입니다.' }, { status: 404 });

  const check = canApprove(profile);
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

  const updated = await prisma.profile.update({
    where: { id },
    data: { status: 'APPROVED' },
  });
  return NextResponse.json({ profile: updated });
}
