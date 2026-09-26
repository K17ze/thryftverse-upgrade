'use client';

/**
 * NotificationRow — one feed row. Leading visual (actor avatar or item
 * thumb) carries the unread dot top-right and a per-kind accent badge
 * bottom-right; the body is one sentence with the time right-aligned.
 * Unread is signalled by dot + title weight only — never a row tint.
 * Rows with a deep link render as links; the press also marks read.
 */

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { FollowButton } from '@/components/profile/FollowButton';
import { KIND_ACCENT, type NotificationRowModel } from './viewModel';

interface NotificationRowProps {
  notification: NotificationRowModel;
  onOpen: (id: string) => void;
}

export function NotificationRow({ notification: n, onOpen }: NotificationRowProps) {
  const accent = KIND_ACCENT[n.kind] ?? KIND_ACCENT.system;

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
      </div>

      <span className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="pt-0.5 text-meta text-text-muted">{n.time}</span>
        {/* Instagram grammar — follow rows carry the in-row action. The
            button sits above the row's stretched link on z; its own tap
            doesn't navigate. */}
        {n.kind === 'follow' && n.actorId ? (
          <span className="relative z-[2]">
            <FollowButton userId={n.actorId} />
          </span>
        ) : null}
      </span>
    </>
  );

  // No `pressable` on the row: the :active scale transform creates a
  // mid-press stacking context that lets the stretched link steal the
  // hit-test from the in-row FollowButton between pointerdown/up.
  const className = 'flex w-full items-start gap-3 px-2 py-3 text-left hover:bg-row-pressed';
  const label = `${n.text}${n.unread ? ' — unread' : ''}`;
  const hasAction = n.kind === 'follow' && n.actorId != null;

  // Rows with an in-row action use the stretched-link pattern — the
  // FollowButton is a real button, so it can't nest inside the anchor.
  if (hasAction && n.href) {
    return (
      <div className="relative">
        <div className={className}>{inner}</div>
        <Link
          href={n.href}
          aria-label={label}
          className="absolute inset-0 z-[1]"
          onClick={() => onOpen(n.id)}
        />
      </div>
    );
  }

  if (n.href) {
    return (
      <Link href={n.href} aria-label={label} className={className} onClick={() => onOpen(n.id)}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} className={className} onClick={() => onOpen(n.id)}>
      {inner}
    </button>
  );
}
