"use client";

import {
  AddressBookIcon,
  ArrowSquareOutIcon,
  BriefcaseIcon,
  CalendarBlankIcon,
  CheckSquareIcon,
  EnvelopeSimpleIcon,
  FileTextIcon,
  NoteIcon,
  PhoneIcon,
  ReceiptIcon,
  UsersThreeIcon,
  XIcon,
  type Icon,
} from "@phosphor-icons/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { SourceKind, SourceRef } from "@/lib/clio/types";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The trust layer. Every number and date on screen carries a SourceChip;
 * hovering previews the originating Clio record, clicking opens it in the
 * side drawer with a deep link to Clio.
 */

export const KIND_ICON: Record<SourceKind, Icon> = {
  matter: BriefcaseIcon,
  custom_field: BriefcaseIcon,
  contact: AddressBookIcon,
  relationship: UsersThreeIcon,
  note: NoteIcon,
  communication: EnvelopeSimpleIcon,
  task: CheckSquareIcon,
  calendar_entry: CalendarBlankIcon,
  expense: ReceiptIcon,
  document: FileTextIcon,
};

const KIND_LABEL: Record<SourceKind, string> = {
  matter: "Matter",
  custom_field: "Custom field",
  contact: "Contact",
  relationship: "Relationship",
  note: "Note",
  communication: "Communication",
  task: "Task",
  calendar_entry: "Calendar entry",
  expense: "Expense",
  document: "Document",
};

/** Kind icon for a source; calls get a phone. */
export function SourceIcon({ source, size = 14, className }: { source: SourceRef; size?: number; className?: string }) {
  if (source.kind === "communication" && source.label.startsWith("Call")) return <PhoneIcon size={size} className={className} aria-hidden />;
  const I = KIND_ICON[source.kind];
  return <I size={size} className={className} aria-hidden />;
}

type Ctx = { open: (sources: SourceRef[], index?: number) => void };
const SourceCtx = createContext<Ctx>({ open: () => {} });
export const useSources = () => useContext(SourceCtx);

