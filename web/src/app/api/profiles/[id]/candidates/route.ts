import { NextResponse } from 'next/server';
import { listCandidatesFor } from '@/lib/match/candidates';

type Params = { params: Promise<{ id: string }> };

/**
 * 화면용 후보 목록. LLM을 부르지 않으므로 기준 인물을 바꿀 때마다 즉시 응답한다.
 * 추천을 실제로 만들고 저장하는 건 POST /match 쪽이다.
 */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const result = await listCandidatesFor(id);
    if (!result) return NextResponse.json({ error: '없는 프로필입니다.' }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[candidates]', error);
    return NextResponse.json({ error: '후보를 불러오지 못했습니다.' }, { status: 500 });
  }
}
