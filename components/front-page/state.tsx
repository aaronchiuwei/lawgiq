"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Front Page state, shared by the masthead and the page:
 * - depth: how much of every section shows (1 glance, 2 brief, 3 full).
 * - link: linked highlighting. Hovering a provider, an event or turning on
 *   "since you were here" lights every matching element on the page and dims
 *   the rest of that element's group.
 */

export type Depth = 1 | 2 | 3;
export const DEPTHS: { value: Depth; label: string; hint: string }[] = [
  { value: 1, label: "Glance", hint: "One line per section" },
  { value: 2, label: "Brief", hint: "Headline, picture, three facts" },
  { value: 3, label: "Full", hint: "Everything on file" },
];

type Link = { providers: string[]; events: string[]; source: "hover" | "changes" } | null;

type Ctx = {
  depth: Depth;
  setDepth: (d: Depth) => void;
  link: Link;
  setLink: (l: Link) => void;
  changesOn: boolean;
  toggleChanges: () => void;
  changeIds: Set<string>;
  briefing: boolean;
  setBriefing: (on: boolean) => void;
};

const FrontCtx = createContext<Ctx | null>(null);

export function useFront() {
  const ctx = useContext(FrontCtx);
  if (!ctx) throw new Error("useFront outside FrontPageState");
  return ctx;
}

/** Optional variant for chrome that also renders outside the firm view. */
export function useFrontMaybe() {
  return useContext(FrontCtx);
}

const KEY = "lawgiq.a2.depth";

export function FrontPageState({ children, changeIds }: { children: ReactNode; changeIds: string[] }) {
  const [depth, setDepthRaw] = useState<Depth>(2);
  const [link, setLink] = useState<Link>(null);
  const [changesOn, setChangesOn] = useState(false);
  const [briefing, setBriefing] = useState(false);
  const anchor = useRef<{ el: Element; top: number } | null>(null);
  const ids = useMemo(() => new Set(changeIds), [changeIds]);

  // Restore the reader's last depth (a per-viewer convenience only).
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(KEY));
      if (v === 1 || v === 3) queueMicrotask(() => setDepthRaw(v));
    } catch {
      /* storage unavailable: keep the default */
    }
  }, []);

  // Changing depth reflows the page. Keep the section you're reading pinned
  // where it was, so the page grows and shrinks around you, not under you.
  const setDepth = useCallback((d: Depth) => {
    const head = 120;
    const sections = [...document.querySelectorAll("[data-section]")];
    const el = sections.find((s) => s.getBoundingClientRect().bottom > head) ?? null;
    anchor.current = el && window.scrollY > 40 ? { el, top: el.getBoundingClientRect().top } : null;
    setDepthRaw(d);
    try {
      localStorage.setItem(KEY, String(d));
    } catch {
      /* ignore */
    }
  }, []);

  useLayoutEffect(() => {
    const a = anchor.current;
    if (!a) return;
    anchor.current = null;
    const delta = a.el.getBoundingClientRect().top - a.top;
    if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "instant" as ScrollBehavior });
  }, [depth]);

  const toggleChanges = useCallback(() => setChangesOn((v) => !v), []);

  // Keyboard: 1/2/3 depth, n for "since you were here". Never while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || briefing) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === "b") setBriefing(true);
      else if (e.key === "1" || e.key === "2" || e.key === "3") setDepth(Number(e.key) as Depth);
      else if (e.key === "n") toggleChanges();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setDepth, toggleChanges, briefing]);

  const effectiveLink: Link = useMemo(() => link ?? (changesOn ? { providers: [], events: changeIds, source: "changes" } : null), [link, changesOn, changeIds]);

  const value = useMemo(
    () => ({ depth, setDepth, link: effectiveLink, setLink, changesOn, toggleChanges, changeIds: ids, briefing, setBriefing }),
    [depth, setDepth, effectiveLink, changesOn, toggleChanges, ids, briefing],
  );
  return <FrontCtx.Provider value={value}>{children}</FrontCtx.Provider>;
}

/**
 * How an element relates to the current link: "on" if it matches, "off" if a
 * link is active and it doesn't, null when nothing is linked.
 */
export function useLinked({ providers = [], events = [] }: { providers?: string[]; events?: string[] }): "on" | "off" | null {
  const { link } = useFront();
  if (!link) return null;
  const hit = providers.some((p) => link.providers.includes(p)) || events.some((e) => link.events.includes(e));
  return hit ? "on" : "off";
}

/** Hover/focus handlers that set a provider link. */
export function useLinkHandlers(providers: string[], events: string[] = []) {
  const { setLink } = useFront();
  return useMemo(() => {
    if (!providers.length && !events.length) return {};
    const on = () => setLink({ providers, events, source: "hover" });
    const off = () => setLink(null);
    return { onPointerEnter: on, onPointerLeave: off, onFocus: on, onBlur: off };
  }, [providers, events, setLink]);
}
