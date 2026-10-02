# Prompt: three UI options for the Sapini case dashboard

Paste everything below the line into a fresh Claude Code session in this repo.

---

You are building a case dashboard for personal-injury law firms (Swans Applied AI Hackathon, Clio Manage track). Produce **three distinct UI options** for the same product, as working front-end prototypes I can open in a browser and compare side by side. The UI must be **very clean, animated, impressive, and clear**: motion is there to explain and delight, never to slow anyone down or hide information.

Before designing, invoke these installed skills and follow them: `design-taste-frontend`, `impeccable`, `frontend-design`, `ui-ux-pro-max`, `emil-design-eng`, `animate`, `gsap-core`, `gsap-react`, `gsap-scrolltrigger`, `gsap-timeline`, `shadcn`, `high-end-visual-design`. After building, run `review-animations` and `impeccable` (critique/polish) on each option and fix what they find.

## 1. The product in one paragraph

A personal-injury case runs for years and the file fills with notes, emails, tasks, calendar entries and scanned PDFs. The firm has to reconstruct the case by hand every time, and the medical providers treating the client on a lien can see nothing (no stage, no coverage, nothing). Build a **visual digestion** of the case, not a chat box. The attorney should be up to speed in 90 seconds without knowing what to ask, and a provider should get four answers at a glance without emailing anyone. Existing tools (Clio, CasePeer, Lawmatics) show counts and lists with the story one click away; ours must show the story first.

## 2. Hard rules (from the hackathon; do not violate)

1. **One matter: Sapini.** The build reads it **live from Clio Manage** (API v4, base `https://app.clio.com/api/v4`). Seed data lives in `~/Downloads/sapini-clio-data.json` (Clio request bodies for contacts, matter, custom fields, notes, communications, tasks, calendar entries, expenses, documents). Treat it as the schema and as fixture data for local dev, but the real data path is Clio reads.
2. **Read-only against Clio.** GET only. Never POST/PATCH/DELETE case data. Anything we need to store (sharing log, provider-visibility settings, cached AI digests, "last opened" timestamps) goes in **our own database**, outside Clio.
3. **No hardcoded features.** Graders read the repo. Every number, date, name and list on screen must be derived from the data layer. If something can't be derived, show an honest empty state, not a fake value.
4. **Don't re-digest with AI on every open.** Generate the AI summary / timeline ranking / scorecard once per data change, cache it, and show "generated from N items, last synced X ago".

## 3. Three views, strict access boundaries

Build **Firm (attorney)**, **Medical provider**, and **Client** views. Each role sees only what it needs, and this must be enforced in the data layer (a role-scoped selector/API that physically omits fields), not by hiding elements with CSS. Include a role switcher in the prototype for demoing.

### 3a. Firm / attorney view (full access)

Layout as a three-zone page: *glance*, *act*, *story*.

**Top: the 90-second version**
- Client header: **photo (prominent, first thing the eye lands on)**, name, date of incident, case type, current stage. (Clio has no photo field in the seed data; use a contact avatar if the API returns one, otherwise a tasteful initials avatar and a clear "add photo" affordance. Never a stock face.)
- Two KPIs, each with a source link: **Estimated case value** and **coverage behind it (policy limits)**. Put **firm spend to date** (sum of case expenses) next to them.
- AI case summary: 3-4 sentences covering what happened, the injuries, and where the case stands now.
- **What changed since you last opened it**: a short list of new events. Needs a per-user "last opened" timestamp stored in our DB.

**Middle: what needs action**
- Tasks in three buckets: **overdue**, **coming up**, **waiting on someone else** (tasks titled "By medical provider: ..." are waiting-on-third-party).
- Key deadlines: **statute of limitations always on top**, then court dates and response deadlines.
- Last client contact: date, plus a flag when it's been too long (make the threshold a visible, adjustable constant).

