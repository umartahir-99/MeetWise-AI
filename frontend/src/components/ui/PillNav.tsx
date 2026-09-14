import React, { useCallback, useEffect, useId, useState } from "react";
import { toCssEase } from "@/lib/easing";

/**
 * Pill navigation.
 *
 * Each item is a rounded pill; hovering one grows a circle of `baseColor` up
 * from its floor while the label slides out and its hovered twin slides in.
 * Both halves ride the same easing curve, so the fill and the swap read as one
 * motion rather than two that happen to overlap.
 *
 * No animation library: this is transforms and a `transition`, which is all a
 * hover state should ever cost. The `ease` prop speaks GSAP's vocabulary
 * because that is the API this component publishes, and `src/easing.ts`
 * translates it - GSAP itself is not a dependency here.
 *
 * Colours arrive as props and leave as CSS custom properties, so a caller can
 * pass a theme token (`var(--color-ember-accent)`) as happily as a hex.
 */

export interface PillNavItem {
  label: string;
  /** In-page target, e.g. `#meetings`. */
  href: string;
}

export interface PillNavProps {
  /** Image src. When it is absent or fails, the wordmark carries the brand. */
  logo?: string;
  logoAlt?: string;
  items: PillNavItem[];
  /** The `href` of the item to show as current. */
  activeHref?: string;
  className?: string;
  /** GSAP-style name (`power2.easeOut`) or any raw CSS timing function. */
  ease?: string;
  /** Fills a pill on hover, and backs the active one. */
  baseColor?: string;
  /** A pill at rest. */
  pillColor?: string;
  hoveredPillTextColor?: string;
  pillTextColor?: string;
  /** Which ground the bar paints itself on. */
  theme?: "light" | "dark";
  /** Animate the bar in on mount. */
  initialLoadAnimation?: boolean;
  /**
   * Intercepts a pill activation. This app navigates by state rather than by
   * document, so the caller cancels the jump and moves the page itself.
   */
  onItemClick?: (item: PillNavItem, event: React.MouseEvent) => void;
  /** Optional action pill, held to the right of the items. */
  action?: { label: string; onClick: () => void };
  /**
   * Who is signed in, and how to leave.
   *
   * It sits in the bar rather than inside a settings page because signing out
   * is not a setting — it is a thing you do, and a thing you should be able to
   * find without hunting. Naming the account next to it also answers "whose
   * archive am I looking at?", which matters the moment a person has two.
   */
  account?: { name: string; email: string; onSignOut: () => void };
}

/** Above this the pills sit in a row; below it they collapse into the panel. */
const MENU_BREAKPOINT = 1199;

/**
 * The label and its hovered twin, stacked in one clipped box so one can leave
 * as the other arrives. The twin is hidden from assistive tech - the same word
 * announced twice is noise.
 */
const PillLabel: React.FC<{ label: string }> = ({ label }) => (
  <span className="pill-nav__label-stack">
    <span className="pill-nav__label">{label}</span>
    <span className="pill-nav__label pill-nav__label--hover" aria-hidden="true">
      {label}
    </span>
  </span>
);

