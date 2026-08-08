import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractFields } from '@/lib/llm/extract';

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const profile = await prisma.profile.findUnique({
    where: { id },
    select: { rawText: true },
  });
  if (!profile) return NextResponse.json({ error: '없는 프로필입니다.' }, { status: 404 });

  try {
    const fields = await extractFields(profile.rawText);
    const updated = await prisma.profile.update({ where: { id }, data: fields });
    return NextResponse.json({ profile: updated });
  } catch (error) {
    // 추출 실패 시 상태를 바꾸지 않는다. 원문이 남아 있으니 다시 시도할 수 있다.
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
