# Decisions

> **Current state:** Front Page (formerly Option A2) is the only UI and is served at `/`. Options A (Briefing), B (Story) and C (Command) and the comparison landing page have been removed; old `/option-*` URLs redirect to `/`. The notes below are kept as the design record.

Three prototypes of one product: a visual digest of a personal-injury case file, read from Clio Manage, for the attorney, the treating provider and the client. They share one data layer and one access layer and differ in layout, navigation and motion.

## Recommendation for the demo video

**Lead with Option A2, Front Page** (see below): it keeps Briefing's strengths and fixes its length. "Brief me" is the opening shot of the video. The original recommendation follows.

**Lead with Option A, Briefing, and use Option B, Story, for the reveal of the money problem.**

Briefing wins the 90-second test that the brief sets. The client's face and name, the value-versus-coverage bar and a four-sentence summary with footnoted sources all land on the first screen, and every figure is one hover from its Clio record. It looks like a considered product rather than a dashboard template, it reads well on a projector, and it is the calmest version to narrate over. Its provider and client pages are also the strongest of the three, so the shared-link moment works best there.

Story is the most memorable 20 seconds: the hero collapsing into the sticky header and the specials stacking up while the section is pinned make "the case is worth more than the coverage" visible. It is weaker as a daily tool, because scrolling through pins is slower than looking. In the video, cut to Story for the money chapter and the horizontal timeline, then come back.

Command is the best working tool for an attorney who already knows the case. It is the hardest to read cold in a recording, so show it last and briefly: one lens change (the FLIP reflow), one tile expanding, and ⌘K opening a record.

## Option A2: Front Page (built after review, now the recommendation)

Briefing tested best, but it still asked the reader to take in too much at once: about 5,100px and nine sections, all fully open. Front Page (now `/`) keeps Briefing's editorial voice and tokens and changes how the information is delivered.

- **One screen for the 90-second read.** At 1440×900 the front page holds the identity line, a money headline ("Worth $375,000. Covered for $100,000. / $275,000 sits above the coverage."), a money ruler, a one-sentence lede, a ranked "needs you" queue with the limitations date pinned on top, the case spine and a section index. The full summary is one click away.
- **Money ruler.** Value as one bar: the solid part is what the per-person limit covers, the lien is carved out of it, and the hatched part is exposure. Ticks mark billed specials and specials plus wage loss, which shows that the bills alone already exceed the limit.
- **Case spine.** The whole file on one axis in three lanes (liability, medical, legal and money), with a monthly file-activity strip on top. Every record is a faint tick, the ten ranked moments are sized by score, and the limitations date (satisfied), today and the undated surgery (a dashed line running to today) are drawn in. Hover, focus or ← → to read a moment; click to open its source.
- **Answer-first sections.** Each section title is a sentence built in `lib/derive/headlines.ts` (tested), e.g. "$118,400 billed, already more than the $100,000 limit." The headlines alone tell the case.
- **Depth dial (1 / 2 / 3).** Glance shows one line per section, so the whole case fits in about 1.4 screens. Brief shows the headline, a picture and three facts. Full shows everything. The section you are reading stays pinned while the page reflows, and at Glance any single section opens on its own.
- **Linked highlighting.** Hovering a provider or a moment lights every matching element (spine, queue, care lanes, specials, story) and dims the rest.
- **Body map.** Injured regions on a schematic figure seen from behind (left is left, spine visible). A solid ring is surgery done; a turning dashed ring is surgery recommended and undated. Regions and sides come from the derive layer's anatomical vocabulary.
- **"New" lens (n).** Swaps the queue for the changes since the last visit, lights those records across the page and shades the window on the spine.
- **Brief me (b).** A spotlight walks six beats in about 30 seconds: who, the money, what needs doing, the story (the spine plays its moments), the open question and the score. Each beat's sentence is derived. Space pauses, arrows step and Esc leaves; scrolling or clicking also pauses.
- **Navigation.** The section index docks into the masthead once you scroll past it, with scroll-spy. `j`/`k` step between sections.
- **Library.** GSAP for the composed entrance (one sequenced timeline, including the spine drawing itself). Motion for depth changes, presence, the docked nav and the spotlight, because those are layout and presence transitions that must stay interruptible.
- **Firm view as a dashboard (revised).** After review the firm page moved from an editorial scroll to boxed cards, so each section has a clear frame and label:
  - **Top row:** a client card (portrait, name, incident, stage) and a summary card (lede, "read more", how it was generated).
  - **KPI strip:** labelled tiles for estimated value, per-person limit (with the "Whose limit?" flag), a wide red "Exposed above coverage" tile holding the money ruler, specials billed and case strength.
  - **Bento of eight cards:** needs you (tall, limitations date pinned first), case timeline (the spine), what changed, injuries (body map), care and attendance, medical specials, liability and case strength.
  - **Card anatomy:** every card has a header bar (icon, label, key figure, a "to check" count where records disagree, open button) and an answer-first headline.
  - **Opening a card:** it grows into a focus panel over the board (shared-layout morph) and shrinks back into its slot on close or Esc. The board never reshuffles, and the slot shows a dashed placeholder while the card is open.
  - **Depth dial:** sets every card at once. Glance shows headlines only, so the whole case fits on one screen; Brief is compact; Full shows full detail in place.
  - **Carried over:** linked highlighting, the "new" lens, Brief me (its spotlight now tracks each card every frame) and `j`/`k` navigation. The docked nav now appears once the KPI strip scrolls away.
