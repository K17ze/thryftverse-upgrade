'use client';

/**
 * PdpRailScroller — horizontal scroll container for the PDP's tile rails
 * (seller closet, similar items, recently viewed). The scroll affordance
 * is the same edge-fade grammar the home Rail uses: the trailing edge
 * stays masked while content is clipped, the leading edge fades in once
 * scrolled, and no mask renders when the rail fits — honest affordance,
 * no chrome. Unlike the home shelf these tiles free-scroll: no snap, no
 * arrow buttons — the PDP's existing rail grammar stays the pattern.
 */

import { useEffect, useRef, useState } from 'react';

interface PdpRailScrollerProps {
  children: React.ReactNode;
  className?: string;
}

const FADE = 44; // px of edge fade — enough to read as "more this way"

export function PdpRailScroller({ children, className = '' }: PdpRailScrollerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setEdges({
        left: el.scrollLeft > 8,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 8,
      });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);

  const mask =
    edges.left && edges.right
      ? `linear-gradient(to right, transparent 0, black ${FADE}px, black calc(100% - ${FADE}px), transparent 100%)`
      : edges.right
        ? `linear-gradient(to right, black 0, black calc(100% - ${FADE}px), transparent 100%)`
        : edges.left
          ? `linear-gradient(to right, transparent 0, black ${FADE}px, black 100%)`
          : undefined;

  return (
    <div
      ref={ref}
      role="list"
      className={`no-scrollbar flex gap-2 overflow-x-auto px-4 sm:px-6 ${className}`}
      style={mask ? { WebkitMaskImage: mask, maskImage: mask } : undefined}
    >
      {children}
    </div>
  );
}
