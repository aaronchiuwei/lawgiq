"use client";

import { stagger, useAnimate } from "motion/react";
import { useEffect } from "react";
import { canAnimate } from "@/components/case/motion";

/**
 * Staggered entrance for Command: [data-reveal] children start hidden by the
 * shared CSS gate, then fade/rise in order. Hidden tabs and reduced motion
 * skip straight to the final state.
 */
export function useCommandReveal<T extends HTMLElement>(step = 0.035) {
  const [scope, animate] = useAnimate<T>();
  useEffect(() => {
    const root = scope.current;
    const shell = root?.closest(".reveal-root");
    if (!root || !shell) return;
    if (!canAnimate()) {
      shell.classList.add("revealed");
      return;
    }
    const items = root.querySelectorAll<HTMLElement>("[data-reveal]");
    items.forEach((el) => (el.style.opacity = "0"));
    shell.classList.add("revealed");
    const controls = animate(
      items,
      { opacity: [0, 1], transform: ["translateY(10px)", "translateY(0px)"] },
      { duration: 0.5, delay: stagger(step, { startDelay: 0.05 }), ease: [0.23, 1, 0.32, 1] },
    );
    return () => controls.stop();
  }, [animate, scope, step]);
  return scope;
}