**Lower: the story**
- **Top-10 timeline** of the most important events in order, with "show all" expanding to the full chronology (notes + communications + calendar + tasks merged). Ranking is AI-assisted and cached; show why each event ranked ("shifted liability", "surgery", "coverage confirmed").
- Injuries and treatment: primary injuries pulled from the records, each provider, treatment dates, and **gaps in treatment** highlighted.
- Medical specials: total bills **by provider** (a bar or stacked treemap, animated).
- Liability snapshot: how the accident happened, who's at fault, and risks (prior injuries, inconsistent client accounts).
- Case strength scorecard: factor-based score with an expandable rubric showing each factor, its weight, and its evidence.

### 3b. Medical provider view (short, scoped to one provider)

A provider asks four questions; answer each in one card above the fold:
1. **Is the case alive?** Current stage + date of the last *real* movement.
2. **Is there coverage?** Yes/no. The **attorney controls whether the dollar amount is shown** (per-provider toggle).
3. **Is my patient showing up?** This provider's own treatment dates and any gaps only.
4. **What does the firm need from me?** Outstanding records / bill requests addressed to this provider.

Plus: a short **status-update feed** (stage changes, milestones, written for a non-lawyer) and **their** bills and records only.

**Never show a provider:** case strategy, valuation or valuation reasoning, wage-loss figures, liability weaknesses, prior-injury or credibility notes, other providers' bills or records, client contact details, or anything the attorney hasn't released. When in doubt, omit. The attorney can **edit what a provider sees before sending** (a preview pane with per-item include/exclude).

### 3c. Client view (most restricted)

Plain-English, reassuring, jargon-free: current stage in a simple progress track, what happens next, the next appointment, what the client is asked to do (e.g. bring commission statements), and a plain explanation that final take-home depends on liens being negotiated. **No** valuation, strategy, liability analysis, scorecard, expert reports, or other parties' details.

## 4. Trust layer (non-negotiable; attorneys asked for it twice)

- **A source link on every number and date.** Clicking opens the originating Clio note, email, document or task in a side drawer (and deep-links to Clio). Show a small, consistent source chip beside values; on hover it previews the snippet.
- **Freshness**: "Last synced 3 minutes ago" in the header, with a quiet pulse while syncing and a clear stale state if the sync fails.
- **Sharing log** (firm view): what was shared with each provider, when, and **whether they opened it**. This needs our own DB and provider-open tracking.
- Mark derived/AI values distinctly from sourced facts, and let the attorney expand "how was this computed".

## 5. Real data you must handle correctly (Sapini matter)

Use these as acceptance tests for the data layer; derive, don't hardcode:
- Matter: Justin Sapini, MVA on **2023-04-23**, Cedar St & Garden St, New Rochelle. Opened 2023-05-07. Stage: **Litigation**. Pipeline: Intake > Treatment > Demand > Negotiation > Litigation > Trial > Disbursement > Closed.
- Defendants: Anthony Ferrara (driver) in a Metro-North vehicle; Metro-North Commuter Railroad is **self-insured**, claims administered by Claims Service Bureau, claim SIR068120. Scope of employment is the crux of liability.
- **Estimated value $375,000** vs **defendant liability limit $100,000 / $300,000** (confirmed). Show clearly that value exceeds coverage; this is the single most important insight on the page. Also: client UM/UIM $25k/$50k, no-fault $50,000 (exhausted), Medicaid lien $22,180.
- Specials to date **$118,400** (interim, flagged as such in the notes: the chiropractic and PT ledgers are unreconciled). Wage loss claimed $214,000 (firm-only; never provider/client-visible).
- **Statute of limitations 2026-04-22 is already past, but the task is marked complete** (notice of claim served and suit filed in time). The UI must not show a scary "expired" alarm here: render it as *satisfied*, with the source, and keep it pinned at the top of deadlines.
- Firm expenses sum to **$1,410** across 5 entries.
- Providers: Montefiore Nyack (ER), McCulloch Orthopaedic / Dr. Capiola, Advanced Rockland Chiropractic / Haggerty, SportsCare PT, plus imaging and physiatry/neurology. Outstanding requests to providers (McCulloch surgical date, Rockland ledger, SportsCare notes) feed the provider "what the firm needs" card.
- Open question to surface on both firm and provider timelines: **right shoulder surgery recommended 2024-05-27, still undated**.
- Treatment is ongoing (weekly chiro and PT); compute gaps from calendar and notes rather than assuming.
- Last client contact in the data is around 2026-09-27 (phone). Today is 2026-10-02 in the dataset.
- Watch for conflicting data (e.g. a task "obtain updated employment records" due 2026-09-26 vs. an email 2026-09-21 saying records were sent). Surface conflicts as a small "check this" flag instead of silently choosing.

