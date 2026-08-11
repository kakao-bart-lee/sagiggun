import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { InterestForm } from './interest-form';

export const dynamic = 'force-dynamic';

// 후보 상세 — 게시 번호(seq)로만 접근한다. 내부 id·핸들·사진은 노출하지 않는다.
export default async function CandidatePage({ params }: { params: Promise<{ seq: string }> }) {
  const { seq } = await params;
  const seqNum = Number(seq);
  if (!Number.isInteger(seqNum) || seqNum <= 0) notFound();

  const profile = await prisma.profile.findFirst({
    where: { seq: seqNum, status: 'PUBLISHED', finalBody: { not: null } },
    select: { seq: true, finalBody: true },
  });
  if (!profile) notFound();

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <nav className="mb-6">
        <Link href="/" className="text-sm font-bold text-fog-muted hover:text-fog">
          ← 목록으로
        </Link>
      </nav>

      <article className="rounded-[12px] border-2 border-edge bg-card p-6 text-on-card">
        <h1 className="mb-4 text-2xl font-extrabold">{profile.seq}.</h1>
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
          {profile.finalBody}
        </pre>
      </article>

      <section className="mt-6 rounded-[12px] border-2 border-edge bg-card p-6 text-on-card">
        <h2 className="mb-1 text-lg font-extrabold">이 분에게 관심 보내기 📨</h2>
        <p className="mb-4 text-xs leading-relaxed text-muted-on-card">
          스레드 핸들을 남겨주시면 주인장이 DM으로 소개 양식을 보내드려요. 소개를 보내주시면
          상대분께 전달하고, 의향이 있으면 서로 연결해 드립니다.
        </p>
        <InterestForm targetSeq={profile.seq!} />
      </section>
    </main>
  );
}
