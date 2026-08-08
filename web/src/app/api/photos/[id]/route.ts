import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { readPhoto } from '@/lib/storage';

type Params = { params: Promise<{ id: string }> };

// 이 라우트는 미들웨어의 /api/* 매처에 걸려 인증을 요구한다.
// 사진에 공개 URL을 만들지 않는다.
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const photo = await prisma.photo.findUnique({ where: { id } });
  if (!photo) return NextResponse.json({ error: '없는 사진입니다.' }, { status: 404 });

  try {
    const bytes = await readPhoto(photo.storageKey);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': photo.contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    // readPhoto가 실패하면 Node 원본 에러(서버 절대경로 포함)가 그대로 올라온다.
    // 클라이언트에는 일반화된 한국어 메시지만 보내고, 원인은 서버 로그에만 남긴다.
    console.error('[photos] 사진 파일 읽기 실패', photo.storageKey, error);
    return NextResponse.json({ error: '사진 파일을 찾을 수 없습니다.' }, { status: 404 });
  }
}
