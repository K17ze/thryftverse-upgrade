/**
 * Legacy translation data — re-exported from the original i18n module.
 *
 * This file exists to separate the translation data (which is large and
 * stable) from the i18next configuration (which is new). The original
 * `index.ts` still exports the data; we re-export it here so the new
 * `i18n.ts` module can consume it without duplicating ~800 lines.
 *
 * When the migration is complete, the translation data should be moved
 * to namespace-based JSON files (e.g., `locales/en/auctions.json`) and
 * this file will be removed.
 */
export {
  EN_TRANSLATIONS,
  ES_TRANSLATION_PATCH,
  FR_TRANSLATION_PATCH,
  DE_TRANSLATION_PATCH,
} from './index';

export type { SupportedLocale, TranslationKey } from './index';
