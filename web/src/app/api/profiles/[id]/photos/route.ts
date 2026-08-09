import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { assertUploadable, putPhoto } from '@/lib/storage';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const profile = await prisma.profile.findUnique({ where: { id }, select: { id: true } });
  if (!profile) return NextResponse.json({ error: '없는 프로필입니다.' }, { status: 404 });

  // 이 앱은 전역 미들웨어(/api/:path* 매처)를 쓰기 때문에 Next.js가 요청 본문 전체를
  // 메모리에 버퍼링한다(기본 상한 10MB, proxyClientMaxBodySize). 이 상한을 넘으면 본문이
  // 경계(boundary) 중간에서 잘려 formData() 파싱 자체가 예외를 던진다 — storage.ts의
  // 파일별 MAX_BYTES(10MB) 검증이 실행되기도 전에 벌어지는 일이라 여기서 따로 잡는다.
  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    console.error('[photos] 요청 본문 파싱 실패', error);
    return NextResponse.json(
      { error: '요청 본문을 읽을 수 없습니다. 사진 용량이 너무 크거나 요청 형식이 올바르지 않습니다.' },
      { status: 400 }
    );
  }
  const files = form.getAll('photos').filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: '사진이 없습니다.' }, { status: 400 });
  }

  const existing = await prisma.photo.count({ where: { profileId: id } });
  const saved: string[] = [];
  const failed: Array<{ name: string; reason: string }> = [];

  for (const file of files) {
    // 형식·크기·장수 검증 실패는 사용자가 원인을 알고 고칠 수 있어야 하니 이유를 그대로 보여준다.
    try {
      assertUploadable(file.type, file.size, existing + saved.length);
    } catch (error) {
      failed.push({ name: file.name, reason: (error as Error).message });
      continue;
    }

    // 저장 단계(디스크 쓰기·DB 기록) 실패는 storage.ts가 Node 원본 에러(서버 절대경로 포함)를
    // 그대로 던지므로, 클라이언트에는 일반화된 메시지만 보내고 원인은 서버 로그에만 남긴다.
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const storageKey = await putPhoto(id, bytes, file.type);
      const photo = await prisma.photo.create({
        data: {
          profileId: id,
          storageKey,
          contentType: file.type,
          bytes: file.size,
          // 검증(assertUploadable)이 쓰는 값과 같아야 한다. 이전에는 반복문 순번을
          // 썼는데, 그건 이번 요청의 모든 파일(실패 포함) 순번이라 앞선 파일이 검증에
          // 실패하면 두 값이 어긋나 서로 다른 사진이 같은 order를 갖게 됐다.
          // saved.push는 아래에 있으므로 이 시점의 saved.length는
          // "이번 요청에서 지금까지 성공한 개수"다.
          order: existing + saved.length,
        },
        select: { id: true },
      });
      saved.push(photo.id);
    } catch (error) {
      console.error('[photos] 업로드 실패', file.name, error);
      failed.push({ name: file.name, reason: '사진을 저장하는 중 오류가 발생했습니다.' });
    }
  }

  return NextResponse.json({ saved, failed }, { status: failed.length ? 207 : 201 });
}
