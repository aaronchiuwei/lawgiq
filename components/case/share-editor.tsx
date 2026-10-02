"use client";

import { CheckIcon, CopyIcon, EnvelopeOpenIcon, EnvelopeSimpleIcon, PaperPlaneTiltIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import type { DraftItem, ProviderDraft, ShareSummary } from "@/lib/access";
import { ago, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Attorney-side preview of what a provider will see. Each releasable item can
 * be included or excluded (stored in our DB, enforced in lib/access), the
 * coverage dollar amount has its own switch, and "Share" snapshots the
 * resulting provider view into the sharing log with an open-tracked link.
 */

const KIND_TITLE: Record<DraftItem["kind"], string> = {
  contact: "Patient contact",
  attendance: "Attendance",
  request: "What the firm needs",
  question: "Open questions",
  bill: "Their bills",
  record: "Their records",
  feed: "Status updates",
};
const ORDER: DraftItem["kind"][] = ["contact", "attendance", "request", "question", "bill", "record", "feed"];

export function ShareEditor({
  drafts,
  shares,
  initialProviderId,
  className,
  previewHref,
}: {
  drafts: ProviderDraft[];
  shares: ShareSummary[];
  initialProviderId?: string;
  className?: string;
  /** Builds the link to preview a provider's view in this option. */
  previewHref: (providerId: string) => string;
}) {
  const router = useRouter();
  const [providerId, setProviderId] = useState(initialProviderId ?? drafts[0]?.providerId);
  const [pending, startTransition] = useTransition();
  const [lastShare, setLastShare] = useState<{ url: string; provider: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draft = drafts.find((d) => d.providerId === providerId) ?? drafts[0];
  const [optimistic, applyOptimistic] = useOptimistic(draft, (state: ProviderDraft, patch: { key?: string; included?: boolean; coverage?: boolean }) => ({
    ...state,
    showCoverageAmount: patch.coverage ?? state.showCoverageAmount,
    items: state.items.map((i) => (i.key === patch.key ? { ...i, included: patch.included ?? i.included } : i)),
  }));
  if (!draft || !optimistic) return <p className="text-[14px] text-ink-soft">No treating providers are linked to this matter in Clio.</p>;

  async function post(body: object) {
    const res = await fetch(`/api/providers/${encodeURIComponent(draft.providerId)}/visibility`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("save failed");
  }

  function toggle(item: DraftItem, included: boolean) {
    setError(null);
    startTransition(async () => {
      applyOptimistic({ key: item.key, included });
      try {
        await post({ itemKey: item.key, included });
        router.refresh();
      } catch {
        setError("Couldn't save that change. Try again.");
      }
    });
  }
  function toggleCoverage(show: boolean) {
    setError(null);
    startTransition(async () => {
      applyOptimistic({ coverage: show });
      try {
        await post({ showCoverageAmount: show });
        router.refresh();
      } catch {
        setError("Couldn't save that change. Try again.");
      }
    });
  }
  function share() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/shares", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerId: draft.providerId }) });
      if (!res.ok) {
        setError("Couldn't create the share link.");
        return;
      }
      const { token } = (await res.json()) as { token: string };
      setLastShare({ url: `${window.location.origin}/p/${token}`, provider: draft.providerName });
      setCopied(false);
      router.refresh();
    });
  }

  const included = optimistic.items.filter((i) => i.included).length;
  const providerShares = shares.filter((s) => s.providerId === draft.providerId);

  return (
    <div className={cn("share-editor", className)}>
      <div role="tablist" aria-label="Provider" className="flex flex-wrap gap-1.5">
        {drafts.map((d) => (
          <button
            key={d.providerId}
            role="tab"
            type="button"
            aria-selected={d.providerId === draft.providerId}
            onClick={() => {
              setProviderId(d.providerId);
              setLastShare(null);
            }}
            className={cn(
              "h-8 rounded-full border px-3 text-[13px] transition-colors duration-150",
              d.providerId === draft.providerId ? "border-ink bg-ink text-paper" : "border-line text-ink-soft hover:text-ink",
            )}
          >
            {d.providerName.replace(/,?\s*(P\.C\.|PLLC)$/, "")}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
        <div>
          <div className="flex items-center justify-between gap-4 rounded-[var(--radius)] border border-line bg-card-bg px-4 py-3">
            <div>
              <p className="text-[14px] font-medium text-ink">Show the coverage amount</p>
              <p className="text-[13px] text-ink-soft">Off: the provider only sees that coverage exists.</p>
            </div>
            <Switch checked={optimistic.showCoverageAmount} onCheckedChange={toggleCoverage} aria-label="Show the coverage dollar amount to this provider" />
          </div>

          {ORDER.map((kind) => {
            const items = optimistic.items.filter((i) => i.kind === kind);
            if (!items.length) return null;
            return (
              <fieldset key={kind} className="mt-5">
                <legend className="text-[13px] font-medium text-ink-soft">{KIND_TITLE[kind]}</legend>
                <ul className="mt-2 divide-y divide-line rounded-[var(--radius)] border border-line">
                  {items.map((item) => (
                    <li key={item.key} className="flex items-center gap-3 px-4 py-2.5">
                      <span className={cn("min-w-0 flex-1 text-[14px] leading-snug transition-colors duration-150", item.included ? "text-ink" : "text-ink-soft line-through decoration-line-strong")}>
                        {item.label}
                      </span>
                      <Switch checked={item.included} onCheckedChange={(v) => toggle(item, v)} aria-label={`Include: ${item.label}`} />
                    </li>
                  ))}
                </ul>
              </fieldset>
            );
          })}
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-[var(--radius)] border border-line bg-card-bg p-4">
            <p className="text-[14px] font-medium text-ink">
              {included} of {optimistic.items.length} items released
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">Strategy, valuation, wage loss, liability notes and other providers&apos; records are never candidates.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={share}
                disabled={pending}
                className="inline-flex h-9 items-center gap-2 rounded-full bg-ink px-4 text-[13.5px] font-medium text-paper transition-transform duration-150 active:scale-[0.97] disabled:opacity-60"
              >
                <PaperPlaneTiltIcon size={15} aria-hidden />
                Share with provider
              </button>
              <a href={previewHref(draft.providerId)} className="inline-flex h-9 items-center rounded-full border border-line px-4 text-[13.5px] text-ink transition-colors duration-150 hover:border-ink">
                Preview their view
              </a>
            </div>
            {lastShare ? (
              <div className="mt-3 rounded-[calc(var(--radius)-2px)] bg-good-wash p-3 text-[13px] text-ink" role="status">
                <p>Shared with {lastShare.provider}. Send them this link:</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-card-bg px-2 py-1 text-[12px]">{lastShare.url}</code>
                  <button
                    type="button"
                    aria-label="Copy share link"
                    onClick={() => navigator.clipboard.writeText(lastShare.url).then(() => setCopied(true))}
                    className="grid size-7 place-items-center rounded-full hover:bg-card-bg"
                  >
                    {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                  </button>
                </div>
              </div>
            ) : null}
            {error ? (
              <p role="alert" className="mt-3 text-[13px] text-exposure">
                {error}
              </p>
            ) : null}
          </div>

          <SharingLog shares={providerShares} title={`Sharing log · ${draft.providerName.split(" ")[0]}`} />
        </aside>
      </div>
    </div>
  );
}

export function SharingLog({ shares, title = "Sharing log", className }: { shares: ShareSummary[]; title?: string; className?: string }) {
  return (
    <div className={cn("rounded-[var(--radius)] border border-line bg-card-bg p-4", className)}>
      <p className="text-[14px] font-medium text-ink">{title}</p>
      {shares.length === 0 ? (
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">Nothing shared yet. Shares appear here with whether the provider opened them.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2.5">
          {shares.map((s) => (
            <li key={s.id} className="flex items-start gap-2.5 text-[13px]">
              {s.openCount ? <EnvelopeOpenIcon size={16} className="mt-0.5 shrink-0 text-good" aria-hidden /> : <EnvelopeSimpleIcon size={16} className="mt-0.5 shrink-0 text-ink-soft" aria-hidden />}
              <div className="min-w-0">
                <p className="text-ink">
                  <span className="tnum">{fmtDate(s.createdAt)}</span> · {s.itemCount} items to {s.providerName.replace(/,?\s*(P\.C\.|PLLC)$/, "")}
                </p>
                <p className="tnum text-ink-soft">
                  {s.openCount ? `Opened ${s.openCount}× · last ${ago(s.lastOpenedAt!)}` : "Not opened yet"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
