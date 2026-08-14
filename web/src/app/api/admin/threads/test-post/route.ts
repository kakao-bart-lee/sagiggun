import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getThreadsAccount } from '@/lib/threads/account';
import { ensureFreshThreadsToken } from '@/lib/profile/service';
import { publishThreadsPost, ThreadsApiError } from '@/lib/threads/client';

const bodySchema = z.object({ text: z.string().trim().min(1) });

// 프로필·승인 파이프라인과 무관한 연결 확인용 게시다. seq도 없고 어디에도 기록을 남기지
// 않는다 — 다만 실제로, 영구적으로 Threads에 올라간다.
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: '게시할 문구를 입력해 주세요.' }, { status: 400 });
  }

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
    const postId = await publishThreadsPost({
      accessToken,
      threadsUserId: account.threadsUserId,
      text: parsed.data.text,
    });
    return NextResponse.json({ postId });
  } catch (error) {
    const message = error instanceof ThreadsApiError ? error.message : 'Threads 게시에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
