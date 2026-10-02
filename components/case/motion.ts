/**
 * Entrance animations only run when someone can see them. A tab opened in the
 * background shows its content immediately instead of queueing a reveal.
 */
export function canAnimate(): boolean {
  if (typeof window === "undefined") return false;
  return !document.hidden && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
