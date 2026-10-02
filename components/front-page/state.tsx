"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Front Page state, shared by the masthead and the page:
 * - link: linked highlighting. Hovering a provider or an event lights every
 *   matching element on the page and dims the rest of that element's group.
 */

/** How much of a section shows: 2 on the board (brief), 3 when its card is expanded (full). */
export type Depth = 2 | 3;

type Link = { providers: string[]; events: string[]; source: "hover" } | null;

type Ctx = {
  link: Link;
  setLink: (l: Link) => void;
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

export function FrontPageState({ children }: { children: ReactNode }) {
  const [link, setLink] = useState<Link>(null);
  const [briefing, setBriefing] = useState(false);

  // Keyboard: b for the briefing. Never while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || briefing) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === "b") setBriefing(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [briefing]);

  const value = useMemo(() => ({ link, setLink, briefing, setBriefing }), [link, briefing]);
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
