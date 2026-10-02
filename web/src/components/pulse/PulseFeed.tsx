'use client';

/**
 * PulseFeed — vertical short-form snap surface.
 * Mobile: full-bleed edge-to-edge cards. Desktop: a centred 430px column
 * with rounded cards, side prev/next affordances and arrow-key stepping.
 * Follow state is the persisted follows store — a creator followed here
 * stays followed across cards, surfaces and reloads (hydration-gated so
 * SSR and first client render agree). The SignupWall mounts once for
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
import { useHydrated } from '@/lib/store/useStore';
import { useFollows } from '@/lib/store/follows';

export function PulseFeed({ cards }: { cards: PulseCardModel[] }) {
  const router = useRouter();
  const { requireAuth, wall } = useSignupWall();
  const scrollRef = useRef<HTMLDivElement>(null);
  const hydrated = useHydrated();
  const followingIds = useFollows((s) => s.followingIds);
  const toggleFollowStore = useFollows((s) => s.toggleFollow);
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

  // Page-level keys: the feed owns the viewport, so arrows must work
  // without focusing the column first (TikTok/Shorts grammar). The
  // container's own onKeyDown still handles keys when focus is inside
  // the feed — this listener skips those events to avoid a double step,
  // and skips typing controls/overlays elsewhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Never hijack chords (Ctrl+PageDown switches browser tabs) or keys
      // an inner widget already handled.
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (target && scrollRef.current?.contains(target)) return;
      if (
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="listbox"], [role="menu"]',
        )
      ) {
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        step(-1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        scrollRef.current?.scrollTo({ top: 0 });
      } else if (e.key === 'End') {
        e.preventDefault();
        const el = scrollRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight });
      } else if (e.key === 'Escape' && scrollRef.current?.contains(document.activeElement)) {
        (document.activeElement as HTMLElement).blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      step(1);
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      step(-1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      scrollRef.current?.scrollTo({ top: 0 });
    } else if (e.key === 'End') {
      e.preventDefault();
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight });
    } else if (e.key === 'Escape') {
      // Release feed focus — arrows return to normal page scrolling.
      scrollRef.current?.blur();
    }
  };

  const toggleFollow = useCallback(
    (creatorId: string) => {
      if (!requireAuth('follow_seller')) return;
      toggleFollowStore(creatorId);
    },
    [requireAuth, toggleFollowStore],
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
              className={`h-full w-full max-w-[430px] transition-[opacity,transform] duration-500 ease-standard md:py-3 ${
                i === active ? '' : 'md:scale-[0.97] md:opacity-55'
              }`}
            >
              <PulseCard
                card={card}
                priority={i === 0}
                position={i + 1}
                total={cards.length + 1}
                active={i === active}
                followed={hydrated && followingIds.includes(card.creatorId)}
                onToggleFollow={toggleFollow}
                requireAuth={requireAuth}
              />
            </div>
          </div>
        ))}

        {/* End of feed — honest marker, no synthetic repeat cycles.
            Counted in the feed's set size so posinset reports are true. */}
        <div
          role="article"
          aria-posinset={cards.length + 1}
          aria-setsize={cards.length + 1}
          className="flex h-full snap-start items-center justify-center px-6"
        >
          <div className="flex w-full max-w-[340px] flex-col items-center rounded-xl bg-surface px-8 py-10 text-center">
            <Icon name="check" size={28} filled className="text-text-muted" />
            <h2 className="mt-3 text-section-title font-semibold text-text-primary">
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
            <button
              type="button"
              onClick={() => router.push('/live')}
              className="pressable mt-3 inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-caption font-medium text-text-muted transition-colors hover:text-text-primary"
            >
              <Icon name="videocam" size={14} />
              Live shows and schedule
            </button>
          </div>
        </div>
      </div>

      {/* Prev/next — desktop affordance docked to the card's right edge.
          Hit area ≠ visible shape: transparent 44px targets, 24px glyphs
          on the always-dark canvas (drop-scrim, no chrome circles). */}
      <div className="absolute top-1/2 hidden -translate-y-1/2 flex-col gap-1 md:flex left-[calc(50%+222px)]">
        <IconButton
          onMedia
          size={24}
          name="chevronUp"
          aria-label="Previous post"
          onClick={() => step(-1)}
          disabled={!edge.prev}
        />
        <IconButton
          onMedia
          size={24}
          name="chevronDown"
          aria-label="Next post"
          onClick={() => step(1)}
          disabled={!edge.next}
        />
      </div>

      {wall}
    </div>
  );
}
