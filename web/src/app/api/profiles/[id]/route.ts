import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { deleteProfile } from '@/lib/profile/service';
import { statusAfterEdit, statusAfterUnarchive } from '@/lib/profile/state';

const patchBody = z.object({
  gender: z.enum(['F', 'M']).nullable().optional(),
  birthYear: z.number().int().nullable().optional(),
  region: z.string().nullable().optional(),
  heightCm: z.number().int().nullable().optional(),
  job: z.string().nullable().optional(),
  hobbies: z.array(z.string()).optional(),
  appealPoints: z.array(z.string()).optional(),
  idealType: z.array(z.string()).optional(),
  partnerBirthYearMin: z.number().int().nullable().optional(),
  partnerBirthYearMax: z.number().int().nullable().optional(),
  partnerRegions: z.array(z.string()).optional(),
  dealBreakers: z.array(z.string()).optional(),
  finalBody: z.string().nullable().optional(),
  /** ARCHIVED = 보관. UNARCHIVE = 보관 해제(초안 유무로 DRAFTED/COLLECTED). */
  status: z.enum(['ARCHIVED', 'UNARCHIVE']).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const profile = await prisma.profile.findUnique({
    where: { id },
    include: { photos: { orderBy: { order: 'asc' } } },
  });
  if (!profile) return NextResponse.json({ error: '없는 프로필입니다.' }, { status: 404 });
  return NextResponse.json({ profile });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const parsed = patchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const current = await prisma.profile.findUnique({
    where: { id },
    select: { status: true, draftBody: true },
  });
  if (!current) return NextResponse.json({ error: '없는 프로필입니다.' }, { status: 404 });

  const { status, ...fields } = parsed.data;
  let nextStatus = statusAfterEdit(current.status);
  if (status === 'ARCHIVED') {
    nextStatus = 'ARCHIVED';
  } else if (status === 'UNARCHIVE') {
    if (current.status !== 'ARCHIVED') {
      return NextResponse.json({ error: '보관된 프로필만 보관 해제할 수 있습니다.' }, { status: 400 });
    }
    nextStatus = statusAfterUnarchive({ draftBody: current.draftBody });
  } else if (current.status === 'ARCHIVED') {
    nextStatus = 'ARCHIVED';
  }

  const profile = await prisma.profile.update({
    where: { id },
    data: { ...fields, status: nextStatus },
  });
  return NextResponse.json({ profile });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;

  const existing = await prisma.profile.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: '없는 프로필입니다.' }, { status: 404 });

  await deleteProfile(id);
  return NextResponse.json({ ok: true });
}
