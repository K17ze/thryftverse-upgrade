'use client';

/**
 * SettingsRow — the one row grammar for the settings surface.
 * 18px secondary icon, label, optional muted value, chevron for
 * destinations, or a custom trailing control (e.g. Switch) for toggles.
 */

import Link from 'next/link';
import { Icon, type AppIconName } from '@/components/ui/Icon';

interface SettingsRowProps {
  icon: AppIconName;
  label: string;
  /** Muted right-side value (e.g. "English", "On"). */
  value?: string;
  href?: string;
  onClick?: () => void;
  /** Danger styling for destructive rows (sign out, delete). */
  danger?: boolean;
  /** Custom trailing control — suppresses the chevron. */
  trailing?: React.ReactNode;
}

export function SettingsRow({ icon, label, value, href, onClick, danger, trailing }: SettingsRowProps) {
  const body = (
    <>
      <span className={`flex h-11 w-9 shrink-0 items-center ${danger ? 'text-danger-text' : 'text-text-secondary'}`}>
        <Icon name={icon} size={18} />
      </span>
      <span
        className={`flex-1 text-body-emphasis ${
          danger ? 'font-medium text-danger-text' : 'text-text-primary'
        }`}
      >
        {label}
      </span>
      {value ? (
        <span className="clamp-1 max-w-[40%] text-body text-text-muted">{value}</span>
      ) : null}
      {trailing ?? (
        <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
      )}
    </>
  );

  const className =
    'pressable flex min-h-[52px] w-full items-center gap-1 px-4 text-left sm:px-5';

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }

  if (trailing) {
    // Toggle rows aren't pressable themselves — the trailing control is.
    return <div className="flex min-h-[52px] w-full items-center gap-1 px-4 sm:px-5">{body}</div>;
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}
