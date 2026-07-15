"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Delegated, reduced-motion-aware magnetic hover and card reveal controller. */
export function MotionDirector() {
  const pathname = usePathname();

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const root = document.documentElement;
    root.classList.toggle("motion-ready", !reduced);

    const cards = [...document.querySelectorAll<HTMLElement>("[data-reveal-card]")];
    let observer: IntersectionObserver | undefined;
    if (!reduced && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            (entry.target as HTMLElement).classList.add("is-revealed");
            observer?.unobserve(entry.target);
          }
        },
        { threshold: 0.12, rootMargin: "0px 0px -5%" },
      );
      cards.forEach((card) => observer?.observe(card));
    } else {
      cards.forEach((card) => card.classList.add("is-revealed"));
    }

    if (!finePointer || reduced) return () => observer?.disconnect();

    let active: HTMLElement | undefined;
    const release = (element?: HTMLElement) => {
      if (!element) return;
      element.style.setProperty("--mag-x", "0px");
      element.style.setProperty("--mag-y", "0px");
      element.classList.remove("is-magnetic");
      window.dispatchEvent(new Event("oce-cta-release"));
    };
    const onMove = (event: PointerEvent) => {
      const element = (event.target as Element | null)?.closest<HTMLElement>("[data-magnetic]");
      if (!element) {
        release(active);
        active = undefined;
        return;
      }
      if (active !== element) {
        release(active);
        active = element;
        element.classList.add("is-magnetic");
        window.dispatchEvent(new Event("oce-cta-press"));
      }
      const rect = element.getBoundingClientRect();
      const x = Math.max(-7, Math.min(7, (event.clientX - rect.left - rect.width / 2) * 0.12));
      const y = Math.max(-5, Math.min(5, (event.clientY - rect.top - rect.height / 2) * 0.14));
      element.style.setProperty("--mag-x", `${x.toFixed(2)}px`);
      element.style.setProperty("--mag-y", `${y.toFixed(2)}px`);
    };
    const onOut = (event: PointerEvent) => {
      if (!active) return;
      const related = event.relatedTarget;
      if (related instanceof Node && active.contains(related)) return;
      release(active);
      active = undefined;
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onOut, { passive: true });
    return () => {
      observer?.disconnect();
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onOut);
      release(active);
      root.classList.remove("motion-ready");
    };
  }, [pathname]);

  return null;
}
