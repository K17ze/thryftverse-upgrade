'use client';

/**
 * AI message translation — port of the mobile messageTranslation
 * service (frontend/src/services/messageTranslation.ts). The backend
 * `/chat/translate` endpoint does the real detection + translation and
 * caches PII-masked results; this module adds the client-side script
 * heuristic that decides whether the "Translate" affordance shows at
 * all, plus the per-session result/in-flight caches so a re-render or
 * remount never re-bills the same message.
 */

import { translateChatMessage, type TranslationResult } from '@/lib/api/services/chat';

// ── Language detection (client-side heuristic) ─────────────────────
// Same script-range approach as mobile: non-Latin scripts are
// detectable locally; Latin-script languages all collapse to 'en' and
// the backend resolves the real source on demand.

const SCRIPT_RANGES: Array<{ name: string; test: (char: number) => boolean }> = [
  { name: 'ar', test: (c) => c >= 0x0600 && c <= 0x06ff },
  { name: 'hi', test: (c) => c >= 0x0900 && c <= 0x097f },
  { name: 'zh', test: (c) => (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf) },
  { name: 'ja', test: (c) => (c >= 0x3040 && c <= 0x30ff) },
  { name: 'ko', test: (c) => (c >= 0xac00 && c <= 0xd7af) || (c >= 0x1100 && c <= 0x11ff) },
  { name: 'ru', test: (c) => c >= 0x0400 && c <= 0x04ff },
];

export function detectMessageLanguage(text: string): string {
  if (!text || text.trim().length === 0) return 'en';
  const charCounts = new Map<string, number>();
  let latinCount = 0;
  let totalNonSpace = 0;

  for (const char of text) {
    const code = char.codePointAt(0);
    if (code === undefined || code < 0x0041) continue;
    totalNonSpace++;
    if (code >= 0x0041 && code <= 0x024f) {
      latinCount++;
      continue;
    }
    for (const range of SCRIPT_RANGES) {
      if (range.test(code)) {
        charCounts.set(range.name, (charCounts.get(range.name) ?? 0) + 1);
        break;
      }
    }
  }

  if (totalNonSpace === 0) return 'en';
  if (latinCount / totalNonSpace > 0.6) return 'en';

  let maxScript = 'en';
  let maxCount = 0;
  for (const [script, count] of charCounts) {
    if (count > maxCount) {
      maxCount = count;
      maxScript = script;
    }
  }
  return maxScript;
}

/** Whether the bubble should offer translate — mobile grammar: Latin
 *  text only reads foreign to non-Latin-locale viewers; non-Latin text
 *  reads foreign when it differs from the viewer's locale. */
export function isForeignLanguageMessage(text: string, userLocale: string): boolean {
  const detected = detectMessageLanguage(text);
  if (detected === 'en') {
    const nonLatinLocales = ['ar', 'hi', 'zh', 'ja', 'ko', 'ru'];
    return nonLatinLocales.includes(userLocale);
  }
  return detected !== userLocale;
}

// ── Session caches ─────────────────────────────────────────────────

const translationCache = new Map<string, TranslationResult>();
const inFlightRequests = new Map<string, Promise<TranslationResult>>();

function cacheKey(messageId: string, targetLocale: string): string {
  return `${messageId}:${targetLocale}`;
}

/** Cached result without a network call — undefined when uncached. */
export function getCachedTranslation(
  messageId: string,
  targetLocale: string,
): TranslationResult | undefined {
  return translationCache.get(cacheKey(messageId, targetLocale));
}

/**
 * Translate a message to the target locale — cache-first, in-flight
 * deduped, throws on failure so the UI can show the honest retry state.
 */
export async function translateMessage(
  messageId: string,
  text: string,
  targetLocale: string,
): Promise<TranslationResult> {
  const key = cacheKey(messageId, targetLocale);
  const cached = translationCache.get(key);
  if (cached) return cached;
  const inFlight = inFlightRequests.get(key);
  if (inFlight) return inFlight;

  const promise = (async (): Promise<TranslationResult> => {
    try {
      const result = await translateChatMessage(messageId, text, targetLocale);
      translationCache.set(key, result);
      return result;
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, promise);
  return promise;
}

/** Localised source-language name — "Translated from Arabic". Falls
 *  back to the raw code where DisplayNames can't resolve it. */
export function languageDisplayName(code: string, displayLocale: string): string {
  try {
    const names = new Intl.DisplayNames([displayLocale], { type: 'language' });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}
