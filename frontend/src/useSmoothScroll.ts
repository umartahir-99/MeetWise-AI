import { useCallback, useEffect, useRef } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

/**
 * Page-level smooth scrolling.
 *
 * Lenis drives the real window scroll rather than transforming a wrapper, so
 * `window.scrollY`, `IntersectionObserver` and the sticky nav all keep reading
 * true values - nothing else in the app has to know this is running.
 *
 * Two things are deliberate:
 *
 * - Under `prefers-reduced-motion` no instance is created at all, and the
 *   returned `scrollTo` falls back to the native call. Smoothing a scroll is
 *   exactly the kind of motion that setting is asking us not to do.
 * - Anything that scrolls inside the page (a transcript panel, a list) carries
 *   `data-lenis-prevent`, so a wheel over it moves that panel and not the page.
 */

export interface ScrollToOptions {
  /** Added to the target position. Negative lifts the landing point. */
  offset?: number;
  /** Jump rather than travel - for a view change, where easing reads as lag. */
  immediate?: boolean;
}

export interface SmoothScrollApi {
  /** Scrolls to an element or offset, smoothly unless motion is reduced. */
  scrollTo: (target: string | HTMLElement | number, options?: ScrollToOptions) => void;
}

export function useSmoothScroll(): SmoothScrollApi {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    let raf = 0;
    const start = () => {
      if (lenisRef.current || reduced.matches) return;
      const lenis = new Lenis({
        // Slightly under half a second to settle: enough to read as eased,
        // short enough that the page still answers the wheel immediately.
        duration: 1.05,
        easing: (t: number) => 1 - Math.pow(1 - t, 3),
        smoothWheel: true,
        // Touch devices already have momentum in hardware; smoothing on top of
        // it fights the platform and feels laggy.
        syncTouch: false,
      });
      lenisRef.current = lenis;

      const frame = (time: number) => {
        lenis.raf(time);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      lenisRef.current?.destroy();
      lenisRef.current = null;
    };

    start();
    // Honour the setting being flipped mid-session rather than only at load.
    const onChange = () => {
      stop();
      start();
    };
    reduced.addEventListener("change", onChange);

    return () => {
      reduced.removeEventListener("change", onChange);
      stop();
    };
  }, []);

  return {
    scrollTo: useCallback((target, { offset = 0, immediate = false } = {}) => {
      const lenis = lenisRef.current;
      if (lenis) {
        lenis.scrollTo(target, { offset, immediate });
        return;
      }
      // Reduced motion, or before the instance exists: jump, don't animate.
      if (typeof target === "number") {
        window.scrollTo(0, target + offset);
        return;
      }
      const el = typeof target === "string" ? document.querySelector(target) : target;
      el?.scrollIntoView({ behavior: "auto", block: "start" });
    }, []),
  };
}
