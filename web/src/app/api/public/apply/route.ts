import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { assertUploadable, putPhoto } from '@/lib/storage';
import { checkPublicSubmitLimit, getClientIp } from '@/lib/rate-limit';
import { normalizeHandle } from '@/lib/inquiry/service';

// 공개 신청 폼(/apply) — DM 양식의 구조화 버전.
// 구조화 필드는 Profile에 바로 넣고(LLM 추출 불필요), rawText에는 양식 텍스트를
// 직렬화해 원본 보존 원칙을 지킨다. 상태는 COLLECTED로 시작해 기존 검수 흐름에 합류한다.
const fields = z.object({
  applicantType: z.enum(['SELF', 'FRIEND']),
  handle: z.string().min(1).max(60),
  gender: z.enum(['F', 'M']),
  birthYear: z.coerce.number().int().min(1900).max(2100),
  heightCm: z.coerce.number().int().min(120).max(230),
  region: z.string().min(1).max(100),
  job: z.string().min(1).max(100),
  hobbies: z.string().min(1).max(500),
  appeal1: z.string().min(1).max(300),
  appeal2: z.string().max(300).optional().default(''),
  appeal3: z.string().max(300).optional().default(''),
  idealHeight: z.string().max(200).optional().default(''),
  idealVibe: z.string().max(200).optional().default(''),
  idealInner: z.string().max(300).optional().default(''),
  idealAgeGap: z.string().max(200).optional().default(''),
  idealRegions: z.string().max(200).optional().default(''),
  dealBreakers: z.string().max(300).optional().default(''),
  adultConfirmed: z.literal('on'),
  privacyConsented: z.literal('on'),
});

const CURRENT_YEAR = new Date().getFullYear();
const MIN_PHOTOS = 2;

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function serializeRawText(f: z.infer<typeof fields>): string {
  const appeals = [f.appeal1, f.appeal2, f.appeal3].filter(Boolean);
  return `[웹 신청] ${f.applicantType === 'SELF' ? '본인' : '친구 대신 신청'}
스레드 아이디: @${normalizeHandle(f.handle)}

🤍 본인 소개
- 나이 / 성별 / 키: ${f.birthYear}년생 / ${f.gender === 'F' ? '여' : '남'} / ${f.heightCm}cm
- 지역: ${f.region}
- 직업: ${f.job}
- 취미: ${f.hobbies}
- 본인 어필
${appeals.map((a, i) => `${i + 1}. ${a}`).join('\n')}

💛 원하는 이상형
- 키: ${f.idealHeight || '-'}
- 얼굴 느낌: ${f.idealVibe || '-'}
- 내적: ${f.idealInner || '-'}
- 나이차이: ${f.idealAgeGap || '-'}
- 가능한 지역이나 거리: ${f.idealRegions || '-'}
- 이건 절대 안 돼요: ${f.dealBreakers || '-'}

성인 확인·개인정보 수집 동의 완료 (웹 신청 폼)`;
}

export async function POST(request: Request) {
  const limit = checkPublicSubmitLimit(`apply:${getClientIp(request)}`, Date.now());
  if (limit.limited) {
    return NextResponse.json(
      { error: '잠시 후 다시 시도해 주세요.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } }
    );
  }

  // 미들웨어가 /api/* 요청 본문을 버퍼링하므로(상한 10MB) 초과 시 파싱 자체가 던진다.
  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    console.error('[public/apply] 요청 본문 파싱 실패', error);
    return NextResponse.json(
      { error: '사진 용량이 너무 큽니다. 장당 크기를 줄여 다시 시도해 주세요.' },
      { status: 400 }
    );
  }

  const raw: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') raw[key] = value;
  }
  const parsed = fields.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: '입력 내용을 확인해 주세요.' }, { status: 400 });
  }
  const f = parsed.data;
  if (f.birthYear > CURRENT_YEAR - 19) {
    return NextResponse.json({ error: '미성년자는 신청할 수 없습니다.' }, { status: 400 });
  }

  const photos = form.getAll('photos').filter((v): v is File => v instanceof File && v.size > 0);
  if (photos.length < MIN_PHOTOS) {
    return NextResponse.json({ error: `사진을 ${MIN_PHOTOS}장 이상 올려주세요.` }, { status: 400 });
  }
  // 저장 전에 전부 검증한다 — 일부만 저장된 신청은 운영자도 신청자도 다루기 어렵다.
  // existingCount에 지금까지 검증한 장수를 누적해서 넘겨야 장수 상한이 실제로 걸린다
  // (새 프로필이라 기존 장수는 0이지만, 이번 요청 안에서의 누적은 반영해야 한다).
  for (let i = 0; i < photos.length; i += 1) {
    try {
      assertUploadable(photos[i].type, photos[i].size, i);
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }
  }

  const handle = normalizeHandle(f.handle);
  if (!handle) {
    return NextResponse.json({ error: '스레드 아이디를 확인해 주세요.' }, { status: 400 });
  }

  const idealType = [
    f.idealHeight && `키 ${f.idealHeight}`,
    f.idealVibe && `얼굴 느낌: ${f.idealVibe}`,
    f.idealInner,
    f.idealAgeGap && `나이차이: ${f.idealAgeGap}`,
  ].filter((v): v is string => Boolean(v));

  const profile = await prisma.profile.create({
    data: {
      sourceHandle: handle,
      rawText: serializeRawText(f),
      gender: f.gender,
      birthYear: f.birthYear,
      heightCm: f.heightCm,
      region: f.region,
      job: f.job,
      hobbies: splitList(f.hobbies),
      appealPoints: [f.appeal1, f.appeal2, f.appeal3].filter(Boolean),
      idealType,
      partnerRegions: splitList(f.idealRegions),
      dealBreakers: splitList(f.dealBreakers),
    },
    select: { id: true },
  });

  let photoFailed = 0;
  for (let i = 0; i < photos.length; i += 1) {
    try {
      const bytes = new Uint8Array(await photos[i].arrayBuffer());
      const storageKey = await putPhoto(profile.id, bytes, photos[i].type);
      await prisma.photo.create({
        data: {
          profileId: profile.id,
          storageKey,
          contentType: photos[i].type,
          bytes: photos[i].size,
          order: i - photoFailed,
        },
      });
    } catch (error) {
      console.error('[public/apply] 사진 저장 실패', error);
      photoFailed += 1;
    }
  }

  return NextResponse.json({ ok: true, photoFailed }, { status: 201 });
}
