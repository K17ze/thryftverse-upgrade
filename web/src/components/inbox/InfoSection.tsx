'use client';

/**
 * InfoSection + InfoRow — the flat iOS grouped-table grammar the mobile
 * ChatInfoSection / GroupInfoRow use: an uppercase meta label over rows of
 * 32px icon slot · label + optional subtitle · detail value · disclosure
 * chevron, separated by hairlines inset to the text edge. No cards.
 */

import React from 'react';
import Link from 'next/link';
import { Icon, type AppIconName } from '@/components/ui/Icon';

export function InfoSection({
  title,
  danger,
  children,
}: {
  title?: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const rows = React.Children.toArray(children).filter(React.isValidElement);
  return (
    <section className="mt-6 first:mt-0">
      {title ? (
        <h2
          className={`px-4 pb-1.5 text-meta font-semibold uppercase tracking-wide ${
            danger ? 'text-danger-text' : 'text-text-muted'
          }`}
        >
          {title}
        </h2>
      ) : null}
      <div>
        {rows.map((child, i) =>
          React.cloneElement(child as React.ReactElement<{ isLast?: boolean }>, {
            isLast: i === rows.length - 1,
          }),
        )}
      </div>
    </section>
  );
}

export interface InfoRowProps {
  icon: AppIconName;
  /** Brand/danger tint for icon + label (accented action rows). */
  tone?: 'default' | 'brand' | 'danger';
  label: string;
  subtitle?: string;
  /** Trailing value — muted meta text. */
  detail?: string;
  href?: string;
  onPress?: () => void;
  /** Overrides the default chevron rule (shown when the row navigates). */
  showChevron?: boolean;
  trailing?: React.ReactNode;
  disabled?: boolean;
  busy?: boolean;
  /** Injected by InfoSection — suppresses the divider on the last row. */
  isLast?: boolean;
  'aria-label'?: string;
}

export function InfoRow({
  icon,
  tone = 'default',
  label,
  subtitle,
  detail,
  href,
  onPress,
  showChevron,
  trailing,
  disabled = false,
  busy = false,
  isLast = false,
  'aria-label': ariaLabel,
}: InfoRowProps) {
  const tint =
    tone === 'danger'
      ? 'text-danger-text'
      : tone === 'brand'
        ? 'text-brand'
        : 'text-text-primary';
  const iconTint = tone === 'default' ? 'text-text-secondary' : tint;
  const chevron = showChevron ?? Boolean(href || onPress);

  const body = (
    <div className="flex min-h-[52px] items-center gap-3 px-4 py-2.5">
      <span className={`flex w-8 shrink-0 items-center justify-center ${iconTint}`} aria-hidden>
        <Icon name={icon} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`clamp-1 block text-body font-medium ${tint}`}>{label}</span>
        {subtitle ? (
          <span className="clamp-2 mt-0.5 block text-meta text-text-muted">{subtitle}</span>
        ) : null}
      </span>
      {busy ? (
        <span
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-text-primary"
          aria-label="Working"
        />
      ) : null}
      {detail ? (
        <span className="clamp-1 max-w-[38%] shrink-0 text-right text-meta text-text-muted">
          {detail}
        </span>
      ) : null}
      {trailing ??
        (chevron ? (
          <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
        ) : null)}
    </div>
  );

  return (
    <>
      {href && !disabled ? (
        <Link
          href={href}
          aria-label={ariaLabel ?? label}
          className="pressable block hover:bg-row-pressed"
        >
          {body}
        </Link>
      ) : onPress && !disabled ? (
        <button
          type="button"
          onClick={onPress}
          disabled={busy}
          aria-label={ariaLabel ?? label}
          className="pressable block w-full text-left hover:bg-row-pressed"
        >
          {body}
        </button>
      ) : (
        <div className={disabled ? 'opacity-55' : undefined}>{body}</div>
      )}
      {!isLast ? <div className="ml-[60px] border-b border-border-subtle" /> : null}
    </>
  );
}
