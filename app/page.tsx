import { existsSync } from "node:fs";
import path from "node:path";
import Image from "next/image";
import Link from "next/link";
import { listProviders } from "@/lib/server/case";

export const dynamic = "force-dynamic";

const OPTIONS = [
  {
    slug: "option-a2",
    name: "Front Page",
    tagline: "Briefing, rebuilt for speed",
    rationale:
      "Briefing's voice in a dashboard. A client card and summary, a strip of labelled money KPIs (the exposure tile carries the value-versus-coverage ruler), then a bento of labelled cards: needs you, a three-lane case timeline, what changed, a body map, care lanes, specials, liability and strength. Every card answers its question in its first line and opens into a focus panel with full detail; a depth dial (Glance, Brief, Full) sets every card at once. Hover a provider or a moment and it lights everywhere; \"new\" lights what changed since your last visit; \"Brief me\" walks the page in thirty seconds. The provider page answers its four questions in four sentences and four picture tiles; the client page is a journey with a \"you are here\" marker, a calendar and no figures. Light and dark are a click apart.",
    motion: "GSAP for the composed entrance and the spine drawing itself; Motion for depth changes, presence and the spotlight, which must stay interruptible.",
    theme: "Briefing's warm newsprint tokens, dark-mode aware. Newsreader + Hanken Grotesk.",
  },
  {
    slug: "option-a",
    name: "Briefing",
    tagline: "Editorial and calm",
    rationale:
      "Reads like the top of a news story about the case. The client's portrait and name lead, the AI summary is the lede with footnoted sources, and the money sits in a right rail where the gap between value and coverage is drawn as a single bar. Everything below is ordered glance, act, story. Motion is one composed entrance, a timeline that draws itself and bars that fill once. It optimizes for the 90-second read and for trust: every figure is a footnote away from its Clio record.",
    motion: "GSAP: the entrance is one sequenced timeline, and the timeline draw is scroll-triggered.",
    theme: "Light warm neutrals, dark-mode aware. Newsreader + Hanken Grotesk.",
  },
  {
    slug: "option-b",
    name: "Story",
    tagline: "Cinematic scroll",
    rationale:
      "Tells the file top to bottom. A full-height hero with the portrait and the three money figures collapses into a sticky header; the summary lights up sentence by sentence; medical specials stack up block by block while the section is pinned; the chronology from 2023 to today is a pinned horizontal scrub. A persistent chapter nav jumps anywhere instantly, so the spectacle never traps the attorney. It optimizes for the demo and for walking a partner or client through the case.",
    motion: "GSAP + ScrollTrigger: pinning and scrubbing are the concept, with matchMedia fallbacks.",
    theme: "Cool porcelain and navy, dark-mode aware. Bricolage Grotesque + Geist.",
  },
  {
    slug: "option-c",
    name: "Command",
    tagline: "Dense, dark bento",
    rationale:
      "An instrument panel for the attorney who wants to dig into everything after the first pass. Live tiles carry every derived view at once. Lenses (money, medical, legal, risks) reflow the grid, any tile expands to full width, and ⌘K jumps to a tile, opens any record in the file, switches role or syncs. Layout changes animate with FLIP so the eye can follow where things went. It optimizes for depth and speed of navigation.",
    motion: "Motion: layout (FLIP) and exit animations are built in and stay interruptible as springs.",
    theme: "Dark blue-graphite, cyan signal. IBM Plex Sans + Plex Mono for figures.",
  },
] as const;

function shot(slug: string) {
  const file = `/screens/${slug}-firm-desktop.png`;
  return existsSync(path.join(process.cwd(), "public", file)) ? file : null;
}

