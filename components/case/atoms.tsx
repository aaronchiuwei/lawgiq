"use client";

import { CameraIcon, FunctionIcon, SparkleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SourceRef } from "@/lib/clio/types";
import { ago, fmtUsd, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SourceChip } from "./sources";
import { useNow } from "./use-now";

/**
 * Money that counts up once when it first scrolls into view. Server-renders
 * the final value (no layout shift, correct without JS); the count-up only
 * rewrites the text node. Reduced motion: no count.
 */
export function CountUp({
  value,
  format = (n) => fmtUsd(n),
  duration = 900,
  delay = 0,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const formatRef = useRef(format);
  useEffect(() => {
    formatRef.current = format;
  });
  useEffect(() => {
    const format = formatRef.current;
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let timer = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        el.textContent = format(0);
        timer = window.setTimeout(() => {
          const start = performance.now();
          const tick = (t: number) => {
            const p = Math.min(1, (t - start) / duration);
            const eased = 1 - Math.pow(2, -10 * p); // expo out
            el.textContent = format(p >= 1 ? value : value * eased);
            if (p < 1) raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
        }, delay);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      el.textContent = format(value);
    };
  }, [value, duration, delay]);
  return (
    <span ref={ref} className={cn("tnum", className)}>
      {format(value)}
    </span>
  );
}

/**
 * Marks a derived or AI-generated value, distinct from sourced facts, with an
 * expandable "how was this computed".
 */
export function DerivedNote({
  kind = "derived",
  title,
  children,
  sources,
  className,
}: {
  kind?: "derived" | "ai" | "rules";
  title?: string;
  children: ReactNode;
  sources?: SourceRef[];
  className?: string;
}) {
  const Icon = kind === "ai" ? SparkleIcon : FunctionIcon;
  const label = kind === "ai" ? "AI-generated" : kind === "rules" ? "Rules-generated" : "Derived";
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "derived-note inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-line-strong px-2 text-[11.5px] leading-none text-ink-soft transition-colors duration-150 hover:border-signal hover:text-signal",
          className,
        )}
      >
        <Icon size={12} aria-hidden />
        {label}
        <span className="sr-only">: how was this computed?</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 border border-line bg-card-bg p-4 text-ink shadow-[0_12px_32px_-8px_color-mix(in_oklab,var(--ink)_25%,transparent)] ring-0">
        <p className="text-[13.5px] font-medium">{title ?? "How was this computed?"}</p>
        <div className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{children}</div>
        {sources?.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {sources.slice(0, 6).map((s, i) => (
              <SourceChip key={`${s.id}-${i}`} sources={s} />
            ))}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** Sets data-seen on the element after it has been visible for a moment. */
export function useSeen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let t = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) t = window.setTimeout(() => el.setAttribute("data-seen", "true"), 1400);
        else clearTimeout(t);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(t);
    };
  }, []);
  return ref;
}

export function NewMark({ children, isNew, className }: { children: ReactNode; isNew: boolean; className?: string }) {
  const ref = useSeen<HTMLDivElement>();
  return (
    <div ref={ref} className={cn(isNew && "is-new", className)}>
      {children}
    </div>
  );
}

/**
 * Client portrait. Clio's seed data has no photo field, so this shows a
 * Clio avatar when present, else a photo stored in our DB, else initials
 * with an "Add photo" control. Never a stock face.
 */
export function Portrait({
  name,
  photo,
  editable,
  className,
  initialsClassName,
}: {
  name: string;
  photo: string | null;
  editable?: boolean;
  className?: string;
  initialsClassName?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const size = 480;
      const scale = Math.max(size / bitmap.width, size / bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, (size - bitmap.width * scale) / 2, (size - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
      const res = await fetch("/api/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl: canvas.toDataURL("image/jpeg", 0.86) }),
      });
      if (!res.ok) throw new Error("Upload failed");
      router.refresh();
    } catch {
      setError("Couldn't save that photo. Try a JPG or PNG under 10 MB.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("portrait group relative isolate overflow-hidden", className)}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={`Photo of ${name}`} className="size-full object-cover" />
      ) : (
        <div aria-label={`${name} (no photo on file)`} role="img" className={cn("grid size-full place-items-center bg-paper-2 text-ink", initialsClassName)}>
          {initials(name)}
        </div>
      )}
      {editable ? (
        <>
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className={cn(
              "absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-medium transition-opacity duration-200",
              photo
                ? "bg-[color-mix(in_oklab,var(--ink)_72%,transparent)] text-paper opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                : "text-ink-soft underline decoration-dotted underline-offset-2 hover:text-ink",
            )}
          >
            <CameraIcon size={13} aria-hidden />
            {busy ? "Saving…" : photo ? "Change photo" : "Add photo"}
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          {error ? (
            <p role="alert" className="absolute inset-x-0 top-full mt-1 text-[12px] text-exposure">
              {error}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** "Generated from 178 items · 2 minutes ago" line for AI/rules output. */
export function GeneratedLine({ itemCount, generatedAt, generator, className }: { itemCount: number; generatedAt: string; generator: { kind: string; model?: string }; className?: string }) {
  const now = useNow();
  return (
    <span className={cn("tnum", className)}>
      {generator.kind === "ai" ? `Generated by ${generator.model}` : "Generated by the rules engine"} from {itemCount} Clio items
      {now ? `, ${ago(generatedAt, now)}` : ""}
    </span>
  );
}
