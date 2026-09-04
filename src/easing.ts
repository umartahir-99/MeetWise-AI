/**
 * GSAP easing names, translated to CSS timing functions.
 *
 * Components in this project take an `ease` prop written in GSAP's vocabulary
 * because that is the vocabulary their published APIs use. GSAP itself is not a
 * dependency - `motion` and plain CSS do all the animating here - so the names
 * are translated rather than honoured by a second animation engine.
 */

const EASES: Record<string, string> = {
  none: "linear",
  linear: "linear",
  "power1.in": "cubic-bezier(0.55, 0.09, 0.68, 0.53)",
  "power1.out": "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
  "power1.inOut": "cubic-bezier(0.46, 0.03, 0.52, 0.96)",
  "power2.in": "cubic-bezier(0.55, 0.06, 0.68, 0.19)",
  "power2.out": "cubic-bezier(0.22, 0.61, 0.36, 1)",
  "power2.inOut": "cubic-bezier(0.65, 0.05, 0.36, 1)",
  "power3.out": "cubic-bezier(0.16, 1, 0.3, 1)",
  "power4.out": "cubic-bezier(0.19, 1, 0.22, 1)",
  "back.out": "cubic-bezier(0.34, 1.56, 0.64, 1)",
  "expo.out": "cubic-bezier(0.16, 1, 0.3, 1)",
  "sine.out": "cubic-bezier(0.39, 0.58, 0.57, 1)",
};

export const DEFAULT_EASE = "power2.out";

/**
 * GSAP writes the same curve two ways - `power2.out` and `power2.easeOut` -
 * and both turn up in the wild, so fold the longer spelling onto the shorter.
 */
function normalize(ease: string): string {
  const dot = ease.indexOf(".");
  if (dot === -1) return ease.toLowerCase();

  const family = ease.slice(0, dot).toLowerCase();
  const mode = ease.slice(dot + 1).replace(/^ease/, "");
  if (!mode) return family;

  return `${family}.${mode.charAt(0).toLowerCase()}${mode.slice(1)}`;
}

export function toCssEase(ease: string): string {
  const known = EASES[normalize(ease)];
  if (known) return known;
  // Already a CSS timing function - pass it straight through.
  if (/^(cubic-bezier|steps|linear|ease)/.test(ease)) return ease;
  return EASES[DEFAULT_EASE];
}
