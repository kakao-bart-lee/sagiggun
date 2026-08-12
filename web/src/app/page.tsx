import Link from 'next/link';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// 공개 홈 — 스레드 홍보를 대체/보완하는 후보 목록.
// 게시(PUBLISHED = 승인 + 게시 번호 발급)된 프로필의 소개글만 보여준다.
// 핸들·사진·연락처는 절대 노출하지 않는다 — 사진은 성사 과정에서 운영자가 전달한다.

function genderLabel(gender: string | null): string | null {
  if (gender === 'F') return '여성';
  if (gender === 'M') return '남성';
  return null;
}

function excerpt(body: string, maxLines = 4): string {
  const lines = body.split('\n').filter((line) => line.trim());
  return lines.slice(0, maxLines).join('\n');
}

export default async function PublicHome() {
  const profiles = await prisma.profile.findMany({
    where: { status: 'PUBLISHED', seq: { not: null }, finalBody: { not: null } },
    select: {
      seq: true,
      gender: true,
      birthYear: true,
      region: true,
      finalBody: true,
    },
    orderBy: { seq: 'desc' },
    take: 60,
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-10">
        <p className="text-[22px] font-extrabold tracking-tight text-fog">Some Love</p>
        <h1 className="mt-4 text-[32px] font-extrabold leading-tight text-fog">
          이상형 소개시켜드립니다 💗
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-fog-muted">
          주인장이 직접 연결해 드리는 온라인 소개팅입니다. 마음에 드는 번호가 있으면 관심을
          보내주세요 — 소개를 받아 상대분께 전달하고, 양쪽 모두 좋다고 하면 서로 연결해 드려요.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/apply"
            className="inline-flex min-h-12 items-center justify-center rounded-[10px] border-2 border-yellow bg-ink-elevated px-5 py-3 text-[15px] font-bold text-yellow shadow-[0_0_0_2px_var(--ink),0_0_0_4px_var(--yellow)] hover:bg-yellow hover:text-ink"
          >
            소개팅 신청하기
          </Link>
        </div>
        <ul className="mt-6 flex flex-col gap-1 text-xs text-fog-muted">
          <li>✔️ 사진은 주인장만 확인하고, 상대분이 의향을 밝히면 전달됩니다.</li>
          <li>✔️ 자기관리 조금이라도 되신 분만 신청해주세요.</li>
          <li>✔️ 미성년자는 신청할 수 없습니다.</li>
          <li>✔️ 스레드 안 하는 친구 대신 신청도 가능합니다.</li>
        </ul>
      </header>

      <section>
        <h2 className="mb-4 text-xl font-extrabold text-fog">지금 소개 중인 분들</h2>
        {profiles.length === 0 ? (
          <div className="rounded-[12px] border-2 border-dashed border-edge px-6 py-12 text-center text-sm text-fog-muted">
            아직 게시된 프로필이 없습니다. 먼저 소개팅을 신청해 보세요!
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {profiles.map((p) => (
              <li key={p.seq}>
                <Link
                  href={`/c/${p.seq}`}
                  className="flex h-full flex-col gap-3 rounded-[12px] border-2 border-edge bg-card p-5 text-on-card hover:border-telop-blue"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-extrabold">{p.seq}.</span>
                    {genderLabel(p.gender) && (
                      <span className="rounded-full border border-card-line px-2 py-0.5 text-[11px] font-bold text-muted-on-card">
                        {genderLabel(p.gender)}
                      </span>
                    )}
                    {p.birthYear != null && (
                      <span className="rounded-full border border-card-line px-2 py-0.5 text-[11px] font-bold text-muted-on-card">
                        {String(p.birthYear).slice(-2)}년생
                      </span>
                    )}
                    {p.region && (
                      <span className="rounded-full border border-card-line px-2 py-0.5 text-[11px] font-bold text-muted-on-card">
                        {p.region}
                      </span>
                    )}
                  </div>
                  <pre className="flex-1 whitespace-pre-wrap font-sans text-sm leading-snug text-on-card">
                    {excerpt(p.finalBody ?? '')}
                  </pre>
                  <span className="text-xs font-bold text-telop-blue">자세히 보기 →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-12 border-t-2 border-edge pt-6 text-xs text-fog-muted">
        <p>
          신청·관심 접수 시 입력한 정보는 소개 목적에만 사용됩니다. 연결이 끝나거나 요청하시면
          삭제합니다.
        </p>
      </footer>
    </main>
  );
}
