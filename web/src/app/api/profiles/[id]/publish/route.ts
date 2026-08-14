import { NextResponse } from 'next/server';
import { publishToThreads } from '@/lib/profile/service';

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const result = await publishToThreads(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ profile: result.profile });
}
