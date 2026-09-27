'use client';

/**
 * StateGate — the canonical loading / empty / error / offline wiring for
 * web surfaces. Port of mobile FlagshipState's contract, adapted to the
 * react-query-shaped props web screens already produce.
 *
 *   <StateGate
 *     domain="orders"
 *     isLoading={query.isLoading}
 *     isError={query.isError}
 *     isEmpty={!orders?.length}
 *     skeleton={<OrdersSkeleton />}
 *     onRetry={() => query.refetch()}
 *   >{content}</StateGate>
 *
 * Resolution order:
 *   loading → `skeleton` (or generic skeleton rows — never a spinner)
 *   error + offline → offline copy (the honest reason it failed)
 *   error → error copy + retry affordance (stateCopy.actions.tryAgain)
 *   empty → empty copy (+ optional action); `filtered` picks emptyFiltered
 *   ready → children, plus a quiet stale pill when `stale` is set
 *
 * Copy comes from the state-copy registry — no screen should hand-write
 * "Something went wrong". Surfaces needing fully bespoke copy can pass
 * `copy` overrides, but prefer a domain entry so tone stays consistent.
 */
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { useOnlineStatus } from '@/lib/offline';
import {
  useStateCopy,
  useStateCopyActions,
  type ResolvedStateCopy,
  type StateCopyDomain,
} from '@/lib/state-copy';
import { useLocale } from '@/lib/i18n';

/** Domain → resting glyph for the empty surface. */
const DOMAIN_ICONS: Record<StateCopyDomain, AppIconName> = {
  conversations: 'chat',
  messages: 'chat',
  listings: 'pricetag',
  inventory: 'inventory',
  orders: 'receipt',
  analytics: 'analytics',
  wallet: 'wallet',
  search: 'search',
  sellerHub: 'dashboard',
  profile: 'profile',
  notifications: 'notifications',
};

/** Generic loading body — stacked skeleton rows matching list geometry.
 *  Screens with predictable layout should pass a real `skeleton` instead. */
function DefaultSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 py-6" aria-busy aria-label="Loading">
      <Skeleton className="h-6 w-2/5" />
      {['h-14 w-full', 'h-14 w-full', 'h-14 w-full', 'h-14 w-4/5'].map((c) => (
        <Skeleton key={c} className={c} />
      ))}
    </div>
  );
}

interface CenteredStateProps {
  icon: AppIconName;
  tone?: 'muted' | 'danger' | 'warning';
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Assertive for errorish states, polite otherwise (mobile contract). */
  assertive?: boolean;
  /** Reduced vertical padding — panes narrower than a full screen. */
  compact?: boolean;
}

function CenteredState({
  icon,
  tone = 'muted',
  title,
  body,
  actionLabel,
  onAction,
  assertive,
  compact,
}: CenteredStateProps) {
  const toneClass =
    tone === 'danger'
      ? 'text-danger-text'
      : tone === 'warning'
        ? 'text-warning-text'
        : 'text-text-muted';
  return (
    <div
      className={`flex flex-col items-center justify-center px-6 text-center ${compact ? 'py-12' : 'py-24'}`}
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
    >
      <Icon name={icon} size={28} className={`mb-4 ${toneClass}`} />
      <h2 className="text-section-title font-semibold text-text-primary">{title}</h2>
      {body ? <p className="mt-1.5 max-w-sm text-body text-text-secondary">{body}</p> : null}
      {actionLabel && onAction ? (
        <Button variant="secondary" size="md" className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export interface StateGateProps {
  /** Domain whose registry copy resolves the states. */
  domain: StateCopyDomain;
  isLoading: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  /** Empty because filters are applied → uses the emptyFiltered copy. */
  filtered?: boolean;
  /** Populated but possibly out of date → quiet refresh pill above content. */
  stale?: boolean;
  /** Layout-matched loading surface. Falls back to generic skeleton rows. */
  skeleton?: ReactNode;
  onRetry?: () => void;
  /** Empty-state CTA — label defaults to stateCopy.actions.* when omitted. */
  emptyAction?: { label?: string; onClick: () => void };
  /** Per-field copy overrides — prefer a domain entry over bespoke copy. */
  copy?: Partial<ResolvedStateCopy>;
  /** Reduced padding on the centered states — for panes narrower than a
   *  full screen (e.g. the inbox list column). */
  compact?: boolean;
  children: ReactNode;
  className?: string;
}

export function StateGate({
  domain,
  isLoading,
  isError = false,
  isEmpty = false,
  filtered = false,
  stale = false,
  skeleton,
  onRetry,
  emptyAction,
  copy: overrides,
  compact = false,
  children,
  className = '',
}: StateGateProps) {
  const { isOffline } = useOnlineStatus();
  const registryCopy = useStateCopy(domain);
  const actions = useStateCopyActions();
  const { t } = useLocale();
  const copy = { ...registryCopy, ...overrides };

  if (isLoading) {
    return (
      <div className={className} aria-live="polite">
        {skeleton ?? <DefaultSkeleton />}
      </div>
    );
  }

  if (isError) {
    if (isOffline && copy.offline) {
      return (
        <CenteredState
          icon="warning"
          tone="warning"
          title={t('common.states.youAreOffline')}
          body={copy.offline}
          actionLabel={actions.tryAgain}
          onAction={onRetry}
          assertive
          compact={compact}
        />
      );
    }
    return (
      <CenteredState
        icon="alert"
        tone="danger"
        title={copy.error}
        body={copy.errorRecovery}
        actionLabel={onRetry ? actions.tryAgain : undefined}
        onAction={onRetry}
        assertive
        compact={compact}
      />
    );
  }

  if (isEmpty) {
    if (isOffline && copy.offline) {
      return (
        <CenteredState
          icon="warning"
          tone="warning"
          title={t('common.states.youAreOffline')}
          body={copy.offline}
          actionLabel={onRetry ? actions.tryAgain : undefined}
          onAction={onRetry}
          compact={compact}
        />
      );
    }
    const body = filtered && copy.emptyFiltered ? copy.emptyFiltered : copy.empty;
    return (
      <div className={className}>
        <EmptyState
          icon={DOMAIN_ICONS[domain]}
          title={body}
          compact={compact}
          actionLabel={emptyAction ? (emptyAction.label ?? actions.browseListings) : undefined}
          onAction={emptyAction?.onClick}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      {(stale || isOffline) && (copy.stale || copy.offline) ? (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-alt px-3 py-2">
          <Icon
            name={isOffline ? 'warning' : 'refresh'}
            size={13}
            className={isOffline ? 'text-warning-text' : 'text-text-muted'}
          />
          <p className="flex-1 text-meta text-text-secondary">
            {isOffline ? `${t('common.states.youAreOffline')} — ${copy.offline}` : copy.stale}
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="pressable text-meta font-semibold text-text-primary"
            >
              {actions.refresh}
            </button>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
