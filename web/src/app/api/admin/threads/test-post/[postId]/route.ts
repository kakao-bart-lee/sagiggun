import { NextResponse } from 'next/server';
import { getThreadsAccount } from '@/lib/threads/account';
import { ensureFreshThreadsToken } from '@/lib/profile/service';
import { deleteThreadsPost, ThreadsApiError } from '@/lib/threads/client';

type Params = { params: Promise<{ postId: string }> };

// "테스트 게시"로 만든 글을 지우는 용도다. threads_delete 권한이 필요하므로, 이 권한이
// 추가되기 전에 연결한 계정은 재연결해야 동작한다.
export async function DELETE(_request: Request, { params }: Params) {
  const { postId } = await params;

  const account = await getThreadsAccount();
  if (!account) {
    return NextResponse.json(
      { error: 'Threads 연결이 필요합니다. 설정에서 연결해 주세요.' },
      { status: 400 }
    );
  }

  let accessToken: string;
  try {
    accessToken = await ensureFreshThreadsToken(account);
  } catch {
    return NextResponse.json(
      { error: 'Threads 연결이 만료됐습니다. 설정에서 다시 연결해 주세요.' },
      { status: 400 }
    );
  }

  try {
    await deleteThreadsPost({ accessToken, postId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof ThreadsApiError ? error.message : 'Threads 게시물 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
