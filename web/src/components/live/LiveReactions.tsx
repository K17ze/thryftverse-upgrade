'use client';

/**
 * LiveReactions — the heart control in the viewer's action column. Taps
 * emit a single floating glyph (CSS keyframes only, seeded lateral drift);
 * a light ambient trickle on live sessions conveys crowd presence. Glyphs
 * cap at 8 and remove themselves on animation end — no layout work, no
 * timers beyond the ambient tick. Reduced-motion disables the float.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { LiveSession } from '@/lib/data/fixtures-media';
import { Icon } from '@/components/ui/Icon';
import { seededRandom } from './useLivePresence';
import { formatCount } from '@/lib/utils/format';

interface FloatHeart {
  id: number;
  dx: number;
  sc: number;
}

const MAX_GLYPHS = 8;
const AMBIENT_MS = 6_800;

const REACTION_STYLES = `
.live-heart-float {
  transform-origin: center;
  animation: live-heart-float 1500ms var(--ease-standard, ease-out) forwards;
  will-change: transform, opacity;
}
@keyframes live-heart-float {
  0% { transform: translate(0, 6px) scale(0.55); opacity: 0; }
  18% { opacity: 0.95; }
  100% { transform: translate(var(--dx, 0px), -150px) scale(var(--sc, 1)); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .live-heart-float { animation: none; opacity: 0; }
}
`;

export function LiveReactions({ session }: { session: LiveSession }) {
  const live = session.status === 'live';
  const [hearts, setHearts] = useState<FloatHeart[]>([]);
  const [sent, setSent] = useState(0);
  const seq = useRef(0);
  const rand = useRef(seededRandom(`${session.id}:fx`));

  useEffect(() => {
    rand.current = seededRandom(`${session.id}:fx`);
    seq.current = 0;
    setHearts([]);
    setSent(0);
  }, [session.id]);

  const spawn = useCallback((mine: boolean) => {
    const r = rand.current;
    const heart: FloatHeart = {
      id: ++seq.current,
      dx: (r() * 2 - 1) * 26,
      sc: 0.8 + r() * 0.45,
    };
    setHearts((hs) => [...hs.slice(-(MAX_GLYPHS - 1)), heart]);
    if (mine) setSent((c) => c + 1);
  }, []);

  // Ambient trickle — presence from the crowd, live sessions only.
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => spawn(false), AMBIENT_MS);
    return () => window.clearInterval(id);
  }, [live, spawn]);

  const remove = useCallback((id: number) => {
    setHearts((hs) => hs.filter((h) => h.id !== id));
  }, []);

  return (
    <div className="relative flex flex-col items-center">
      <style>{REACTION_STYLES}</style>
      <div aria-hidden className="pointer-events-none absolute bottom-full left-1/2">
        {hearts.map((h) => (
          <span
            key={h.id}
            onAnimationEnd={() => remove(h.id)}
            className="live-heart-float absolute bottom-1 -translate-x-1/2 text-danger-text"
            style={{ '--dx': `${h.dx}px`, '--sc': h.sc } as CSSProperties}
          >
            <Icon name="heart" filled size={20} />
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={() => spawn(true)}
        aria-label="Send a heart"
        className="pressable inline-flex h-11 w-11 items-center justify-center rounded-full text-scrim-text-primary drop-scrim hover:bg-white/10"
      >
        <Icon name="heart" size={24} />
      </button>
      {sent > 0 ? (
        <span className="tnum mt-0.5 text-meta font-semibold text-scrim-text-secondary">
          {formatCount(sent)}
        </span>
      ) : null}
    </div>
  );
}
