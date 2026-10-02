"use client";

import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/**
 * Light / dark switch for the Front Page. The choice is a per-viewer
 * convenience: it lives in localStorage and on <html data-a2-theme>, which the
 * root layout restores before paint. Until someone picks, the system setting
 * decides.
 */

const KEY = "lawgiq.a2.theme";
type Theme = "light" | "dark";

function current(): Theme {
  const set = document.documentElement.dataset.a2Theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribe(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-a2-theme"] });
  mq.addEventListener("change", cb);
  return () => {
    mo.disconnect();
    mq.removeEventListener("change", cb);
  };
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore<Theme | null>(subscribe, current, () => null);

  const flip = () => {
    const next: Theme = current() === "dark" ? "light" : "dark";
    const html = document.documentElement;
    html.classList.add("a2-theme-switching");
    html.dataset.a2Theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable: the switch still applies for this visit */
    }
    window.setTimeout(() => html.classList.remove("a2-theme-switching"), 320);
  };

  const label = theme === "dark" ? "Switch to light mode" : theme === "light" ? "Switch to dark mode" : "Switch light or dark mode";
  // Both icons render; CSS picks one from <html data-a2-theme> or the system
  // setting, so the right icon shows on first paint with no hydration pop.
  return (
    <button
      type="button"
      onClick={flip}
      aria-label={label}
      title={label}
      className={cn(
        "relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-card-bg text-ink transition-[border-color,transform] duration-150 hover:border-ink active:scale-[0.94]",
        className,
      )}
    >
      <SunIcon size={17} weight="fill" aria-hidden className="a2-sun col-start-1 row-start-1" />
      <MoonIcon size={16} weight="fill" aria-hidden className="a2-moon col-start-1 row-start-1" />
    </button>
  );
}
