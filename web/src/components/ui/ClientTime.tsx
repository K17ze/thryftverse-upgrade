'use client';

/**
 * ClientTime — timezone/clock-dependent time text without hydration drift.
 *
 * The server renders `fallback` (empty by default); the real label is
 * computed after mount, when the client's clock and timezone are real.
 * Relative labels ("2m ago") and local clock times ("14:32") can never
 * match between a server render and a later hydration — the render→hydrate
 * gap moves `Date.now()` and the machine TZ differs — so those strings are
 * client-computed by contract. `suppressHydrationWarning` covers callers
 * that pass a best-effort fallback computed on both sides.
 *
 * For absolute dates that must render during SSR, prefer the UTC-stable
 * formatters in lib/utils/format (timeAgo/formatDate pin timeZone: 'UTC').
 */

import { useEffect, useRef, useState } from 'react';

/** A formatter keyed on the ISO timestamp — module-level functions keep a
 *  stable identity so the compute effect re-runs only when `iso` changes. */
export type TimeFormatter = (iso: string) => string;

interface ClientTimeProps {
  iso: string;
  /** TZ/clock-dependent formatter — runs client-side only. */
  format: TimeFormatter;
  /** Server/first-paint string. '' renders nothing until mounted — the
   *  honest default for relative labels (no stale "now" frozen in HTML). */
  fallback?: string;
  className?: string;
  /** Absolute ISO for the native tooltip — the honest readable label. */
  title?: string;
}

export function ClientTime({
  iso,
  format,
  fallback = '',
  className,
  title,
}: ClientTimeProps) {
  const [label, setLabel] = useState(fallback);
  // Read through a ref so a formatter identity change (inline arrow) can't
  // re-run the effect — the label is a pure function of (iso, client now).
  const formatRef = useRef(format);
  formatRef.current = format;

  useEffect(() => {
    setLabel(formatRef.current(iso));
  }, [iso]);

  return (
    <span suppressHydrationWarning className={className} title={title}>
      {label}
    </span>
  );
}
