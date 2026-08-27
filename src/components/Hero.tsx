import React from "react";
import { motion } from "motion/react";
import { Logo } from "./Logo";

interface HeroProps {
  onStartCapture: () => void;
}

/**
 * The wordmark band scrolls sideways forever. The track holds two identical
 * groups and travels exactly -50%, so the second group lands where the first
 * started and the loop has no visible seam.
 */
const MARQUEE_REPEAT = 4;

const MarqueeGroup: React.FC = () => (
  <div className="hero__marquee-group">
    {Array.from({ length: MARQUEE_REPEAT }, (_, i) => (
      <span className="hero__marquee-item" key={i}>
        MEETWISE<span className="wordmark-ai">AI</span>
        <span className="hero__marquee-dot">·</span>
      </span>
    ))}
  </div>
);

export const Hero: React.FC<HeroProps> = ({ onStartCapture }) => {
  return (
    <section className="hero" aria-labelledby="hero-emblem">
      {/* Hairline Geometry Layer */}
      <div className="hero__geometry" aria-hidden="true">
        <svg className="hero__geometry-svg" viewBox="0 0 1440 900" preserveAspectRatio="none">
          <circle className="hero__geometry-arc" cx="50%" cy="118%" r="72%" />
          {/* Stops above the emblem rather than running through it */}
          <line className="hero__geometry-line" x1="50%" y1="0%" x2="50%" y2="22%" />
        </svg>
      </div>

      {/* Emblem: the mark on its own, wordmark running beneath it */}
      <motion.div
        className="hero__emblem"
        id="hero-emblem"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.2, 0.7, 0.3, 1] }}
      >
        <Logo className="hero__emblem-mark" />

        {/* Carries the accessible name; the mark and the band are decorative. */}
        <span className="sr-only">Meetwise AI</span>
      </motion.div>

      {/* Wordmark band, travelling right to left */}
      <div className="hero__marquee" aria-hidden="true">
        <div className="hero__marquee-track">
          <MarqueeGroup />
          <MarqueeGroup />
        </div>
      </div>

      {/* Statement Block */}
      <div className="hero__statement">
        <p className="hero__statement-label">NOW IN PRIVATE BETA</p>
        <p className="hero__statement-text">
          You sit in four meetings a day and remember almost none of it. Meetwise AI keeps the
          decisions, the owners, and who said what — and answers when you ask.
        </p>

        {/* Primary call to action */}
        <motion.button
          type="button"
          className="hero__cta"
          onClick={onStartCapture}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
        >
          START CAPTURING
        </motion.button>
      </div>
    </section>
  );
};
