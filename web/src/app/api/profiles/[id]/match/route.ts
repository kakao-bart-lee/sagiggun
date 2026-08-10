import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runMatch, DEFAULT_TOP_N } from '@/lib/match/service';
import { prisma } from '@/lib/prisma';

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  topN: z.number().int().min(1).max(10).optional(),
});

/** subject 기준 매칭 추천 생성 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  let topN = DEFAULT_TOP_N;
  try {
    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (parsed.success && parsed.data.topN != null) topN = parsed.data.topN;
  } catch {
    /* empty body ok */
  }

  try {
    const result = await runMatch(id, topN);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      runId: result.runId,
      filteredCount: result.filteredCount,
      suggestions: result.suggestions,
    });
  } catch (error) {
    console.error('[match]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '매칭에 실패했습니다.' },
      { status: 500 }
    );
  }
}

/** subject의 최근 매칭 run + suggestions */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const profile = await prisma.profile.findUnique({ where: { id }, select: { id: true } });
  if (!profile) return NextResponse.json({ error: '없는 프로필입니다.' }, { status: 404 });

  const run = await prisma.matchRun.findFirst({
    where: { subjectId: id },
    orderBy: { createdAt: 'desc' },
    include: {
      suggestions: {
        orderBy: { rank: 'asc' },
        include: {
          candidate: {
            select: {
              id: true,
              sourceHandle: true,
              status: true,
              region: true,
              birthYear: true,
              gender: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json({ run });
}
