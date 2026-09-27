'use client';

/**
 * PlatformRuntime — the single mount point for platform-systems
 * infrastructure. Rendered once in layout.tsx inside <Providers>.
 *
 * Responsibilities (mirrors mobile's ThemeContext/NetInfo wiring):
 *   - mirror density → `<html data-density>` (CSS vars in globals.css)
 *   - mirror accent → `<html data-accent>`   (CSS var overrides)
 *   - mirror locale → `<html lang>` + `dir` (rtl for ar)
 *   - render the global OfflineBanner strip when connectivity drops
 *
 * The persisted values are restored pre-paint by the inline script in
 * layout.tsx, so these effects confirm rather than flash.
 */
import { useEffect } from 'react';
import { useAccentStore } from '@/lib/accent';
import { useDensityStore } from '@/lib/density';
import { localeDir, useLocaleStore } from '@/lib/i18n';
import { OfflineBanner } from '@/components/ui/OfflineBanner';

export function PlatformRuntime() {
  const density = useDensityStore((s) => s.density);
  const accent = useAccentStore((s) => s.accent);
  const locale = useLocaleStore((s) => s.locale);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  useEffect(() => {
    // `default` clears the attribute — base tokens already carry it.
    if (accent === 'default') {
      delete document.documentElement.dataset.accent;
    } else {
      document.documentElement.dataset.accent = accent;
    }
  }, [accent]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDir(locale);
  }, [locale]);

  return <OfflineBanner />;
}
