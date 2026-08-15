import { filterCandidates, type MatchProfileSlice } from '@/lib/match/filter';
import { scoreDirection, harmonic, type DimScore } from '@/lib/match/score';
import { defaultCandidateDeps } from '@/lib/match/source';

export type CandidateView = {
  id: string;
  seq: number | null;
  gender: string | null;
  birthYear: number | null;
  region: string | null;
  heightCm: number | null;
  job: string | null;
  /** subject가 적은 조건에 이 후보가 맞는 정도 */
  mine: number;
  /** 이 후보가 적은 조건에 subject가 맞는 정도 */
  theirs: number;
  harmonic: number;
  mineParts: DimScore[];
  theirParts: DimScore[];
};

export type CandidatesDeps = {
  findSubject?: (id: string) => Promise<MatchProfileSlice | null>;
  listPool?: () => Promise<MatchProfileSlice[]>;
  listJudged?: (subjectId: string) => Promise<string[]>;
};

/**
 * 화면용 후보 목록. LLM을 부르지 않는다 — 구조화 점수만으로 줄을 세우므로
 * 기준 인물을 바꿀 때마다 즉시, 무료로 다시 계산된다.
 * runMatch와 달리 8명으로 자르지 않고 통과한 전원을 준다(운영자가 훑어야 하므로).
 */
export async function listCandidatesFor(
  subjectId: string,
  deps: CandidatesDeps = {}
): Promise<{ subject: MatchProfileSlice; candidates: CandidateView[] } | null> {
  const d = { ...defaultCandidateDeps(), ...deps };

  const subject = await d.findSubject(subjectId);
  if (!subject) return null;

  const [pool, judged] = await Promise.all([d.listPool(), d.listJudged(subjectId)]);

  const candidates = filterCandidates(subject, pool, { excludeIds: new Set(judged) })
    .map((c) => {
      const mineDir = scoreDirection(subject, c);
      const theirDir = scoreDirection(c, subject);
      return {
        id: c.id,
        seq: c.seq,
        gender: c.gender,
        birthYear: c.birthYear,
        region: c.region,
        heightCm: c.heightCm,
        job: c.job,
        mine: mineDir.score,
        theirs: theirDir.score,
        harmonic: harmonic(mineDir.score, theirDir.score),
        mineParts: mineDir.parts,
        theirParts: theirDir.parts,
      };
    })
    .sort((a, b) => b.harmonic - a.harmonic);

  return { subject, candidates };
}


