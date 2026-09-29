'use client';

/**
 * NotificationRow — one feed row. Leading visual (actor avatar or item
 * thumb) carries the unread dot top-right and a per-kind accent badge
 * bottom-right; the body is one sentence with the time right-aligned.
 * Unread is signalled by dot + title weight only — never a row tint.
 *
 * Desktop grammar: the row's stretched layer (link when it routes,
 * button otherwise) covers the surface; hover-revealed quiet actions sit
 * above it — mark-as-read (the swipe-right analogue) and dismiss (the
 * swipe-left Clear). Touch viewports (hover:none) keep them always
 * visible since there is no hover to discover them by. Action-required
 * events carry a quiet action label under the text (mobile's
 * resolveCardActionLabel affordance — the press is the row press).
 */

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { FollowButton } from '@/components/profile/FollowButton';
import { KIND_ACCENT, type NotificationRowModel } from './viewModel';

interface NotificationRowProps {
  notification: NotificationRowModel;
  /** Row opened — mark read. Aggregated cards fan out to their unread
   *  member ids inside the page handler. */
  onOpen: (notification: NotificationRowModel) => void;
  /** Dismiss — the mobile swipe-left "Clear"; removes the row and posts
   *  the delete edge in live mode. Aggregated cards fan out to every
   *  member id. */
  onDismiss?: (notification: NotificationRowModel) => void;
}

export function NotificationRow({ notification: n, onOpen, onDismiss }: NotificationRowProps) {
  const accent = KIND_ACCENT[n.kind] ?? KIND_ACCENT.system;

  // Hover grammar: hidden until row hover/focus-within on hover-capable
  // viewports, always present on touch. The ::after pad-out stretches the
  // 32px glyph button to a 44px hit area (the Chip grammar).
  const hoverBtn =
    'pressable relative flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-opacity after:absolute after:-inset-1.5 after:content-[""] hover:text-text-primary focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/nrow:opacity-100 [@media(hover:hover)]:group-focus-within/nrow:opacity-100';

  const inner = (
    <>
      <div className="relative shrink-0 self-start pt-0.5">
        <AppImage
          src={n.image}
          alt=""
          sizes="44px"
          className={`h-11 w-11 ${n.isActor ? 'rounded-full' : 'rounded-md'}`}
          fallbackIcon={n.isActor ? 'profile' : 'image'}
        />
        {n.unread ? (
          <span
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-background"
            aria-hidden
          />
        ) : null}
        <span
          className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-border-subtle bg-surface-elevated ${accent.className}`}
          aria-hidden
        >
          <Icon name={accent.icon} size={10} filled={accent.filled} />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={`clamp-2 text-body ${
            n.unread ? 'font-semibold text-text-primary' : 'text-text-secondary'
          }`}
        >
          {n.text}
        </p>
        {/* Action-required affordance — the quiet label under the copy
            (mobile's actionLabel grammar); the press is the row's own. */}
        {n.actionLabel ? (
          <span className="mt-1 block w-fit text-meta font-semibold text-brand">
            {n.actionLabel}
          </span>
        ) : null}
        {/* Aggregated group badge — the native "+N" meta pill under the
            body (NotificationRowBase aggregatedBadge); the leading
            visual stays the primary member's avatar/thumb. */}
        {n.aggregatedCount != null && n.aggregatedCount > 1 ? (
          <span
            className="tnum mt-1 flex h-4 w-fit min-w-4 items-center justify-center rounded-full bg-brand px-1 text-micro font-bold leading-none text-text-inverse"
            aria-label={`${n.aggregatedCount} similar notifications`}
          >
            +{n.aggregatedCount - 1}
          </span>
        ) : null}
      </div>

      <span className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="pt-0.5 text-meta text-text-muted">{n.time}</span>
        {/* Row actions — read/dismiss sit above the stretched layer on z;
            their taps never navigate. */}
        <span className="flex items-center gap-1">
          {n.unread ? (
            <span className="relative z-[2]">
              <button
                type="button"
                aria-label="Mark as read"
                title="Mark as read"
                onClick={(e) => {
                  e.stopPropagation();
                  // The button unmounts when unread clears — land focus
                  // on the row's primary layer before the write.
                  e.currentTarget
                    .closest('[data-notification-row]')
                    ?.querySelector<HTMLElement>('[data-notification-open]')
                    ?.focus({ preventScroll: true });
                  onOpen(n);
                }}
                className={hoverBtn}
              >
                <Icon name="check" size={16} />
              </button>
            </span>
          ) : null}
          {n.kind === 'follow' && n.actorId ? (
            <span className="relative z-[2]">
              <FollowButton userId={n.actorId} />
            </span>
          ) : null}
          {onDismiss ? (
            <span className="relative z-[2]">
              <button
                type="button"
                aria-label="Dismiss notification"
                title="Dismiss"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(n);
                }}
                className={`${hoverBtn} hover:text-danger-text`}
              >
                <Icon name="close" size={15} />
              </button>
            </span>
          ) : null}
        </span>
      </span>
    </>
  );

  // No `pressable` on the row: the :active scale transform creates a
  // mid-press stacking context that lets the stretched layer steal the
  // hit-test from the in-row actions between pointerdown/up.
  const className =
    'group/nrow flex w-full items-start gap-3 px-2 py-3 text-left hover:bg-row-pressed lg:py-2.5';
  const label = `${n.text}${n.unread ? ' — unread' : ''}`;

  // In-row actions need the stretched-layer pattern — real buttons can't
  // nest inside the anchor/button.
  const needsLayer = Boolean(onDismiss) || (n.unread && n.href != null) ||
    (n.kind === 'follow' && n.actorId != null);

  if (needsLayer) {
    return (
      // data-notification-row marks the group for focus parking — the
      // dismiss action's parent moves focus to a sibling row's primary
      // control ([data-notification-open]) before this one unmounts.
      <div className="relative" data-notification-row>
        <div className={className}>{inner}</div>
        {n.href ? (
          <Link
            href={n.href}
            aria-label={label}
            data-notification-open
            className="absolute inset-0 z-[1] rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            onClick={() => onOpen(n)}
          />
        ) : (
          <button
            type="button"
            aria-label={label}
            data-notification-open
            className="absolute inset-0 z-[1] rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            onClick={() => onOpen(n)}
          />
        )}
      </div>
    );
  }

  if (n.href) {
    return (
      <Link
        href={n.href}
        aria-label={label}
        data-notification-row
        data-notification-open
        className={className}
        onClick={() => onOpen(n)}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      data-notification-row
      data-notification-open
      className={className}
      onClick={() => onOpen(n)}
    >
      {inner}
    </button>
  );
}