- **Provider page, a status board.** The four answers come first as four plain sentences ("The case is active, in litigation. There is coverage. Your patient is attending. The firm needs one thing from you."), each underlined in its status colour. Below them, four tiles each give a verdict with a picture: the stage track, the coverage lock, a 16-week attendance strip (12 weeks back, 4 ahead), and the open requests. Hovering a sentence finds its tile. Further down: request cards with how late they are, the open question with a days-open counter, the full attendance strip, the case updates (latest five, with "show all") and the provider's own bills. The shared link (`/p/<token>`) now renders this layout too.
- **Client page, plain English, no figures.** "Hi Justin." is followed by one sentence: the step they're at and the weekday of the next appointment. Below that: a journey path with a breathing "you are here" node (vertical on phones), "where we are" and "what usually happens next", a four-to-six-week calendar with appointments and the meeting where documents are due, a checklist of what we need, a diagram (marked as an illustration with no numbers) of why the settlement isn't what you take home, and "what we've done so far".
- **Neither page changed the access layer.** Both read only the role-scoped payloads from `lib/access`; every sentence is assembled from those fields.
- **Light / dark toggle** in the masthead on every A2 page and on the shared link. It follows the system until you pick, remembers the choice per browser (localStorage; a convenience, not shared state), and is restored by a tiny script in `<head>` before first paint, so there is no flash. The icon is chosen by CSS for the same reason. Colours cross-fade for 260 ms when you switch (instant under reduced motion). Scoped to `.opt-a2`, so the other options still follow the system.

Screens: `docs/screens/front-page-*`.

## What each option optimizes for

| | Briefing (A) | Story (B) | Command (C) |
| --- | --- | --- | --- |
| Optimizes for | The 90-second read, and trust | The pitch: a narrative a partner or client can follow | Depth and speed of navigation |
| Layout | One editorial column + money rail; glance, act, story | Full-height chapters with a persistent chapter nav | 12-column bento of live tiles |
| Navigation | Scroll; footnote markers open sources | Chapter nav jumps instantly; pinned sections scrub | Lenses, expand any tile, ⌘K palette |
| Motion | One composed entrance, count-ups, a timeline that draws itself, bars that fill once | Hero parallax-collapse, sentence-by-sentence light-up, pinned specials stack, pinned horizontal timeline | Staggered tile entrance, FLIP layout reflow on lens and expand, spring lens pill |
| Library | GSAP. The entrance is one sequenced timeline; the draw is scroll-triggered | GSAP + ScrollTrigger. Pinning and scrubbing are the concept | Motion. Layout (FLIP) and exit animations are built in and interruptible |
| Theme | Light warm neutrals, dark-aware | Cool porcelain and navy, dark-aware | Dark only, by concept |
| Type | Newsreader (opsz) + Hanken Grotesk | Bricolage Grotesque + Geist | IBM Plex Sans + Plex Mono for figures |

### Trade-offs

- **Briefing** is long. The story section sits below two screens of content, and the full chronology is a long list. It is the most conventional of the three; that is part of why it is trustworthy, and part of why it is less of a spectacle.
- **Story** costs time per fact. Pinned sections add scroll distance, so the chapter nav has to work hard, and the horizontal scrub is meaningless on touch and tablet (it falls back to a vertical list under 900px, and everything falls back to static under reduced motion). Its large display type is the least dense; it shows the fewest numbers per screen.
- **Command** has the highest cognitive load and the weakest first impression for a cold viewer. Seventeen tiles compete; the lenses exist to tame that. Dark-only suits the concept but not every office.

## Architecture decisions

