'use client';

/**
 * SyncStatusPill — web port of mobile SyncStatusPill.
 *
 * A quiet status pill for sync state on data surfaces. Tones mirror the
 * mobile grammar: live (success), syncing (warning), offline (danger).
 * Labels come from the `sync` i18n namespace unless overridden.
 */
import { useLocale } from '@/lib/i18n';
import { Icon, type AppIconName } from './Icon';

export type SyncStatusTone = 'live' | 'syncing' | 'offline';

interface SyncStatusPillProps {
  tone: SyncStatusTone;
  /** Override label — defaults to `sync.<tone>` from the registry. */
  label?: string;
  compact?: boolean;
  className?: string;
}

const TONE_STYLES: Record<SyncStatusTone, { icon: AppIconName; classes: string }> = {
  live: {
    icon: 'check',
    classes: 'border-border-subtle bg-success-subtle text-success-text',
  },
  syncing: {
    icon: 'refresh',
    classes: 'border-border-subtle bg-warning-subtle text-warning-text',
  },
  offline: {
    icon: 'warning',
    classes: 'border-border-subtle bg-danger-subtle text-danger-text',
  },
};

export function SyncStatusPill({ tone, label, compact = false, className = '' }: SyncStatusPillProps) {
  const { t } = useLocale();
  const style = TONE_STYLES[tone];
  return (
    <span
      role="status"
      className={`inline-flex max-w-40 items-center gap-1 rounded-full border ${
        compact ? 'px-2 py-0.5' : 'px-2.5 py-1'
      } ${style.classes} ${className}`}
    >
      <Icon name={style.icon} size={compact ? 11 : 12} />
      <span className="truncate text-meta">{label ?? t(`sync.${tone}`)}</span>
    </span>
  );
}
