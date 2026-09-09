import React, { useState } from "react";

/**
 * Brand mark.
 *
 * The artwork is served from public/ rather than imported, so it can be
 * dropped in or swapped without touching code. Until the file exists the
 * component renders nothing, so a missing asset never shows a broken image.
 *
 * Save the logo as: public/logo.svg
 */
const LOGO_SRC = "/logo.svg";

interface LogoProps {
  /** Rendered square size in px. */
  size?: number;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = 28, className }) => {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <img
      src={LOGO_SRC}
      // Decorative: the wordmark beside it already carries the name.
      alt=""
      width={size}
      height={size}
      className={className}
      onError={() => setFailed(true)}
    />
  );
};
