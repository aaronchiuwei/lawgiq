# Lawgiq

Swans x Law Di Gras 2026 Applied AI Hackathon, Clio Manage track.

A visual digest of one personal-injury matter (Sapini), read live from Clio Manage, in three UI options that you can compare side by side. Each option has a Firm, Medical provider and Client view, cut by a role-scoped access layer on the server.

- `/` compares the options and links to every role view.
- `/option-a` Briefing: editorial and calm (GSAP).
- `/option-b` Story: cinematic scroll narrative (GSAP + ScrollTrigger).
- `/option-c` Command: dense dark bento with ⌘K (Motion).
- `/p/<token>` is the open-tracked link a provider receives when the attorney shares.
- `/api/view?role=provider&provider=<id>` returns the exact payload a provider's browser gets. Use it to check the access boundary.

See [DECISIONS.md](DECISIONS.md) for what each option optimizes for, the trade-offs and the recommendation for the demo video. Screenshots are in [docs/screens](docs/screens) and animation clips in [docs/motion](docs/motion).

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no Clio token set, the app runs in fixture mode and reads `fixtures/sapini-clio-data.json` through the same adapter interface as the live client.

```bash
npm test
```

## Live Clio

Set these in `.env.local`:

| Variable | Purpose |
| --- | --- |
| `CLIO_ACCESS_TOKEN` | OAuth access token for Clio Manage API v4. Its presence turns live mode on. |
| `CLIO_MATTER_ID` or `CLIO_MATTER_QUERY` | Which matter to read (id, or a search such as `Sapini`). |
| `CLIO_API_BASE` | Defaults to `https://app.clio.com/api/v4`; set the EU/CA host if needed. |
| `CLIO_APP_BASE` | Base for deep links into the Clio web app. |
| `FIXTURE_MODE=1` | Force fixture mode even with a token. |
| `SYNC_TTL_MINUTES` | Re-read Clio when the snapshot is older than this (default 10). |
| `ANTHROPIC_API_KEY` | Optional. Enables the cached AI digest (Claude Opus 5.5). Without it the rules engine writes the summary. |
| `DATASET_TODAY` | Pin "today" for demos and tests (e.g. `2026-10-02`). |

The Clio client issues GET requests only; `lib/clio/client.ts` refuses any other verb.

## Layout

```
lib/clio/      read-only API v4 client, fixture adapter, shared MatterSource interface
lib/derive/    KPIs, task buckets, SOL, deadlines, timeline merge + ranking, treatment gaps,
               specials, liability, scorecard, conflicts, rules digest
lib/access/    role-scoped selectors: firm, provider (allowlisted + attorney toggles), client
lib/ai/        optional Claude digest, cached per data hash
lib/db/        SQLite: snapshots, digests, last-opened, provider visibility, sharing log, photos
lib/server/    the one entry point pages call: sync, derive, select by role
components/case/       trust layer (source chips + drawer), sync, role switcher, shared viz
components/option-*/   the three designs; they only consume selector output
tests/                 derive and access tests
scripts/capture.mjs    regenerates docs/screens and docs/motion
```
