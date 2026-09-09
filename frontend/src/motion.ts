import type { Variants } from "motion/react";

/**
 * Shared motion vocabulary. Sections import from here rather than defining
 * their own timings, so the whole page animates as one system.
 *
 * Reduced-motion is handled globally by <MotionConfig reducedMotion="user">
 * in App.tsx - individual components don't need to guard for it.
 */

/** Animate once on entry, when a quarter of the element is on screen. */
export const viewportOnce = { once: true, amount: 0.25 } as const;

const EASE = [0.2, 0.7, 0.3, 1] as const;

/** Parent that releases its children one after another. */
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12, delayChildren: 0.05 },
  },
};

/** Default entry: rise and fade. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: EASE },
  },
};

/** Timeline entries arrive from whichever side of the centre line they sit on. */
export const fadeInFrom = (direction: "left" | "right"): Variants => ({
  hidden: { opacity: 0, x: direction === "left" ? -36 : 36 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: "spring", stiffness: 260, damping: 28 },
  },
});

/** Marker dots pop in on the line. */
export const markerPop: Variants = {
  hidden: { opacity: 0, scale: 0.4 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring", stiffness: 400, damping: 18 },
  },
};

/** Lift used by every clickable card. */
export const cardHover = {
  y: -4,
  transition: { type: "spring", stiffness: 300, damping: 20 },
} as const;

export const cardTap = { scale: 0.995 } as const;