- **One data path: the Python pipeline.** `scripts/export_matter.py` reads Clio API v4 (GET only, paginated, retries 429) into `data/clio/matter.json`; `ocr_pipeline.py` and `scripts/triage.py` add per-page document text and Jev scores. `lib/clio/pipeline.ts` reads those files into one `MatterBundle`. No case data is checked in; the old seed-JSON fixture is gone.
- **Read-only, enforced in code.** `ClioClient.request()` only accepts GET and throws `ClioReadOnlyError` otherwise (tested). Everything we persist lives in SQLite (`data/lawgiq.db`): Clio snapshots, digests, last-opened timestamps, settings, provider visibility, the sharing log with open tracking, and client photos.
- **No case facts in components.** Every number, date and name comes from `lib/derive`. Rules use generic legal and medical vocabulary (e.g. "recommended" + a procedure phrase; "By medical provider:" task prefix; anatomical regions), never Sapini facts. Where data is missing, components show an empty state.
- **Access enforced in the data layer.** Pages are server components. They call `lib/server/case.ts`, which returns only the role's selector output (`lib/access`): `selectProviderView` builds a new object from an allowlist of candidate items (their requests, their bills, their records, their own treatment points, plain-English milestones), then drops anything the attorney excluded. Valuation, wage loss, liability notes, credibility risks, other providers and client contact details are never candidates. Tests scan the serialized payload for forbidden strings. `/api/view` exposes the exact payload for inspection.
- **Released by default, but only from the allowlist.** The brief says never show a provider anything the attorney hasn't released. We read that as: only allowlisted, provider-safe categories can be released, the four core answers are released by default so the product works out of the box, and the coverage dollar amount is withheld by default. The attorney toggles per item in the preview pane before sharing.
- **Digest once per data change.** The rules digest and the optional AI digest are cached by a SHA-256 of the Clio data (excluding fetch time). Page loads read the cache. The AI digest (Claude Opus 5.5, structured output, server-side refusal fallback) runs in the background only when `ANTHROPIC_API_KEY` is set, because sending case data to a model provider should be a deliberate choice by the firm. Every AI sentence must cite record ids; uncited sentences are dropped. The UI labels which engine wrote it and from how many items.
- **Timeline ranking.** Each record is scored by named rules (surgery, shifted liability, coverage confirmed, suit filed, demand served, ...). Subject-line matches outrank body mentions; chasers and requests are capped; one-time events dedupe; at most two beats per rule in the top 10. Every ranked event carries its reason. An AI digest can re-word reasons.
- **Treatment gaps are documentation gaps.** A gap is a stretch with no dated record of care (calendar visit, a produced records range, or a contemporaneous attendance report attributed to the provider in the same sentence). That is how defence counsel will read the file, so it is the honest thing to show. The threshold (45 days) is visible and adjustable.
- **SOL.** A past limitations date whose Clio task is complete renders as "satisfied" with its sources, pinned first. Only an incomplete past date is "expired" (tested both ways).
- **Conflicts are surfaced, not resolved.** Four generic rules produce "Check this" flags with both sources: an overdue task with a same-subject message nearby, a self-insured defendant with a recorded per-person limit, a filing dated differently in documents and the expense ledger, and duplicate communications.
- **Last opened.** Per user and matter in our DB. Opens within 30 minutes count as one visit, so a refresh doesn't empty "what changed". First visit shows the last 14 days and says so. A demo control rewinds the last visit.
- **Client photo.** Clio's seed has no photo field and the live contact read asks for none by default (`CLIO_CONTACT_EXTRA_FIELDS` can add an avatar field). Without one, the UI shows initials and an "Add photo" control that stores a resized JPEG in our DB. Never a stock face.

## Choices made without asking

- **No auth.** One demo attorney identity (`attorney-demo`). The role switcher is a demo affordance; in production the role comes from the session, and provider access is only through share tokens.
- **Provider identity.** Providers are Clio relationships whose description reads as treating care. A person contact working at a provider company (Dr. Capiola at McCulloch) is folded into the practice. Specials lines without a Clio contact (surgical center, imaging, physiatry) show in the firm view only.
- **Deep links.** Clio doesn't document web-app URLs, so `lib/clio/links.ts` uses the current hash routes and a configurable base.
- **The `review-animations` skill isn't installed in this environment.** We ran `improve-animations` (the audit counterpart) instead, plus impeccable's critique with separate design-review and detector passes. Findings and fixes are below.
- **"Today"** is the real clock, which matches the dataset's 2026-10-02. `DATASET_TODAY` pins it.

## Review findings and fixes

