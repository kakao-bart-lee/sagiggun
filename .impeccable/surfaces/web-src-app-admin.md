---
version: 1
slug: "web-src-app-admin"
primary_target: "web/src/app/admin"
related_targets: ["web/src/app/admin/login","web/src/app/admin/new","web/src/app/admin/profiles"]
---

# Surface: /admin

## Scope & mode
Operate — single-operator matching admin (login, session queue, new profile, split proof editor, **매칭 화면**).

## Audience / job
Batch 10–20 profiles every few hours. Top strip queues the session; selected row opens the proof desk.

매칭 화면 is its own job: pick who to introduce to one chosen person. The operator works top-down and burns five to ten candidates per success, so the screen is a worklist, not a report. Phone use is frequent alongside desktop.

## Direction
Register × Telop Ink. Comp: Strip + Proof Desk hybrid (`.impeccable/mocks/comp-ab-hybrid.png`).

매칭 화면 — **짝 대조 시트** (seed 2f1c28d4, surface roll): one pair at a time, 소개받는 분 and 후보 as two facing paper cards with a borderless gutter between them carrying the linkage. A rail above steps through candidates; ← → move too. On phone the subject card folds to a summary, DOM order stays 기준 → 후보 → 척추, and the action band fixes to the bottom.

## Copy constraint
Never use 「입수」. Prefer 「새 프로필」, 「오늘 세션」, 「대기 중」, profile/status terms.

매칭 화면 leads with a plain-Korean verdict sentence, never a score — 「서로 잘 맞아요」 / 「한쪽만 맞아요」 / 「무난해요」. Numbers live in the gutter and behind disclosure. 「안 적으셨어요」 means the condition is absent, never that it matches, and copy must not let the two blur. Explanation goes behind a `?`, not into the layout.

## Memorable moment
Strip + desk: yellow outlined stamp CTA + outlined status seals on white accession cards over ink-black blotter.

매칭 화면: the **맞물림 마크** — two interlocking rings where each ring's radius is how well the other person meets that person's conditions and the overlap is the harmonic mean. Authored SVG, 76×40, person colors on ink. It belongs to this screen only; it is meaningful solely where a bidirectional score exists, so it does not generalize into the shared system.

## Unresolved
Product name may stay Some Love (candidate). Brand voice open.

매칭 화면 is a standalone HTML study; it is wired into no route. Shipping it needs server-side work this design round did not build: bidirectional scoring, `partnerAgeRaw` → absolute birth-year parsing, parsed partner height bounds, `faceType`, and `seq` in the match slice. Scoring reads four dimensions only (나이·키·얼굴상·지역) — photos and 흡연 are absent, and both are stronger signals than what is scored. The gutter still annotates beside the two cards rather than joining them; open by agreement at finish review.
