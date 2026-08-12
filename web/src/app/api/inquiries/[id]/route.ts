import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { applyInquiryAction, type InquiryActionInput } from '@/lib/inquiry/service';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
    include: {
      target: { select: { id: true, seq: true, sourceHandle: true, status: true } },
      fromProfile: { select: { id: true, sourceHandle: true, status: true } },
      deliveries: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!inquiry) return NextResponse.json({ error: '없는 관심 건입니다.' }, { status: 404 });
  return NextResponse.json({ inquiry });
}

// 액션별로 필요한 필드가 다르다 — discriminated union으로 검증한다.
const actionBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('REQUEST_SPEC'), body: z.string().min(1) }),
  z.object({ action: z.literal('ATTACH_PROFILE'), fromProfileId: z.string().min(1) }),
  z.object({ action: z.literal('FORWARD'), body: z.string().min(1) }),
  z.object({
    action: z.literal('ACCEPT'),
    bodyForFrom: z.string().optional(),
    bodyForTarget: z.string().optional(),
  }),
  z.object({ action: z.literal('DECLINE'), body: z.string().optional() }),
  z.object({ action: z.literal('CLOSE') }),
]);

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const parsed = actionBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const result = await applyInquiryAction(id, parsed.data as InquiryActionInput);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ status: result.status, deliveryIds: result.deliveryIds });
}