Method: `improve-animations` audit (inline), then impeccable critique per option with an isolated design-review sub-agent per option and a separate detector pass (`detect.mjs`), synthesized here. Heuristic scores are the reviewers' scores before fixes.

| | Briefing | Story | Command |
| --- | --- | --- | --- |
| Nielsen total (before fixes) | 25/40 | 24/40 (as designed) | 22/40 (as designed) |
| Detector findings | 0 | 0 | 0 |

### Blocking bugs found and fixed

- **P0, all options: the page could not be scrolled or clicked with a real mouse.** The source drawer force-mounted a modal Radix Dialog; its closed overlay kept `pointer-events: auto`, a body scroll lock and `aria-hidden` on the page. Our screenshot helper scrolled from code, so it hid the bug. The drawer is now a plain non-modal panel (CSS transitions, focus moves in and back, Escape closes) and `scripts/smoke.mjs` drives real wheel, click, drawer and role-switch input on all nine views. It passes on dev and production builds.
- **P0, Command: ⌘K crashed.** The palette's items weren't inside cmdk's `<Command>`. Fixed; the palette searches tiles, actions, roles and every record.

### Fixed

- **Trust layer.** Superscripts meant "footnote n" in the lede but "n sources" elsewhere. Superscripts are now only sequential footnotes; everything else uses the source glyph. The note glyph no longer looks like an edit button. Custom-field previews show "$375,000", not "375000"; drawer tabs are labelled by field.
- **The headline number contradicted itself** ("Confirmed" beside "Check this"). Every option now says "Confirmed in writing · 1 record disagrees" or "Whose limit is this?" with the conflict stated in place. The digest says "limit on record" and names the doubt. Providers are no longer told coverage is "confirmed" while the firm has an open conflict on it. Story's money chapter title is derived from the data instead of hard-coded.
- **Hierarchy of the 90-second insight.** Briefing's rail and Command's first tile now lead with the exposure above coverage as the largest figure; value and limit sit beside it. Command's other numerals were reduced.
- **Client copy.** "What comes next: trial" is replaced with per-stage "what usually happens next" copy that doesn't predict the outcome. Jargon in milestones was rewritten.
- **Story pacing.** The specials pin shrank to 0.6 viewport heights and the timeline scrub to 55% of its travel. The ghost year columns are gone, summary sentences start at half opacity, and chapter jumps no longer land on a blank band.
- **Story honesty.** The specials total no longer shows interpolated sums while scrubbing; only the stack animates.
- **Briefing layout.** A "needs you now" strip under the lede brings the overdue task, the next due item and client contact above the fold. The change feed is capped at four. Provider sharing is collapsed behind a button. The page ends on case strength, and demo controls moved to the footer.
- **Command.** Lenses show only their tiles. Tiles expand in place instead of jumping to the top. Keys 1–5 switch lenses and arrow keys move within the lens group. Escape no longer collapses a tile while the palette is open. Expand buttons are at full contrast and tile borders are stronger.
- **Provider view.** "Is my patient showing up?" now answers in words (yes / booked / not recently), the strip has a legend, and bills being reconciled say so.
- **Smaller fixes.** Pluralisation in share labels, ISO dates in the share editor, the leaking drawer shadow, the overflowing "Today" label, and the stepper silently failing. Also: dynamic components created during render, setState-in-effect mount flags (which had stopped Command's entrance from running at all), and the ⌘K overlay fading on a keyboard toggle.

### Known gaps, not fixed

- **No way to contact the firm from the provider or client pages.** The matter read doesn't include firm contact details. The next step would be reading the responsible attorney via `GET /users` and showing a call/email action.
- **Providers can't reply or upload** against a request. That needs a write path into our own store, and the brief scoped this round to read and share.
- **The role switcher shows on provider and client pages.** It is a prototype affordance; real providers arrive through `/p/<token>`, which has no switcher.
- **Story is long and counts up on every visit**, and Command still has many equal-weight tiles under "Everything". Both are inherent to their concepts. Briefing doesn't have these problems, which is part of why it's the recommendation.
- **Source data spelling.** Notes and tasks keep the British spellings they were written with ("itemised", "defence"); only our own UI copy was changed.

## Deliverables

- Front Page screenshots for Firm, Provider and Client, desktop (1440×900), tablet (820×1180) and dark: `docs/screens/front-page-*`. Regenerate with `node scripts/capture.mjs <baseUrl>`. (The A/B/C screenshots and animation clips were removed with those options.)
- Checks: `npm test` (28 derive and access tests), `node scripts/smoke.mjs <baseUrl>` (real-input smoke test), `npx tsc --noEmit`, `npx eslint .`, `npm run build`.
