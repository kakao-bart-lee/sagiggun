import { AdminTopBar } from '@/components/admin-ui';
import { prisma } from '@/lib/prisma';
import { FacingSheet } from './facing-sheet';

export const dynamic = 'force-dynamic';

export default async function MatchPage() {
  const subjects = await prisma.profile.findMany({
    where: { status: { in: ['APPROVED', 'PUBLISHED'] } },
    select: { id: true, seq: true, gender: true, birthYear: true, region: true },
    orderBy: [{ seq: 'asc' }, { createdAt: 'asc' }],
  });

  return (
    <>
      <AdminTopBar />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <FacingSheet subjects={subjects} />
      </main>
    </>
  );
}