export function SourceProvider({ children, className }: { children: ReactNode; className?: string }) {
  const [state, setState] = useState<{ sources: SourceRef[]; index: number; open: boolean }>({ sources: [], index: 0, open: false });
  const returnFocus = useRef<HTMLElement | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const open = useCallback((sources: SourceRef[], index = 0) => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setState({ sources, index, open: true });
  }, []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  const value = useMemo(() => ({ open }), [open]);
  const active = state.sources[state.index];

  // A plain panel, not a modal: the page stays scrollable and clickable, the
  // panel retargets mid-transition, and focus moves in and back out.
  useEffect(() => {
    if (!state.open) return;
    closeBtn.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      returnFocus.current?.focus?.({ preventScroll: true });
    };
  }, [state.open, close]);

  return (
    <SourceCtx.Provider value={value}>
      {children}
      {state.open ? (
        <div aria-hidden onClick={close} className="source-drawer-scrim fixed inset-0 z-40 bg-[var(--scrim)]" data-state="open" />
      ) : null}
      <aside
        role="dialog"
        aria-modal="false"
        aria-labelledby="source-drawer-title"
        data-state={state.open ? "open" : "closed"}
        {...(!state.open ? { inert: true } : {})}
        className={cn(
          "source-drawer fixed inset-y-0 right-0 z-50 flex w-full max-w-[min(100vw,30rem)] flex-col border-l border-line bg-card-bg text-ink",
          state.open ? "shadow-[0_24px_64px_-12px_color-mix(in_oklab,var(--ink)_28%,transparent)]" : "pointer-events-none",
          className,
        )}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 pb-4 pt-5">
          {active ? (
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-signal-wash text-signal">
              <SourceIcon source={active} size={16} />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-ink-soft">
              {active ? KIND_LABEL[active.kind] : "Source"}
              {active?.date ? <span className="tnum"> · {fmtDate(active.date)}</span> : null}
            </p>
            <h2 id="source-drawer-title" className="mt-0.5 text-[17px] font-medium leading-snug text-ink">
              {active ? active.label.replace(/^[^·]+·\s*/, "") : "Source"}
            </h2>
          </div>
          <button
            ref={closeBtn}
            type="button"
            onClick={close}
            className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors duration-150 hover:bg-paper-2 hover:text-ink"
            aria-label="Close source"
          >
            <XIcon size={18} />
          </button>
        </div>

        {state.sources.length > 1 ? (
          <nav aria-label="Sources for this value" className="flex gap-1.5 overflow-x-auto border-b border-line px-5 py-2.5">
            {state.sources.map((s, i) => (
              <button
                key={`${s.kind}-${s.id}-${i}`}
                type="button"
                onClick={() => setState((st) => ({ ...st, index: i }))}
                aria-current={i === state.index}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors duration-150",
                  i === state.index ? "border-signal bg-signal-wash text-ink" : "border-line text-ink-soft hover:text-ink",
                )}
              >
                <SourceIcon source={s} size={13} />
                <span className="tnum max-w-[12rem] truncate">{s.date ? fmtDate(s.date) : s.label.replace(/^[^·]+·\s*/, "")}</span>
              </button>
            ))}
          </nav>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {active?.body || active?.snippet ? (
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{active.body ?? active.snippet}</p>
          ) : (
            <p className="text-[15px] leading-relaxed text-ink-soft">This record has no text body. Its value is shown where it was cited.</p>
          )}
        </div>

        <div className="border-t border-line px-5 py-4">
          {active?.clioUrl ? (
            <a
              href={active.clioUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[14px] font-medium text-paper transition-transform duration-150 active:scale-[0.97]"
            >
              Open in Clio
              <ArrowSquareOutIcon size={15} aria-hidden />
            </a>
          ) : (
            <p className="text-[13px] leading-relaxed text-ink-soft">
              Fixture mode: this record comes from the Sapini seed file, so there is no Clio page to open. With a Clio token set, this button deep-links to the record.
            </p>
          )}
        </div>
      </aside>
    </SourceCtx.Provider>
  );
}

type ChipVariant = "chip" | "footnote" | "inline" | "icon";

/**
 * A consistent pointer to evidence. `chip` is the default small pill;
 * `footnote` renders a superscript marker (Briefing); `inline` wraps its
 * children as the trigger; `icon` is a bare 20px glyph button.
 */
export function SourceChip({
  sources,
  variant = "chip",
  label,
  children,
  className,
  footnote,
}: {
  sources: SourceRef | SourceRef[] | null | undefined;
  variant?: ChipVariant;
  label?: string;
  children?: ReactNode;
  className?: string;
  footnote?: number;
}) {
  const { open } = useSources();
  const list = (Array.isArray(sources) ? sources : sources ? [sources] : []).filter(Boolean);
  if (!list.length) return children ? <>{children}</> : null;
  const first = list[0];
  // A superscript only ever means "footnote n". Without an index, fall back to the glyph.
  if (variant === "footnote" && footnote === undefined) variant = "icon";
  const aria = `Source: ${first.label}${first.date ? `, ${fmtDate(first.date)}` : ""}${list.length > 1 ? `, and ${list.length - 1} more` : ""}`;

  const trigger =
    variant === "inline" ? (
      <button type="button" onClick={() => open(list)} aria-label={aria} className={cn("source-inline cursor-pointer text-left underline decoration-dotted decoration-[color-mix(in_oklab,var(--signal)_55%,transparent)] underline-offset-[0.22em] hover:decoration-signal", className)}>
        {children}
      </button>
    ) : variant === "footnote" ? (
      <button
        type="button"
        onClick={() => open(list)}
        aria-label={aria}
        className={cn("source-footnote ml-0.5 inline-grid min-w-[1.15rem] place-items-center rounded-full px-1 align-super text-[0.62em] font-medium leading-[1.4] text-signal tnum transition-colors duration-150 hover:bg-signal-wash", className)}
      >
        {footnote}
      </button>
    ) : variant === "icon" ? (
      <button type="button" onClick={() => open(list)} aria-label={aria} className={cn("source-icon inline-grid size-6 place-items-center rounded-full text-ink-soft transition-colors duration-150 hover:bg-signal-wash hover:text-signal", className)}>
        <SourceIcon source={first} size={14} />
      </button>
    ) : (
      <button
        type="button"
        onClick={() => open(list)}
        aria-label={aria}
        className={cn(
          "source-chip inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-line bg-card-bg px-2 text-[11.5px] leading-none text-ink-soft transition-[color,border-color,transform] duration-150 hover:border-signal hover:text-signal active:scale-[0.97]",
          className,
        )}
      >
        <SourceIcon source={first} size={12} />
        <span className="tnum">{label ?? (first.date ? fmtDate(first.date, { year: true }) : KIND_LABEL[first.kind])}</span>
        {list.length > 1 ? <span className="tnum opacity-70">+{list.length - 1}</span> : null}
      </button>
    );

  return (
    <HoverCard openDelay={350} closeDelay={80}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-80 rounded-[calc(var(--radius)+2px)] border border-line bg-card-bg p-3.5 text-ink shadow-[0_12px_32px_-8px_color-mix(in_oklab,var(--ink)_25%,transparent)] ring-0">
        <p className="flex items-center gap-1.5 text-[12px] text-ink-soft">
          <SourceIcon source={first} size={13} />
          {KIND_LABEL[first.kind]}
          {first.date ? <span className="tnum">· {fmtDate(first.date)}</span> : null}
        </p>
        <p className="mt-1 text-[13.5px] font-medium leading-snug text-ink">{first.label.replace(/^[^·]+·\s*/, "")}</p>
        {first.snippet ? <p className="mt-1.5 line-clamp-4 text-[13px] leading-relaxed text-ink-soft">{first.snippet}</p> : null}
        <p className="mt-2 text-[12px] text-signal">Click to open{list.length > 1 ? ` all ${list.length} sources` : " the record"}</p>
      </HoverCardContent>
    </HoverCard>
  );
}
