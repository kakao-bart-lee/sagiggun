import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { composeBody, type PhotoInput } from '@/lib/llm/compose';
import { readPhoto } from '@/lib/storage';
import { ExtractedSchema } from '@/lib/llm/extract';

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const profile = await prisma.profile.findUnique({
    where: { id },
    include: { photos: { orderBy: { order: 'asc' } } },
  });
  if (!profile) return NextResponse.json({ error: '없는 프로필입니다.' }, { status: 404 });

  const fields = ExtractedSchema.safeParse({
    gender: profile.gender,
    birthYear: profile.birthYear,
    region: profile.region,
    heightCm: profile.heightCm,
    job: profile.job,
    hobbies: profile.hobbies,
    appealPoints: profile.appealPoints,
    idealType: profile.idealType,
    partnerBirthYearMin: profile.partnerBirthYearMin,
    partnerBirthYearMax: profile.partnerBirthYearMax,
    partnerRegions: profile.partnerRegions,
    dealBreakers: profile.dealBreakers,
  });
  if (!fields.success) {
    return NextResponse.json(
      { error: '먼저 추출을 실행하거나 항목을 채워 주세요.' },
      { status: 400 }
    );
  }

  const photoInputs: PhotoInput[] = [];
  for (const photo of profile.photos) {
    try {
      const bytes = await readPhoto(photo.storageKey);
      photoInputs.push({
        contentType: photo.contentType,
        base64: Buffer.from(bytes).toString('base64'),
      });
    } catch (error) {
      console.warn('[compose] 사진 읽기 실패', photo.storageKey, error);
    }
  }

  try {
    const draftBody = await composeBody(fields.data, photoInputs);
    const updated = await prisma.profile.update({
      where: { id },
      data: {
        draftBody,
        // 최종본이 아직 없으면 초안을 그대로 채워 편집을 시작할 수 있게 한다.
        finalBody: profile.finalBody ?? draftBody,
        status: 'DRAFTED',
      },
    });
    return NextResponse.json({ profile: updated });
  } catch (error) {
    // 기존 초안을 보존한다.
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
