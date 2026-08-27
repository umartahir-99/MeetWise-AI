import React from "react";
import { motion } from "motion/react";
import { Logo } from "./Logo";

interface TopNavProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
  onStartCapture: () => void;
}

const NAV_ITEMS = [
  { id: "home", label: "HOME" },
  { id: "meetings", label: "MEETINGS" },
  { id: "ask", label: "ASK" },
  { id: "settings", label: "SETTINGS" },
];

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  onNavigate,
  onStartCapture,
}) => (
  <nav
    className="hero__nav hero__nav--sticky"
    role="navigation"
    aria-label="Main navigation"
  >
    {/* Wordmark (left) */}
    <button
      className="hero__nav-wordmark"
      onClick={() => onNavigate("home")}
      aria-label="Meetwise AI home"
      type="button"
    >
      <Logo size={26} className="hero__nav-logo" />
      <span>
        MEETWISE<span className="wordmark-ai">AI</span>
      </span>
    </button>

    {/* Items + CTA share one right-hand cluster so they stay grouped */}
    <div className="hero__nav-right">
      <div className="hero__nav-items">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className="hero__nav-item"
            data-active={activeTab === item.id ? "true" : undefined}
            aria-current={activeTab === item.id ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="hero__nav-cta">
        <motion.button
          className="hero__nav-cta-button"
          onClick={onStartCapture}
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.96 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
        >
          START CAPTURING
        </motion.button>
      </div>
    </div>
  </nav>
);
