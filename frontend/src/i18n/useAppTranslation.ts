/**
 * Convenience hook for namespace-scoped translations.
 *
 * Wraps react-i18next's `useTranslation` with the app's namespace conventions.
 * The `common` namespace is always loaded alongside the requested namespace
 * so shared strings (buttons, states, trust labels) are accessible via
 * `t('common:buttons.save')` without an extra hook call.
 *
 * @example
 * // In a Home screen component:
 * const { t } = useAppTranslation('home');
 * <Text>{t('brandTitle')}</Text>           // → "Thryftverse"
 * <Text>{t('common:buttons.close')}</Text> // → "Close"
 *
 * @example
 * // Interpolation:
 * const { t } = useAppTranslation('home');
 * t('newListings.bannerPlural', { count: 3 }) // → "3 new drops ready"
 */

import { useTranslation } from 'react-i18next';
import type { AppNamespace } from './locales';

export function useAppTranslation(namespace: AppNamespace) {
  // Always include 'common' so shared strings are available without a
  // second hook call. The primary namespace is listed first so bare keys
  // (e.g. `t('brandTitle')`) resolve to it.
  const { t, i18n } = useTranslation([namespace, 'common']);
  return { t, i18n };
}
