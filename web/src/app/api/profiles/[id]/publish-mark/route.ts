import { NextResponse } from 'next/server';
import { markPublished } from '@/lib/profile/service';

type Params = { params: Promise<{ id: string }> };

/** Threads API 없이 손으로 게시한 뒤 상태를 PUBLISHED로만 올린다. */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const result = await markPublished(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ profile: result.profile });
}
