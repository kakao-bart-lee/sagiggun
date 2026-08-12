import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { prisma } from '@/lib/prisma';
import { readPhoto } from '@/lib/storage';
import { deletePhoto } from '@/lib/profile/service';
import { clampPhotoWidth } from '@/lib/limits';

type Params = { params: Promise<{ id: string }> };

// 이 라우트는 미들웨어의 /api/* 매처에 걸려 인증을 요구한다.
// 사진에 공개 URL을 만들지 않는다.
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const photo = await prisma.photo.findUnique({ where: { id } });
  if (!photo) return NextResponse.json({ error: '없는 사진입니다.' }, { status: 404 });

  const width = clampPhotoWidth(new URL(request.url).searchParams.get('w'));

  try {
    const bytes = await readPhoto(photo.storageKey);

    if (!width) {
      return new NextResponse(Buffer.from(bytes), {
        headers: {
          'Content-Type': photo.contentType,
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }

    // 카드 썸네일(148px)과 갤러리에 원본(최대 10MB)을 그대로 내려보내던 문제를 고친다.
    // 리사이즈 변형은 요청 폭이 곧 캐시 키이고, 사진 원본은 삭제 후 재업로드로만 바뀐다
    // (같은 id의 바이트가 갱신되는 경로가 없다) — 그래서 불변으로 캐시해도 안전하다.
    const resized = await sharp(bytes)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    return new NextResponse(resized, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('[photos] 사진 파일 읽기 실패', photo.storageKey, error);
    return NextResponse.json({ error: '사진 파일을 찾을 수 없습니다.' }, { status: 404 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const result = await deletePhoto(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
