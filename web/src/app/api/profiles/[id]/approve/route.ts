import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canApprove } from '@/lib/profile/state';

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const profile = await prisma.profile.findUnique({
    where: { id },
    select: { finalBody: true, status: true },
  });
  if (!profile) return NextResponse.json({ error: '없는 프로필입니다.' }, { status: 404 });

  const check = canApprove(profile);
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

  // 읽어서 canApprove를 통과시킨 바로 그 finalBody/status가 쓰는 시점까지 그대로일 때만 쓴다.
  // 읽기(findUnique)와 쓰기 사이의 await 간격에 다른 요청(예: 다른 탭의 PATCH)이
  // finalBody를 비우면, 조건 없는 update는 그걸 모른 채 status만 APPROVED로 바꿔
  // "APPROVED인데 게시 문구가 빈" 불변식 위반 상태를 만든다(canApprove가 막으려던 바로 그 상태).
  // where에 읽은 값을 그대로 넣으면 그 사이 값이 바뀐 경우 count가 0이 되어,
  // 조용한 불변식 위반 대신 명시적 충돌 응답을 준다.
  // finalBody는 스키마상 nullable이지만 canApprove를 통과한 시점에는 항상 비어 있지 않은
  // 문자열이라 where에 null이 들어갈 일은 없다(들어가더라도 Prisma가 IS NULL로 번역한다).
  const result = await prisma.profile.updateMany({
    where: { id, finalBody: profile.finalBody, status: profile.status },
    data: { status: 'APPROVED' },
  });
  if (result.count === 0) {
    return NextResponse.json(
      { error: '승인하는 동안 프로필이 변경되었습니다. 새로고침 후 다시 시도해 주세요.' },
      { status: 409 }
    );
  }

  const updated = await prisma.profile.findUnique({ where: { id } });
  return NextResponse.json({ profile: updated });
}
