'use client';

/**
 * OfflineBanner — web port of mobile OfflineBanner (components/OfflineBanner).
 *
 * A quiet fixed top strip shown while the browser reports offline. It does
 * not block interaction — cached/fixture content stays visible. Copy comes
 * from the i18n registry (`offline.banner`); the retry affordance defaults
 * to a reload, which is the honest recovery on web.
 *
 * Layout: `html[data-offline] body { padding-top }` (globals.css) reserves
 * the strip height so it never covers the sticky header. Mounted once by
 * PlatformRuntime — screens should not render their own copy; use
 * `useOnlineStatus()` for per-surface offline states instead.
 */
import { useEffect, useState } from 'react';
import { useLocale } from '@/lib/i18n';
import { useOnlineStatus } from '@/lib/offline';
import { Icon } from './Icon';

export interface OfflineBannerProps {
  /** Overrides the registry copy — surfaces should almost never need this. */
  message?: string;
  /** Custom retry; defaults to a page reload (honest recovery on web). */
  onRetry?: () => void;
}

export function OfflineBanner({ message, onRetry }: OfflineBannerProps) {
  const { isOffline } = useOnlineStatus();
  const { t } = useLocale();
  // Post-hydration gate — SSR reports online (see useOnlineStatus), so the
  // strip never renders in server markup and can't mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Mirror onto <html data-offline> so globals.css can reserve strip height.
  useEffect(() => {
    if (!mounted) return;
    if (isOffline) {
      document.documentElement.dataset.offline = '';
    } else {
      delete document.documentElement.dataset.offline;
    }
    return () => {
      delete document.documentElement.dataset.offline;
    };
  }, [isOffline, mounted]);

  if (!mounted || !isOffline) return null;

  const text = message ?? t('offline.banner');
  const handleRetry = onRetry ?? (() => window.location.reload());

  return (
    <div
      role="alert"
      aria-label={text}
      className="offline-strip fixed inset-x-0 top-0 z-toast flex items-center justify-center gap-2 border-b border-warning-border bg-warning-subtle px-4 text-warning-text"
    >
      <Icon name="warning" size={14} />
      <p className="truncate text-meta">{text}</p>
      <button
        type="button"
        onClick={handleRetry}
        className="pressable ml-1 shrink-0 px-2 py-1 text-meta font-semibold"
      >
        {t('common.buttons.retry')}
      </button>
    </div>
  );
}
