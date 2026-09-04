import React from "react";
import { motion } from "motion/react";
import { Logo } from "./Logo";
import StrokeText from "./StrokeText";
import GridScan from "./GridScan";

interface HeroProps {
  onStartUpload: () => void;
}

/* Height is the stylesheet's business: the hero fills the viewport but is never
   pinned to it, so a short screen grows the section instead of cutting the call
   to action off the bottom of it. */
export const Hero: React.FC<HeroProps> = ({ onStartUpload }) => {
  return (
    <section className="hero" aria-label="Meetwise AI">
      {/* Scanning grid - it replaces the hairline arc and stem that used to be
          drawn here, and is the hero's only background geometry now. Colours
          are the brand tokens, so it reads as the same cork hairline the rest
          of the page uses, lit by an ember sweep. A scrim above it keeps the
          emblem, wordmark and statement legible as the band passes. */}
      <div className="hero__scan" aria-hidden="true">
        <GridScan
          sensitivity={0.55}
          lineThickness={1}
          linesColor="#40372E"
          gridScale={0.1}
          scanColor="#DC5000"
          scanOpacity={0.4}
          enablePost
          bloomIntensity={0.6}
          chromaticAberration={0.002}
          noiseIntensity={0.01}
          lineJitter={0.1}
          scanGlow={0.5}
          scanSoftness={2}
          enableWebcam={false}
          showPreview={false}
        />
      </div>
      <div className="hero__scrim" aria-hidden="true" />

      {/* Emblem: the mark on its own, the drawn wordmark beneath it */}
      <motion.div
        className="hero__emblem"
        initial={false}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.2, 0.7, 0.3, 1] }}
      >
        <Logo className="hero__emblem-mark" />
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
