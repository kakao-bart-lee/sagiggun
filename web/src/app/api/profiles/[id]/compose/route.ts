import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { composeBody, type PhotoInput } from '@/lib/llm/compose';
import { readPhoto } from '@/lib/storage';
import { ExtractedSchema, type Extracted } from '@/lib/llm/extract';

type Params = { params: Promise<{ id: string }> };

// ExtractedSchema의 모든 필드는 nullable이거나 빈 배열을 허용하므로, 한 번도 추출을
// 돌리지 않은 프로필(모든 필드가 null/[])도 safeParse를 그대로 통과한다 — 그 상태로는
// 실제 LLM 호출까지 가버려서 전 항목 "미상"인 결과에 비용을 쓰게 된다(Fix round 1 —
// Important 1). 완벽한 판정은 노리지 않는다 — "명백히 아무것도 추출되지 않은 상태"만
// 걸러낸다. 필드 하나라도 값이 있으면(부분 추출·수동 편집 포함) 통과시킨다.
function isEmptyExtraction(fields: Extracted): boolean {
  return (
    fields.gender === null &&
    fields.birthYear === null &&
    fields.region === null &&
    fields.heightCm === null &&
    fields.job === null &&
    fields.hobbies.length === 0 &&
    fields.appealPoints.length === 0 &&
    fields.idealType.length === 0 &&
    fields.partnerBirthYearMin === null &&
    fields.partnerBirthYearMax === null &&
    fields.partnerRegions.length === 0 &&
    fields.dealBreakers.length === 0
  );
}

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const profile = await prisma.profile.findUnique({
    where: { id },
    include: { photos: { orderBy: { order: 'asc' } } },
  });
  if (!profile) return NextResponse.json({ error: '없는 프로필입니다.' }, { status: 404 });

  // canApprove(state.ts:10)는 ARCHIVED를 명시적으로 거부하는데 여기서 걸러내지 않으면
  // 작문 한 번으로 보관된 프로필이 조용히 DRAFTED로 부활한다 — 모듈 간 계약 불일치다.
  // PATCH로 이미 ARCHIVED를 설정할 수 있으므로 지금 도달 가능한 경로다.
  if (profile.status === 'ARCHIVED') {
    return NextResponse.json({ error: '보관된 프로필은 작문할 수 없습니다.' }, { status: 400 });
  }

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
  if (!fields.success || isEmptyExtraction(fields.data)) {
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
    // 기존 초안을 보존한다(에러 시 DB를 건드리지 않는다).
    // SDK 원문 에러에는 모델명·요청 파라미터가 섞여 나올 수 있어 서버 로그에만 남긴다.
    console.error('[compose] 작문 실패', id, error);
    return NextResponse.json(
      { error: '작문에 실패했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 502 }
    );
  }
}
