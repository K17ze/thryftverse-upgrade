'use client';

/**
 * RotatingSearchHint — the idle-placeholder rotation (Etsy/Depop pattern).
 *
 * When a search field sits empty and unfocused, a `pointer-events-none`
 * overlay inside the field's `relative` label cycles through suggestions
 * on a ~4s beat: the member's recent searches, then their saved searches,
 * then department names from the shared browse vocabulary — the canonical
 * translated placeholder always trails the pool.
 *
 * The overlay is visual-only. The input keeps its stable `aria-label`
 * (screen readers get the canonical name, never the rotating text), and
 * the caller blanks the input's `placeholder` attr while the overlay is
 * active so the two never double-render.
 *
 * Off conditions — hydrated=false (persisted stores rehydrate post-paint;
 * the base placeholder renders until then so SSR and the first client
 * render agree), prefers-reduced-motion or the `reduce-motion` a11y pref
 * (useReducedMotion covers both), focused, non-empty, or the suggestion
 * layer open. Rotation pauses while the tab is hidden or the window is
 * blurred.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRecentSearches } from './searchHistory';
import { useCategoryDirectory } from './useCategoryDirectory';
import { useSavedSearches } from '@/lib/store/savedSearches';
import { useHydrated } from '@/lib/store/useStore';
import { useReducedMotion } from '@/lib/motion/useReducedMotion';

/** One beat — the hint swaps every 4s while the field sits idle. */
const ROTATE_MS = 4000;
/** Pool cap — personal terms first, then departments, placeholder last. */
const MAX_HINTS = 6;

export interface RotatingSearchHintState {
  /** True while the overlay owns the idle-empty state — the caller must
   *  render `<RotatingSearchHint>` and pass `placeholder=""` on the input. */
  active: boolean;
  /** The hint currently on show (the base placeholder until hydrated). */
  text: string;
}

/**
 * Personalized hint pool — recent searches → saved search terms →
 * department names → the base placeholder. Deduped case-insensitively,
 * capped at MAX_HINTS. Persisted sources are gated behind hydration so
 * the SSR render and the first client render agree on `[base]`; the pool
 * recomputes reactively as the stores settle.
 */
function useSearchHintPool(base: string): string[] {
  const hydrated = useHydrated();
  const { recent } = useRecentSearches();
  const savedSearches = useSavedSearches((s) => s.searches);
  const { categories } = useCategoryDirectory();

  return useMemo(() => {
    const pool: string[] = [];
    const seen = new Set<string>();
    const baseKey = base.trim().toLowerCase();
    const push = (raw: string | undefined) => {
      const value = raw?.trim() ?? '';
      if (!value) return;
      const key = value.toLowerCase();
      if (seen.has(key) || key === baseKey) return;
      seen.add(key);
      pool.push(value);
    };
    if (hydrated) {
      for (const term of recent) push(term);
      // Pure-filter saves carry no query — push() drops the empty string.
      for (const s of savedSearches) push(s.query);
      for (const c of categories) push(c.name);
    }
    // The canonical placeholder always trails the pool — reserve its slot
    // before the cap so a full personal pool can't squeeze it out.
    return [...pool.slice(0, MAX_HINTS - 1), base];
  }, [hydrated, recent, savedSearches, categories, base]);
}

/**
 * Drives one idle search field. `idle` = the field is empty, unfocused
 * and its suggestion layer is closed — the hook owns hydration and the
 * reduced-motion gate on top of that.
 */
export function useRotatingSearchHint({
  base,
  idle,
  containerRef,
}: {
  /** Canonical placeholder — the input's aria-label and the pool's last hint. */
  base: string;
  /** Field is empty, unfocused and its suggestion layer is closed. */
  idle: boolean;
  /** Wrapper element whose layout visibility gates the overlay — a field
   *  inside `md:hidden`-style chrome reports a zero box and stays inert. */
  containerRef?: React.RefObject<HTMLElement | null>;
}): RotatingSearchHintState {
  const hydrated = useHydrated();
  const reduced = useReducedMotion();
  const hints = useSearchHintPool(base);
  const [index, setIndex] = useState(0);
  // Unproven until measured when a container gate is supplied — a field
  // mounted later (or inside display:none chrome) must stay inert.
  const [visible, setVisible] = useState(!containerRef);

  useEffect(() => {
    if (!containerRef) return;
    let ro: ResizeObserver | null = null;
    const measure = () => {
      const el = containerRef.current;
      setVisible(!!el && el.offsetWidth > 0 && el.offsetHeight > 0);
    };
    const attach = () => {
      const el = containerRef.current;
      if (!el) return false;
      measure();
      ro = new ResizeObserver(measure);
      ro.observe(el);
      return true;
    };
    // The element mounts with this render — if it isn't committed yet
    // (or renders conditionally later), retry once after paint.
    if (!attach()) {
      setVisible(false);
      const raf = requestAnimationFrame(attach);
      return () => {
        cancelAnimationFrame(raf);
        ro?.disconnect();
      };
    }
    return () => ro?.disconnect();
  }, [containerRef]);

  const active = hydrated && !reduced && idle && visible;

  useEffect(() => {
    if (!active || hints.length < 2) return;
    const t = window.setInterval(() => {
      // Offscreen beats are skipped — hidden tab or blurred window.
      if (document.hidden || !document.hasFocus()) return;
      setIndex((i) => (i + 1) % hints.length);
    }, ROTATE_MS);
    return () => window.clearInterval(t);
  }, [active, hints.length]);

  return { active, text: hints[index % hints.length] ?? base };
}

/**
 * The overlay itself — absolutely positioned inside the field's `relative`
 * label; the caller aligns it to the input's text start via `className`
 * (e.g. `left-10 right-12` for a `pl-10` field with a trailing affordance).
 * Type role and colour inherit from the container classes so the hint
 * matches the input's own placeholder grammar. `hint-in`/`hint-out` are
 * the globals.css pair — 8px rise on entry, 8px drift on exit — and the
 * global prefers-reduced-motion squash covers them as a backstop to the
 * JS gate (the overlay never mounts when motion is reduced).
 */
export function RotatingSearchHint({
  text,
  className = '',
}: {
  text: string;
  className?: string;
}) {
  const [exiting, setExiting] = useState<string | null>(null);
  const prev = useRef(text);

  // The outgoing hint stays mounted for its exit animation (opacity-0
  // under the `both` fill afterwards) — replaced on the next beat.
  useEffect(() => {
    if (prev.current === text) return;
    setExiting(prev.current);
    prev.current = text;
  }, [text]);

  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 overflow-hidden ${className}`}
    >
      {exiting !== null && exiting !== text ? (
        <span
          key={`out-${exiting}`}
          className="hint-out absolute inset-0 flex items-center truncate"
        >
          {exiting}
        </span>
      ) : null}
      <span
        key={text}
        className="hint-in absolute inset-0 flex items-center truncate"
      >
        {text}
      </span>
    </span>
  );
}
