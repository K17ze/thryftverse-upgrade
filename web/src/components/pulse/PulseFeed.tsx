'use client';

/**
 * PulseFeed — vertical short-form snap surface.
 * Mobile: full-bleed edge-to-edge cards. Desktop: a centred 430px column
 * with rounded cards, side prev/next affordances and arrow-key stepping.
 * Follow state is lifted here so a creator followed on one card stays
 * followed on every card they appear in. The SignupWall mounts once for
 * the whole feed.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PulseCardModel } from './pulseModel';
import { PulseCard } from './PulseCard';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Button } from '@/components/ui/Button';
import { useSignupWall } from '@/components/auth/SignupWall';

export function PulseFeed({ cards }: { cards: PulseCardModel[] }) {
  const router = useRouter();
  const { requireAuth, wall } = useSignupWall();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [followedIds, setFollowedIds] = useState<Record<string, true>>({});
  const [edge, setEdge] = useState({ prev: false, next: true });
  const [active, setActive] = useState(0);

  const updateEdge = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setEdge({
      prev: el.scrollTop > 4,
      next: el.scrollTop + el.clientHeight < el.scrollHeight - 4,
    });
    // The centred card is whichever snap slot the viewport sits in — drives
    // the quiet dim/scale on the neighbours (desktop column only).
    const index = Math.round(el.scrollTop / Math.max(1, el.clientHeight));
    setActive((prev) => (prev === index ? prev : index));
  }, []);

  useEffect(() => {
    updateEdge();
  }, [updateEdge]);

  const step = useCallback((dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    // JS-driven scrolling ignores the global reduced-motion CSS override.
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ top: dir * el.clientHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      step(1);
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      step(-1);
    } else if (e.key === 'Escape') {
      // Release feed focus — arrows return to normal page scrolling.
      scrollRef.current?.blur();
    }
  };

  const toggleFollow = useCallback(
    (creatorId: string) => {
      if (!requireAuth('follow_seller')) return;
      setFollowedIds((f) => {
        const next = { ...f };
        if (next[creatorId]) delete next[creatorId];
        else next[creatorId] = true;
        return next;
      });
    },
    [requireAuth],
  );

  return (
    <div className="relative h-[calc(100dvh-4rem-76px)] bg-black md:h-[calc(100dvh-4rem)]">
      {/* Snap column */}
      <div
        ref={scrollRef}
        role="feed"
        aria-label="Pulse feed"
        tabIndex={0}
        onScroll={updateEdge}
        onKeyDown={onKeyDown}
        className="no-scrollbar h-full snap-y snap-mandatory overflow-y-auto overscroll-contain"
      >
        {cards.map((card, i) => (
          <div
            key={card.id}
            className="flex h-full snap-start snap-always items-center justify-center"
          >
            <div
              className={`h-full w-full max-w-[430px] transition-[opacity,transform] duration-500 ease-[var(--ease-standard)] md:py-3 ${
                i === active ? '' : 'md:scale-[0.97] md:opacity-55'
              }`}
            >
              <PulseCard
                card={card}
                priority={i === 0}
                followed={followedIds[card.creatorId] === true}
                onToggleFollow={toggleFollow}
                requireAuth={requireAuth}
              />
            </div>
          </div>
        ))}

        {/* End of feed — honest marker, no synthetic repeat cycles. */}
        <div className="flex h-full snap-start items-center justify-center px-6">
          <div className="flex w-full max-w-[340px] flex-col items-center rounded-2xl bg-surface px-8 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-alt text-text-muted">
              <Icon name="check" size={24} filled />
            </span>
            <h2 className="mt-4 text-section-title font-semibold text-text-primary">
              You&apos;re all caught up
            </h2>
            <p className="mt-1.5 text-body text-text-secondary">
              New drops and live auctions land throughout the day.
            </p>
            <Button
              variant="secondary"
              size="md"
              className="mt-6"
              onClick={() => router.push('/explore')}
            >
              Keep browsing
            </Button>
          </div>
        </div>
      </div>

      {/* Prev/next — desktop affordance beside the column */}
      <div className="absolute top-1/2 hidden -translate-y-1/2 flex-col gap-2 md:flex left-[calc(50%+234px)]">
        <IconButton
          contained
          name="chevronUp"
          aria-label="Previous post"
          onClick={() => step(-1)}
          disabled={!edge.prev}
          className="disabled:pointer-events-none disabled:opacity-40"
        />
        <IconButton
          contained
          name="chevronDown"
          aria-label="Next post"
          onClick={() => step(1)}
          disabled={!edge.next}
          className="disabled:pointer-events-none disabled:opacity-40"
        />
      </div>

      {wall}
    </div>
  );
}
