'use client';

/**
 * Rail — shared horizontal snap-scroll shelf for home module bands.
 * Edge fades are the scroll affordance: the trailing edge stays faded
 * while content is clipped, the leading edge fades in once scrolled.
 * No fade renders when the rail fits — honest affordance, no chrome.
 */

import { useEffect, useRef, useState } from 'react';

interface RailProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

const FADE = 44; // px of edge fade — enough to read as "more this way"

export function Rail({ label, children, className = '' }: RailProps) {
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
      aria-label={label}
      className={`no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 sm:px-6 ${className}`}
      style={mask ? { WebkitMaskImage: mask, maskImage: mask } : undefined}
    >
      {children}
    </div>
  );
}
