import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createInquiry } from '@/lib/inquiry/service';
import { checkPublicSubmitLimit, getClientIp } from '@/lib/rate-limit';

// 공개 관심 접수 — 후보 상세(/c/[seq])의 「관심 보내기」 폼이 호출한다.
// 인증이 없으므로: 게시 번호로만 대상을 지정할 수 있고(내부 id 노출·추측 차단),
// 응답에는 대상 정보를 다시 돌려주지 않는다.
const body = z.object({
  targetSeq: z.number().int().positive(),
  fromHandle: z.string().min(1).max(60),
  message: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  const limit = checkPublicSubmitLimit(`interest:${getClientIp(request)}`, Date.now());
  if (limit.limited) {
    return NextResponse.json(
      { error: '잠시 후 다시 시도해 주세요.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } }
    );
  }

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: '입력 내용을 확인해 주세요.' }, { status: 400 });
  }

  const result = await createInquiry({
    targetSeq: parsed.data.targetSeq,
    fromHandle: parsed.data.fromHandle,
    note: parsed.data.message,
    source: 'WEB',
  });
  if (!result.ok) {
    // 404(없는 번호)도 그대로 알려준다 — 게시 번호는 이미 공개 정보다.
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, reused: result.reused }, { status: result.reused ? 200 : 201 });
}
