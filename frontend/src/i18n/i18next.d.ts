/**
 * Type augmentation for react-i18next — enables compile-time key checking.
 *
 * With this augmentation, `useTranslation` and `useAppTranslation` return a
 * `t` function that is type-checked against the actual resource keys. A
 * typo in a translation key is caught at compile time rather than rendering
 * the raw key string at runtime.
 *
 * The legacy `translation` namespace uses flat keys (keySeparator: false)
 * so its type is `keyof typeof EN_TRANSLATIONS`. The new namespace-based
 * resources use flattened dot-notation keys within each namespace.
 */

import type { EN_TRANSLATIONS } from './index';
import type { flattenedResources } from './locales';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof EN_TRANSLATIONS;
      common: (typeof flattenedResources)['common'];
      home: (typeof flattenedResources)['home'];
      search: (typeof flattenedResources)['search'];
      profile: (typeof flattenedResources)['profile'];
      listing: (typeof flattenedResources)['listing'];
      messaging: (typeof flattenedResources)['messaging'];
      settings: (typeof flattenedResources)['settings'];
      commerce: (typeof flattenedResources)['commerce'];
      myProfile: (typeof flattenedResources)['myProfile'];
      galleria: (typeof flattenedResources)['galleria'];
      agentLedger: (typeof flattenedResources)['agentLedger'];
      liveStreamViewer: (typeof flattenedResources)['liveStreamViewer'];
      liveShopping: (typeof flattenedResources)['liveShopping'];
      conversationalSearch: (typeof flattenedResources)['conversationalSearch'];
      aiAgent: (typeof flattenedResources)['aiAgent'];
      algorithm: (typeof flattenedResources)['algorithm'];
      aiListing: (typeof flattenedResources)['aiListing'];
      report: (typeof flattenedResources)['report'];
      appeal: (typeof flattenedResources)['appeal'];
    };
  }
}
