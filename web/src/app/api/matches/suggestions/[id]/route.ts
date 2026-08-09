import { NextResponse } from 'next/server';
import { z } from 'zod';
import { acceptSuggestion, dismissSuggestion } from '@/lib/match/service';

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  action: z.enum(['ACCEPT', 'DISMISS']),
});

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'action은 ACCEPT 또는 DISMISS입니다.' }, { status: 400 });
  }

  if (parsed.data.action === 'ACCEPT') {
    const result = await acceptSuggestion(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      suggestion: result.suggestion,
      deliveryIds: result.deliveryIds,
    });
  }

  const result = await dismissSuggestion(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
