import React from "react";
import { motion } from "motion/react";
import StrokeText from "./StrokeText";

interface HeroProps {
  onStartUpload: () => void;
}

/* Height is the stylesheet's business: the hero fills the viewport but is never
   pinned to it, so a short screen grows the section instead of cutting the call
   to action off the bottom of it. */
export const Hero: React.FC<HeroProps> = ({ onStartUpload }) => {
  return (
    <section className="hero" aria-label="Meetwise AI">
      {/* Emblem: the mark on its own, the drawn wordmark beneath it */}
      <motion.div
        className="hero__emblem"
        initial={false}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.2, 0.7, 0.3, 1] }}
      >

      </motion.div>

      {/* Wordmark: draws itself in ember, then fills with cream. It carries the
          section's accessible name; the mark above it is decorative. */}
      <div className="hero__wordmark">
        <StrokeText
          text="MeetWiseAI"
          strokeColor="var(--color-ember-accent)"
          fillColor="var(--color-warm-cream)"
          strokeWidth={1.4}
          drawDuration={1.6}
          fillDelay={0.2}
          stagger={0.05}
          ease="power2.out"
          trigger="mount"
          fillMode="wipe"
          fontSize={128}
          fontWeight={800}
          letterSpacing={-4}
          reverse={false}
          label="Meetwise AI"
        />
      </div>

      {/* Statement Block */}
      <div className="hero__statement">
        <p className="hero__statement-label">NOW IN PRIVATE BETA</p>
        <p className="hero__statement-text">
          Meetwise AI captures key decisions, assigns owners, and keeps your meeting context easy
          to find—so you can spend less time searching and more time moving work forward.
        </p>

        {/* Primary call to action */}
        <motion.button
          type="button"
          className="hero__cta"
          onClick={onStartUpload}
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
