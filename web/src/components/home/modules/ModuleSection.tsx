'use client';

/**
 * ModuleSection — shared chrome for home-feed module bands.
 * Flat canvas grammar: hairline top separator, section title left,
 * optional quiet right-aligned link. No card wrappers, no decoration.
 *
 * Module fatigue (Pinterest Module Relevance parity): a band that passes
 * `moduleId` gains a quiet dismiss affordance and self-suppresses when
 * the user either dismissed it or scrolled it into view repeatedly
 * without ever engaging — the counts live in useFeedPrefs, persisted on
 * this device. An impression only registers once the band intersects the
 * viewport; suppression is hydration-gated so SSR never collapses a band
 * the client is about to hide.
 */

import Link from 'next/link';
import { useCallback, useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useHydrated } from '@/lib/store/useStore';
import { moduleSuppressed, useFeedPrefs } from '@/lib/feedPrefs';

interface ModuleFatigue {
  /** Attach to the module's root element — counts the in-view impression. */
  sectionRef: (el: HTMLElement | null) => void;
  /** True once hydrated AND dismissed/fatigued — render nothing. */
  suppressed: boolean;
  /** Explicit dismiss — writes the pref and offers Undo via toast. */
  dismiss: (label: string) => void;
  /** Real engagement with module content — keeps the band alive. */
  noteEngagement: () => void;
}

/**
 * The shared module-fatigue channel. `undefined` opts the band out
 * entirely (shared chrome consumers outside the home feed unchanged).
 */
export function useModuleFatigue(moduleId: string | undefined): ModuleFatigue {
  const { show } = useToast();
  const hydrated = useHydrated();
  const dismissedModuleIds = useFeedPrefs((s) => s.dismissedModuleIds);
  const moduleImpressions = useFeedPrefs((s) => s.moduleImpressions);
  const moduleEngagements = useFeedPrefs((s) => s.moduleEngagements);
  const dismissModule = useFeedPrefs((s) => s.dismissModule);
  const undismissModule = useFeedPrefs((s) => s.undismissModule);
  const noteModuleImpression = useFeedPrefs((s) => s.noteModuleImpression);
  const noteModuleEngagement = useFeedPrefs((s) => s.noteModuleEngagement);

  const suppressed =
    moduleId != null &&
    hydrated &&
    moduleSuppressed(
      { dismissedModuleIds, moduleImpressions, moduleEngagements },
      moduleId,
    );

  // The impression fires once per mount, and only when the band actually
  // reaches the viewport — a module the user never scrolled to is not a
  // view. No observer (very old engine) counts on mount as the fallback.
  const counted = useRef(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const sectionRef = useCallback(
    (el: HTMLElement | null) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!el || moduleId == null || counted.current) return;
      const count = () => {
        if (counted.current) return;
        counted.current = true;
        noteModuleImpression(moduleId);
      };
      if (typeof IntersectionObserver === 'undefined') {
        count();
        return;
      }
      observer.current = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          count();
          observer.current?.disconnect();
          observer.current = null;
        }
      });
      observer.current.observe(el);
    },
    [moduleId, noteModuleImpression],
  );

  const dismiss = useCallback(
    (label: string) => {
      if (moduleId == null) return;
      dismissModule(moduleId);
      show(`Hidden \u2014 ${label} won\u2019t show again`, 'info', {
        label: 'Undo',
        onPress: () => undismissModule(moduleId),
      });
    },
    [moduleId, dismissModule, undismissModule, show],
  );

  const noteEngagement = useCallback(() => {
    if (moduleId != null) noteModuleEngagement(moduleId);
  }, [moduleId, noteModuleEngagement]);

  return { sectionRef, suppressed, dismiss, noteEngagement };
}

interface ModuleSectionProps {
  title: string;
  href?: string;
  linkLabel?: string;
  /** Quiet text-button affordance (e.g. "Clear") — used when there's no
   *  destination to link to. Same chrome weight as the link variant. */
  action?: { label: string; onClick: () => void };
  /** Hairline separator above the band — off for the first module. */
  bordered?: boolean;
  /** Stable feed-module id — opts the band into dismiss + fatigue. */
  moduleId?: string;
  children: React.ReactNode;
}

export function ModuleSection({
  title,
  href,
  linkLabel = 'See all',
  action,
  bordered = true,
  moduleId,
  children,
}: ModuleSectionProps) {
  const fatigue = useModuleFatigue(moduleId);

  if (fatigue.suppressed) return null;

  return (
    <section
      ref={fatigue.sectionRef}
      aria-label={title}
      className={`${bordered ? 'border-t border-border-subtle' : ''} py-5 sm:py-6`}
      onClickCapture={(e) => {
        // Content engagement keeps the band alive — any real activation
        // (link, button) counts. The dismiss control itself is excluded;
        // hiding a band is not engagement with it.
        const target = e.target as HTMLElement;
        if (target.closest('[data-module-dismiss]')) return;
        if (target.closest('a[href],button')) fatigue.noteEngagement();
      }}
    >
      <header className="mb-3 flex items-baseline justify-between gap-4 px-4 sm:px-6">
        <h2 className="text-section-title font-semibold text-text-primary">{title}</h2>
        <div className="flex shrink-0 items-center gap-0.5">
          {href ? (
            <Link
              href={href}
              className="pressable flex shrink-0 items-center gap-0.5 text-body font-medium text-text-secondary hover:text-text-primary"
            >
              {linkLabel}
              <Icon name="forward" size={14} />
            </Link>
          ) : action ? (
            <button
              type="button"
              onClick={action.onClick}
              className="pressable shrink-0 text-body font-medium text-text-secondary hover:text-text-primary"
            >
              {action.label}
            </button>
          ) : null}
          {moduleId ? (
            // Dismiss — transparent 44px target, 15px glyph, no chrome.
            // -my-2 keeps the baseline row at text height; -mr-2 aligns
            // the glyph edge with the content gutter.
            <button
              type="button"
              data-module-dismiss
              onClick={() => fatigue.dismiss(title)}
              aria-label={`Hide ${title}`}
              className="pressable -my-2 -mr-2 flex h-11 w-11 items-center justify-center rounded-full text-text-muted hover:text-text-primary"
            >
              <Icon name="close" size={15} />
            </button>
          ) : null}
        </div>
      </header>
      {children}
    </section>
  );
}
