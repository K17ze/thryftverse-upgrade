'use client';

/**
 * Co-Own onboarding gate — port of mobile CoOwnOnboardingScreen
 * (frontend/src/screens/SyndicateOnboardingScreen.tsx). A four-slide
 * explainer that covers the hub on first visit; Next/Skip dismiss and a
 * localStorage flag keeps it from returning.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { lockBodyScroll } from '@/lib/a11y/scrollLock';
import { restoreFocus } from '@/lib/a11y/focus';

// Distinct from TradePanel's 'thryftverse:coown-onboarded' — that key is
// the first-trade education consent, not this marketing tour. Sharing it
// would let a skipped carousel silently waive the trading gate.
const SEEN_KEY = 'thryftverse:coown-hub-tour';

const SLIDES: { icon: AppIconName; title: string; body: string }[] = [
  {
    icon: 'layers',
    title: 'Own a piece of something desirable',
    body: 'Co-Own lets you buy units of fashion, luxury, and collectable items. You own a real fraction of the item, not the item itself.',
  },
  {
    icon: 'cart',
    title: 'Buy units at your own pace',
    body: 'Browse available items, see the unit price, and buy as many units as you want. Settlement is in 1ZE — a 1% fee applies.',
  },
  {
    icon: 'repeat',
    title: 'Sell when you are ready',
    body: 'List your units for sale at market price or set a limit. Buyers must match your offer for the trade to fill. Liquidity is not guaranteed.',
  },
  {
    icon: 'shieldCheck',
    title: 'Trust and protection',
    body: 'Issuers are verified sellers. Authenticity, buyer protection, and storage information are shown on each item. Risks are clearly disclosed.',
  },
];

const CHECKLIST = [
  'How Co-Own fractional ownership works',
  'Buying and selling units at your pace',
  'Trust, protection, and risk disclosure',
];

export function CoOwnOnboardingGate() {
  // SSR/first-paint agree on "hidden" — the flag only exists on the client.
  const [mounted, setMounted] = useState(false);
  const [seen, setSeen] = useState(true);
  const [index, setIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    try {
      setSeen(window.localStorage.getItem(SEEN_KEY) === '1');
    } catch {
      setSeen(true);
    }
  }, []);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* private mode — treat as seen for this mount anyway */
    }
    setSeen(true);
  }, []);

  const visible = mounted && !seen;

  // Dialog semantics — Escape dismisses, focus is captured inside while
  // open (same trap grammar as the Sheet primitive), restored on close.
  useEffect(() => {
    if (!visible) return;
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    // Refcounted scroll lock — a sibling overlay (sheet, wall) closing
    // while the gate is open must not unlock the body under it.
    const unlock = lockBodyScroll();
    return () => {
      document.removeEventListener('keydown', onKey);
      unlock();
      restoreFocus(prev);
    };
  }, [visible, dismiss]);

  if (!visible) return null;

  const slide = SLIDES[index]!;
  const isLast = index === SLIDES.length - 1;

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-modal flex flex-col bg-background outline-none"
      role="dialog"
      aria-modal="true"
      aria-label="Co-Own introduction"
    >
      {/* Header — back/close, progress, skip */}
      <div className="mx-auto flex w-full max-w-xl items-center justify-between px-4 pt-4 sm:px-6">
        {index > 0 ? (
          <IconButton
            name="back"
            size={20}
            onClick={() => setIndex((i) => Math.max(i - 1, 0))}
            aria-label="Previous slide"
            className="-ml-2"
          />
        ) : (
          <IconButton
            name="close"
            size={20}
            onClick={dismiss}
            aria-label="Close introduction"
            className="-ml-2"
          />
        )}
        <span className="text-meta text-text-muted tnum">
          {index + 1} of {SLIDES.length}
        </span>
        <button
          type="button"
          onClick={dismiss}
          className="pressable -mr-2 inline-flex h-11 items-center px-2 text-body font-medium text-text-secondary hover:text-text-primary"
        >
          Skip
        </button>
      </div>

      {/* Hero slide */}
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6">
        <Icon name={slide.icon} size={64} className="text-brand" />

        {index === 0 ? (
          <span className="mt-4 rounded-full bg-brand-subtle px-2.5 py-1 text-micro font-semibold uppercase tracking-[0.08em] text-brand">
            Co-Own investing
          </span>
        ) : null}

        <h1 className="mt-5 text-center text-editorial-display text-text-primary">{slide.title}</h1>
        <p className="mt-3 max-w-md text-center text-body leading-relaxed text-text-secondary">
          {slide.body}
        </p>

        {index === 0 ? (
          <ul className="mt-7 w-full max-w-sm space-y-2.5 rounded-md border border-border-subtle p-4">
            <li className="text-meta font-semibold uppercase tracking-wide text-text-muted">
              What you&apos;ll learn
            </li>
            {CHECKLIST.map((item) => (
              <li key={item} className="flex items-center gap-2.5 text-meta text-text-secondary">
                <Icon name="check" size={14} className="shrink-0 text-brand" />
                {item}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Footer — dots + primary action */}
      <div className="mx-auto w-full max-w-xl px-6 pb-10">
        <div className="mb-6 flex items-center justify-center gap-2" aria-hidden="true">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-sm transition-all ${
                i === index ? 'w-6 bg-brand' : 'w-1.5 bg-surface-alt'
              }`}
            />
          ))}
        </div>
        <Button
          size="lg"
          fullWidth
          icon={isLast ? 'forward' : undefined}
          onClick={() => (isLast ? dismiss() : setIndex((i) => Math.min(i + 1, SLIDES.length - 1)))}
        >
          {isLast ? 'Enter Co-Own' : 'Next'}
        </Button>
      </div>
    </div>,
    document.body,
  );
}