export default async function Home() {
  const providers = await listProviders();
  const p = providers.find((x) => /mcculloch/i.test(x.name)) ?? providers[0];

  return (
    <main id="main" className="mx-auto max-w-[78rem] px-4 pb-24 pt-14 sm:px-8 sm:pt-20">
      <header className="max-w-[46rem]">
        <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Lawgiq</p>
        <h1 className="mt-6 text-[clamp(2.4rem,1.8rem+2.6vw,4rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-ink">Four ways to read one case file</h1>
        <p className="mt-5 text-[17px] leading-relaxed text-ink-soft">
          Same Sapini matter read from Clio, same derive layer, same role-scoped access rules. Each option makes a different argument about how an attorney, a treating provider and a client should
          see the story of a personal-injury case.
        </p>
      </header>

      <ol className="mt-16 flex flex-col gap-20">
        {OPTIONS.map((o, i) => {
          const img = shot(o.slug);
          return (
            <li key={o.slug} className="grid gap-8">
              <Link
                href={`/${o.slug}`}
                className="group relative block aspect-[16/9] overflow-hidden rounded-[14px] border border-line bg-paper-2 transition-transform duration-300 ease-[var(--ease-out-strong)] [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-0.5"
              >
                {img ? (
                  <Image src={img} alt={`${o.name}: firm view`} fill sizes="(min-width: 1248px) 1248px, 100vw" className="object-cover object-top" priority={i === 0} />
                ) : (
                  <span className="grid size-full place-items-center text-[15px] text-ink-soft">Open {o.name}</span>
                )}
              </Link>
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-16">
                <div>
                  <h2 className="text-[2rem] font-semibold tracking-[-0.03em] text-ink">
                    {o.name} <span className="font-normal text-ink-soft">· {o.tagline}</span>
                  </h2>
                  <p className="mt-3 text-[16px] leading-[1.7] text-ink">{o.rationale}</p>
                </div>
                <div className="flex flex-col gap-5 text-[14.5px]">
                  <dl className="flex flex-col gap-3">
                    <div>
                      <dt className="text-ink-soft">Motion</dt>
                      <dd className="mt-0.5 text-ink">{o.motion}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-soft">Look</dt>
                      <dd className="mt-0.5 text-ink">{o.theme}</dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/${o.slug}`} className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-[14px] font-medium text-paper transition-transform duration-150 active:scale-[0.97]">
                      Firm view
                    </Link>
                    {p ? (
                      <Link href={`/${o.slug}?role=provider&provider=${encodeURIComponent(p.id)}`} className="inline-flex h-10 items-center rounded-full border border-line-strong px-5 text-[14px] text-ink hover:border-ink">
                        Provider
                      </Link>
                    ) : null}
                    <Link href={`/${o.slug}?role=client`} className="inline-flex h-10 items-center rounded-full border border-line-strong px-5 text-[14px] text-ink hover:border-ink">
                      Client
                    </Link>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <section className="mt-24 grid gap-10 border-t border-line pt-10 lg:grid-cols-3" aria-labelledby="shared-h">
        <h2 id="shared-h" className="text-[1.4rem] font-semibold tracking-[-0.02em] text-ink lg:col-span-3">
          What they all share
        </h2>
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Read-only Clio, derived once</h3>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-soft">
            A GET-only API v4 client and a fixture adapter implement one interface. Every figure is derived in <code className="text-[13px]">lib/derive</code>; summaries are cached per data change.
          </p>
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Access enforced on the server</h3>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-soft">
            Provider and client pages receive a new object built by <code className="text-[13px]">lib/access</code>. Check the payloads:{" "}
            {p ? (
              <a className="text-signal underline" href={`/api/view?role=provider&provider=${encodeURIComponent(p.id)}`}>
                provider
              </a>
            ) : null}
            ,{" "}
            <a className="text-signal underline" href="/api/view?role=client">
              client
            </a>
            .
          </p>
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-ink">A source behind every number</h3>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-soft">
            Hover any source chip to preview the note, email, task or document; click to open it in the drawer with a deep link to Clio. Derived and AI values are marked separately.
          </p>
        </div>
      </section>
    </main>
  );
}
