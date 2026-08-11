# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user is a single operator who runs a Threads-based intro / matching service. They work alone: logging in to the admin web app, pasting DM self-intros and photos, running LLM extract/compose, reviewing copy, and approving posts. A minimal applicant-facing public surface exists (anonymous listing, interest form, application form); multi-operator accounts remain out of scope.

## Product Purpose

Turn unstructured Threads DM self-introductions (text + photos) into reviewed, publish-ready profile copy. Success means the operator can go from paste → extract → draft → human approve without inventing missing facts, and only approved copy is eligible to publish.

The Chrome/Edge extension is the message-delivery layer for Threads (DM read/send has no public API): it inserts saved phrases into Threads composers. The admin web app owns intake, LLM formatting, and approval.

## Positioning

Operator tooling for a Threads matching workflow where publishing can be automated later via API, but DM collection and delivery must go through the browser. The durable mechanism is: paste-based intake + separated extract/compose LLM steps + an approval state machine that blocks publish without human review.

## Operating Context

Typical session: operator receives intros in Threads DMs → pastes handle, raw text, and photos into `/admin` → runs extract → runs compose → edits the draft against photos and source → saves and approves. Approved bodies are copied/posted manually today; automated publish and matching delivery are planned subsystems, not shipped.

Runs as a local or self-hosted Next.js app with Postgres; Korean UI copy today. Extension loads unpacked against threads.com / threads.net.

## Capabilities and Constraints

Confirmed today:

- Admin auth: single shared password, signed session cookie; no role model.
- Profile intake with duplicate-handle warning (does not block save).
- Photo upload to filesystem volume; served only through authenticated routes.
- LLM extract (structured fields, no guessing) and compose (fields + photos → draft body starting with ✨, no post number in body).
- Status machine: COLLECTED → DRAFTED → APPROVED → PUBLISHED (manual publish + seq issue via publish-mark); edit after approve returns to DRAFTED; ARCHIVED exists in the model with limited/no UI.
- Delete removes DB row and photo files together.
- Inbound interest (Inquiry) pipeline: RECEIVED → SPEC_REQUESTED → SPEC_RECEIVED → FORWARDED → ACCEPTED/DECLINED/CLOSED, driving typed delivery-queue drafts (spec request / spec forward / connect); extension can file interest from a DM and auto-attach collected replies.
- Public, unauthenticated surfaces: anonymous published-profile listing (`/`), per-number detail with interest form (`/c/[seq]`), structured application form (`/apply`, min 2 photos, adult + privacy consent, rate-limited). Handles and photos are never exposed publicly.

Explicitly undecided / open:

- Product display name: may remain informal or become **Some Love** (or another name); not locked.
- Brand voice and personality: open.
- Subsystem 3 (Threads Publishing API): designed as next product work, not yet built. Subsystem 4 (matching + DM delivery via extension) and the inbound-interest pipeline are shipped; delivery send remains manual by design.
- No additional operator-stated constraints beyond the shipped approval/privacy shape above.

## Brand Commitments

None locked. Working repo title has been 「사기꾼」; **Some Love** is a candidate. Do not treat either as final identity until confirmed.

## Evidence on Hand

- Product docs: `README.md`, `web/README.md`, `docs/superpowers/specs/2026-08-09-matching-intake-design.md`, `docs/superpowers/specs/2026-08-08-threads-snippets-design.md`
- Implemented surfaces: `web/src/app/admin/**`, `extension/`
- No customer testimonials, press, or marketing assets. Do not fabricate social proof.

## Product Principles

1. Human approval is mandatory before anything can be treated as publishable — LLM draft is never final on its own.
2. Preserve source truth: keep raw DM text and photos; extract only what the source supports.
3. Prefer operator certainty over automation theater: paste intake over brittle DM scraping for v1.
4. Keep the product operator-only until a deliberate product decision expands the audience.
5. Leave naming and brand voice flexible until an identity is chosen.