export const PillNav: React.FC<PillNavProps> = ({
  logo,
  logoAlt = "",
  items,
  activeHref,
  className,
  ease = "power2.easeOut",
  baseColor = "var(--color-ember-accent)",
  pillColor = "var(--color-warm-cream)",
  hoveredPillTextColor = "var(--color-warm-cream)",
  pillTextColor = "var(--color-walnut-shadow)",
  theme = "dark",
  initialLoadAnimation = false,
  onItemClick,
  action,
  account,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const panelId = useId();

  // The bar rides bare over the top of the page and fades in its own ground
  // only once content is passing under it - which is the moment the blur and
  // the hairline start doing work rather than decorating.
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      setScrolled(window.scrollY > 8);
    };
    const onScroll = () => {
      // Coalesce a burst of scroll events into one read per frame.
      if (!frame) frame = requestAnimationFrame(read);
    };

    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const activate = useCallback(
    (item: PillNavItem, event: React.MouseEvent) => {
      setMenuOpen(false);
      if (!onItemClick) return;
      // The caller owns navigation; let it move without a document jump.
      event.preventDefault();
      onItemClick(item, event);
    },
    [onItemClick]
  );

  // Escape closes the panel, and so does growing past the breakpoint: up there
  // the panel is display:none, so leaving it "open" would strand the toggle in
  // an expanded state it has no way to show.
  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const wide = window.matchMedia(`(min-width: ${MENU_BREAKPOINT + 1}px)`);
    const onWide = () => {
      if (wide.matches) setMenuOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    wide.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      wide.removeEventListener("change", onWide);
    };
  }, [menuOpen]);

  // The row and the panel show the same pills, so they are built the same way.
  const pills = items.map((item) => {
    const current = item.href === activeHref;
    return (
      <li key={item.href}>
        <a
          className="pill-nav__pill"
          href={item.href}
          data-active={current ? "true" : undefined}
          aria-current={current ? "page" : undefined}
          onClick={(e) => activate(item, e)}
        >
          <span className="pill-nav__circle" aria-hidden="true" />
          <PillLabel label={item.label} />
        </a>
      </li>
    );
  });

  const actionPill = action ? (
    <button type="button" className="pill-nav__action" onClick={action.onClick}>
      <span className="pill-nav__circle" aria-hidden="true" />
      <PillLabel label={action.label} />
    </button>
  ) : null;

  /**
   * The account cluster: who you are, and the way out.
   *
   * Deliberately quieter than the action pill beside it — driftwood on the bare
   * bar, no fill. Uploading is what you came to do; signing out is what you do
   * once. It stays legible rather than hiding behind a menu, because a control
   * nobody can find is the same as one that is not there.
   *
   * The name is the display name, falling back to the part of the address
   * before the @ — an account that has never been renamed still reads as
   * somebody rather than as a blank.
   */
  const accountCluster = account ? (
    <div className="pill-nav__account">
      <span className="pill-nav__account-name" title={account.email}>
        {account.name || account.email.split("@")[0]}
      </span>
      <button type="button" className="pill-nav__signout" onClick={account.onSignOut}>
        Sign out
      </button>
    </div>
  ) : null;

  return (
    <header
      className={`pill-nav${className ? ` ${className}` : ""}`}
      data-theme={theme}
      data-animate={initialLoadAnimation ? "true" : undefined}
      data-open={menuOpen ? "true" : undefined}
      data-scrolled={scrolled ? "true" : undefined}
      style={
        {
          "--pn-base": baseColor,
          "--pn-pill": pillColor,
          "--pn-pill-text": pillTextColor,
          "--pn-pill-text-hover": hoveredPillTextColor,
          "--pn-ease": toCssEase(ease),
        } as React.CSSProperties
      }
    >
      <nav className="pill-nav__bar" aria-label="Main navigation">
        <a
          className="pill-nav__brand"
          href={items[0]?.href ?? "#"}
          aria-label="MeetWise AI"
          onClick={(e) => items[0] && activate(items[0], e)}
        >
          {logo && !logoFailed ? (
            <span className="pill-nav__logo">
              <img src={logo} alt={logoAlt} onError={() => setLogoFailed(true)} />
            </span>
          ) : null}
          {/* Carries the name whether or not the mark loaded. */}
          <span className="pill-nav__wordmark font-bold ">
            MeetWise<span className="wordmark-ai">AI</span>
          </span>
        </a>

        <ul className="pill-nav__list">{pills}</ul>
        {actionPill}
        {accountCluster}

        <button
          type="button"
          className="pill-nav__burger"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls={panelId}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
      </nav>

      {/* Stacked pills for the widths the row cannot hold. The action comes
          along only on the narrowest ones, where the bar has dropped it. */}
      <div className="pill-nav__panel" id={panelId} hidden={!menuOpen}>
        <ul>{pills}</ul>
        {actionPill}
        {accountCluster}
      </div>
    </header>
  );
};

export default PillNav;
