import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { ProfileEditor } from './editor';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await prisma.profile.findUnique({
    where: { id },
    include: { photos: { orderBy: { order: 'asc' } } },
  });
  if (!profile) notFound();

  return (
    <main className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-2">
      <section className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">@{profile.sourceHandle}</h1>

        <div className="flex flex-wrap gap-2">
          {profile.photos.map((photo) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={photo.id}
              src={`/api/photos/${photo.id}`}
              alt=""
              className="h-40 w-40 rounded-lg object-cover"
            />
          ))}
        </div>

        <div>
          <h2 className="mb-2 text-sm text-neutral-400">DM 원문</h2>
          <pre className="whitespace-pre-wrap rounded-lg border border-neutral-800 p-4 text-sm">
            {profile.rawText}
          </pre>
        </div>
      </section>

      <ProfileEditor
        profile={{
          id: profile.id,
          status: profile.status,
          gender: profile.gender,
          birthYear: profile.birthYear,
          region: profile.region,
          heightCm: profile.heightCm,
          job: profile.job,
          hobbies: profile.hobbies,
          appealPoints: profile.appealPoints,
          idealType: profile.idealType,
          partnerBirthYearMin: profile.partnerBirthYearMin,
          partnerBirthYearMax: profile.partnerBirthYearMax,
          partnerRegions: profile.partnerRegions,
          dealBreakers: profile.dealBreakers,
          draftBody: profile.draftBody,
          finalBody: profile.finalBody,
        }}
      />
    </main>
  );
}
