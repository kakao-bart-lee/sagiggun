import { NextResponse } from 'next/server';
import { z } from 'zod';
import { patchDeliveryStatus } from '@/lib/match/service';

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  status: z.enum(['INSERTED', 'DONE', 'CANCELLED']),
});

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'status는 INSERTED, DONE, CANCELLED 중 하나여야 합니다.' },
      { status: 400 }
    );
  }

  const result = await patchDeliveryStatus(id, parsed.data.status);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ status: result.status });
}
