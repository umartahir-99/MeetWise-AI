import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toCssEase } from "@/lib/easing";

/**
 * Text that draws itself in outline, then fills.
 *
 * No animation library: the outline is real SVG stroking with an animated
 * `stroke-dashoffset`, and the fill is a CSS `clip-path` wipe. `motion` is the
 * only animation dependency this project has and it does not do stroke drawing,
 * so adding GSAP for one headline would have been the wrong trade.
 *
 * The one thing worth knowing: a dash animation only *reads* as drawing while
 * the dash length is close to the glyph's actual outline length. Set it to a
 * blanket constant and short letters finish instantly while wide ones never
 * finish at all. So every character is measured with `getExtentOfChar` and gets
 * its own dash length from its own box - which is also where its x position
 * comes from, so kerning and letter-spacing are the browser's problem, not a
 * table of magic numbers.
 */

export type StrokeTextTrigger = "mount" | "view" | "hover";
export type StrokeTextFillMode = "wipe" | "fade";

export interface StrokeTextProps {
  text: string;
  /** Any CSS colour. Defaults to the theme's ember accent. */
  strokeColor?: string;
  /** Any CSS colour. Defaults to the theme's warm cream. */
  fillColor?: string;
  strokeWidth?: number;
  /** Seconds for one character to draw. */
  drawDuration?: number;
  /** Seconds to wait after the last character lands before the fill starts. */
  fillDelay?: number;
  /** Seconds between characters. */
  stagger?: number;
  /** GSAP-style name (`power2.out`) or any raw CSS timing function. */
  ease?: string;
  trigger?: StrokeTextTrigger;
  fillMode?: StrokeTextFillMode;
  /** Drawn at this size, then scaled down to fit its container. */
  fontSize?: number;
  fontWeight?: number;
  letterSpacing?: number;
  /** Run the stagger from the last character back to the first. */
  reverse?: boolean;
  className?: string;
  /** Accessible name. Defaults to `text`. */
  label?: string;
}

interface CharMetric {
  char: string;
  x: number;
  /** Estimated outline length, used as this character's dash length. */
  dash: number;
}

interface Metrics {
  chars: CharMetric[];
  viewBox: string;
  width: number;
  height: number;
  baseline: number;
}

/**
 * Outline length from the character's box. A glyph's real perimeter is not
 * exposed by any DOM API for `<text>`, but it tracks its bounding box closely
 * enough that the draw lands within a frame or two either way.
 */
const OUTLINE_FACTOR = 1.25;

export const StrokeText: React.FC<StrokeTextProps> = ({
  text,
  strokeColor = "var(--color-ember-accent)",
  fillColor = "var(--color-warm-cream)",
  strokeWidth = 1.4,
  drawDuration = 1.6,
  fillDelay = 0.2,
  stagger = 0.05,
  ease = "power2.out",
  trigger = "mount",
  fillMode = "wipe",
  fontSize = 128,
  fontWeight = 800,
  letterSpacing = -4,
  reverse = false,
  className,
  label,
}) => {
  const measureRef = useRef<SVGTextElement>(null);
  const rootRef = useRef<SVGSVGElement>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [running, setRunning] = useState(trigger === "mount");

  // Stable across renders, so `measure` is not rebuilt on every one.
  const chars = useMemo(() => Array.from(text), [text]);

  /** Read every character's box straight off the laid-out text. */
  const measure = useCallback(() => {
    const node = measureRef.current;
    if (!node || !node.getNumberOfChars()) return;

    const next: CharMetric[] = [];
    for (let i = 0; i < chars.length; i += 1) {
      let x = 0;
      let dash = fontSize * 3;
      try {
        const box = node.getExtentOfChar(i);
        x = box.x;
        dash = Math.max(24, (box.width + box.height) * 2 * OUTLINE_FACTOR);
      } catch {
        // Whitespace and unmappable glyphs: nothing to draw, harmless.
      }
      next.push({ char: chars[i], x, dash });
    }

    const box = node.getBBox();
    // Room for the stroke, which straddles the outline.
    const pad = strokeWidth + 4;
    setMetrics({
      chars: next,
      viewBox: `${box.x - pad} ${box.y - pad} ${box.width + pad * 2} ${box.height + pad * 2}`,
      width: box.width + pad * 2,
      height: box.height + pad * 2,
      baseline: fontSize,
    });
  // fontWeight and letterSpacing are unused in the body but change the laid-out
  // box, so a change to either has to re-measure.
  }, [chars, fontSize, fontWeight, letterSpacing, strokeWidth]);

  useLayoutEffect(() => {
    measure();
    // Satoshi arrives over the network; measuring before it lands sizes the
    // box to the fallback face and the headline jumps when it swaps.
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });
    return () => {
      cancelled = true;
    };
  }, [measure]);

  // Start conditions other than mount.
  useEffect(() => {
    if (trigger !== "view") return;
    const node = rootRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRunning(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [trigger]);

  const lastIndex = Math.max(chars.length - 1, 0);
  const delayFor = (i: number) => (reverse ? lastIndex - i : i) * stagger;
  const drawTotal = drawDuration + lastIndex * stagger;

  const textAttrs = {
    x: 0,
    y: fontSize,
    fontSize,
    fontWeight,
    letterSpacing,
    // Inherits the brand family from the page rather than naming it here.
    fontFamily: "inherit",
  } as const;

  return (
    <svg
      ref={rootRef}
      className={`stroke-text${className ? ` ${className}` : ""}`}
      role="img"
      aria-label={label ?? text}
      data-run={running ? "true" : undefined}
      data-fill-mode={fillMode}
      data-reverse={reverse ? "true" : undefined}
      viewBox={metrics?.viewBox ?? `0 0 ${fontSize * chars.length} ${fontSize * 1.4}`}
      style={
        {
          "--st-stroke": strokeColor,
          "--st-fill": fillColor,
          "--st-stroke-width": strokeWidth,
          "--st-draw": `${drawDuration}s`,
          "--st-ease": toCssEase(ease),
          "--st-fill-delay": `${drawTotal + fillDelay}s`,
          "--st-fill-dur": `${Math.max(drawDuration * 0.7, 0.3)}s`,
          maxWidth: metrics ? `${metrics.width}px` : undefined,
        } as React.CSSProperties
      }
      onMouseEnter={trigger === "hover" ? () => setRunning(true) : undefined}
    >
      {/* Measured, never painted. Kept mounted so a font swap can re-measure. */}
      <text {...textAttrs} ref={measureRef} className="stroke-text__measure" aria-hidden="true">
        {text}
      </text>

      {metrics?.chars.map((c, i) =>
        c.char.trim() ? (
          <text
            key={`${c.char}-${i}`}
            {...textAttrs}
            x={c.x}
            className="stroke-text__char"
            style={
              {
                "--st-dash": c.dash,
                "--st-delay": `${delayFor(i)}s`,
              } as React.CSSProperties
            }
          >
            {c.char}
          </text>
        ) : null
      )}

      {metrics ? (
        <text {...textAttrs} className="stroke-text__fill">
          {text}
        </text>
      ) : null}
    </svg>
  );
};

export default StrokeText;
