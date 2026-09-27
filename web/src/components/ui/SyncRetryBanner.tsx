'use client';

/**
 * SyncRetryBanner — web port of mobile SyncRetryBanner.
 *
 * Inline retry strip for sync/pending surfaces: message + one retry action,
 * flat surface-alt panel with a hairline border. The attempt loop belongs
 * to the caller — pair with `retryWithBackoff` for real retries.
 */
import { useLocale } from '@/lib/i18n';

interface SyncRetryBannerProps {
  message: string;
  onRetry: () => void;
  isRetrying?: boolean;
  disabled?: boolean;
  retryLabel?: string;
  retryingLabel?: string;
  className?: string;
}

export function SyncRetryBanner({
  message,
  onRetry,
  isRetrying = false,
  disabled = false,
  retryLabel,
  retryingLabel,
  className = '',
}: SyncRetryBannerProps) {
  const { t } = useLocale();
  const label = isRetrying
    ? (retryingLabel ?? `${t('sync.syncing')}`)
    : (retryLabel ?? t('common.buttons.retry'));
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-border bg-surface-alt px-2.5 py-2 ${className}`}
      role="status"
    >
      <p className="flex-1 text-meta text-text-secondary">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={disabled || isRetrying}
        aria-busy={isRetrying || undefined}
        className="pressable shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-meta text-text-primary disabled:opacity-50"
      >
        {label}
      </button>
    </div>
  );
}