## 6. The three options (same data, same rules, different design thinking)

Make them genuinely different in layout, navigation and motion language, not three skins.

**Option A: "Briefing"** (editorial, calm). A single-column-plus-rail magazine layout. Serif display type for the client name, generous whitespace, hairline rules. The AI summary reads like the lede of an article. Motion is restrained and precise: staggered reveals, number count-ups, a timeline that draws itself. Light theme with a warm neutral palette.

**Option B: "Story"** (cinematic scroll). The case is told top to bottom as a scroll narrative: a hero with the client photo and KPIs that parallax-collapses into a sticky header; the timeline becomes a pinned horizontal scrub (GSAP ScrollTrigger) through 2023 to 2026; specials animate as a growing stack as you pass them. The most "wow", but with a persistent mini-nav so an attorney can jump to any section instantly.

**Option C: "Command"** (dense but clear bento). A dark, high-contrast bento grid of live cards (KPIs, tasks, deadlines, timeline, scorecard) with fluid layout transitions (FLIP), a command palette (Cmd+K) to jump anywhere, and a source drawer that slides in over the grid. Built for the attorney who wants to "dig into everything" after the 90-second pass.

All three: responsive down to tablet, dark-mode-aware where it fits the concept, and each exposes the Firm / Provider / Client switcher.

## 7. Animation and craft requirements

- Library: **GSAP** (+ ScrollTrigger, Flip) and/or **Motion** (Framer Motion); pick per option and justify in one line.
- Every animation has a purpose (orient, confirm, show change, reveal hierarchy). Cut anything decorative that costs more than ~300 ms of attention.
- Entrances staggered by hierarchy (KPIs first, then summary, then the rest). Count-ups on money. Draw-on timelines. Skeleton-to-content transitions for sync. A subtle "new since last visit" highlight that fades after being seen.
- Animate only `transform` and `opacity`; respect `prefers-reduced-motion` (replace with instant or fade-only); keep 60fps; no layout thrash; use `gsap.matchMedia()` and proper cleanup (`useGSAP`).
- Interruptible: hover, drawer, and expand/collapse must never feel stuck mid-animation.
- Typography, spacing and color come from a defined token set per option. Avoid generic AI-template looks (default purple gradients, identical card grids, emoji icons).
- Accessibility: WCAG AA contrast, full keyboard nav, visible focus, semantic landmarks, ARIA live region for the "what changed" feed, tabular numerals for money and dates.

## 8. Tech and structure

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui. One shared **data layer** (`lib/clio/` for read-only API client and fixture adapter, `lib/derive/` for KPIs, tasks buckets, timeline merge and ranking, gaps, specials) and a shared **role-scoped selector layer** (`lib/access/`), with three option folders (`app/option-a`, `app/option-b`, `app/option-c`) that only consume selectors. A small SQLite/Postgres layer for the sharing log, provider visibility settings, last-opened timestamps and cached AI digests.
- Provide a `FIXTURE_MODE` env flag that reads `sapini-clio-data.json` through the same adapter interface so the UI works offline and in demos; the live Clio client uses the same interface.
- Seed no case facts in components. Add unit tests for the derive layer (SOL satisfied vs overdue, task buckets, treatment gaps, expense sum = $1,410, provider-scoping omits restricted fields).

## 9. Deliverables

1. Three runnable prototypes at `/option-a`, `/option-b`, `/option-c`, plus an index page comparing them with a one-paragraph rationale each.
2. For each option: screenshots of Firm, Provider and Client views (desktop + tablet) and a short screen recording or GIF of the key animations.
3. A short `DECISIONS.md`: what each option optimizes for, trade-offs, and which one you'd recommend for the demo video and why.
4. Run the animation review and design critique skills on each option and apply the fixes before reporting back.

Ask me nothing unless blocked; make reasonable choices, note them in `DECISIONS.md`, and keep going.
