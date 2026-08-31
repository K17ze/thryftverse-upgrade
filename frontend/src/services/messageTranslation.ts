/**
 * AI-powered message translation service.
 *
 * Provides real-time translation of chat messages between users speaking
 * different languages — the same pattern used by WhatsApp, Instagram,
 * Telegram, and iMessage. Messages are translated on-demand via a backend
 * AI translation endpoint, with client-side caching to avoid redundant calls.
 *
 * Architecture:
 * - `translateMessage()` calls the backend `/chat/translate` endpoint
 * - Results are cached in-memory by message ID + target locale
 * - `detectMessageLanguage()` does lightweight client-side detection
 *   (script-based heuristic) to decide whether to show the "Translate" button
 * - The UI layer (MessageBubble) calls `useMessageTranslation()` hook
 *   which manages the translation lifecycle
 */

import { fetchJson } from '../lib/apiClient';

// ── Types ──────────────────────────────────────────────────────────

export interface TranslationResult {
  /** Translated text in the target language */
  translatedText: string;
  /** ISO 639-1 code of the detected source language (e.g. 'en', 'ar') */
  sourceLanguage: string;
  /** ISO 639-1 code of the target language */
  targetLanguage: string;
  /** Backend model used (e.g. 'gpt-4o-mini', 'gemini-flash') */
  model?: string;
}

interface TranslateApiResponse {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  model?: string;
}

// ── In-memory cache ────────────────────────────────────────────────

/**
 * Cache key: `${messageId}:${targetLocale}`
 * Prevents redundant API calls for the same message + target language.
 * Cache is per-session (not persisted) — translations are fast and cheap.
 */
const translationCache = new Map<string, TranslationResult>();

/** In-flight requests — deduplicates concurrent calls for the same key */
const inFlightRequests = new Map<string, Promise<TranslationResult>>();

function cacheKey(messageId: string, targetLocale: string): string {
  return `${messageId}:${targetLocale}`;
}

// ── Language detection (client-side heuristic) ─────────────────────

/**
 * Unicode script ranges for quick language-family detection.
 * Used to decide whether a message is in a different script from the
 * user's locale — if so, we show the "Translate" button.
 */
const SCRIPT_RANGES: Array<{ name: string; test: (char: number) => boolean }> = [
  // Arabic
  { name: 'ar', test: (c) => c >= 0x0600 && c <= 0x06ff },
  // Devanagari (Hindi)
  { name: 'hi', test: (c) => c >= 0x0900 && c <= 0x097f },
  // CJK Unified Ideographs (Chinese/Japanese/Korean)
  { name: 'zh', test: (c) => (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf) },
  // Hiragana (Japanese)
  { name: 'ja', test: (c) => c >= 0x3040 && c <= 0x309f },
  // Katakana (Japanese)
  { name: 'ja', test: (c) => c >= 0x30a0 && c <= 0x30ff },
  // Hangul (Korean)
  { name: 'ko', test: (c) => (c >= 0xac00 && c <= 0xd7af) || (c >= 0x1100 && c <= 0x11ff) },
  // Cyrillic (Russian, etc.)
  { name: 'ru', test: (c) => c >= 0x0400 && c <= 0x04ff },
];

/**
 * Detect the dominant script of a message text.
 * Returns an ISO 639-1 code if a non-Latin script is dominant, or 'en'
 * if the text is primarily Latin script (covers English, Spanish, French,
 * German, Portuguese, Turkish, Indonesian, Vietnamese, etc.).
 *
 * This is a fast heuristic — the backend does the real detection.
 */
export function detectMessageLanguage(text: string): string {
  if (!text || text.trim().length === 0) return 'en';

  const charCounts = new Map<string, number>();
  let latinCount = 0;
  let totalNonSpace = 0;

  for (const char of text) {
    const code = char.codePointAt(0);
    if (code === undefined || code < 0x0041) continue; // skip spaces, punctuation, digits
    totalNonSpace++;

    if (code >= 0x0041 && code <= 0x024f) {
      // Latin script (including extended Latin for accented chars)
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
  if (latinCount / totalNonSpace > 0.6) return 'en'; // Latin-dominant

  // Find the dominant non-Latin script
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

/**
 * Check if a message is likely in a different language than the user's
 * locale. Used to decide whether to show the "Translate" button.
 */
export function isForeignLanguageMessage(text: string, userLocale: string): boolean {
  const detected = detectMessageLanguage(text);
  if (detected === 'en') {
    // Latin script — could be any Latin language. Only show translate
    // if the user's locale is non-Latin (e.g. user is Arabic but message
    // is in English).
    const nonLatinLocales = ['ar', 'hi', 'zh', 'ja', 'ko', 'ru'];
    return nonLatinLocales.includes(userLocale);
  }
  // Non-Latin script — show translate if it differs from user's locale
  return detected !== userLocale;
}

// ── API call ───────────────────────────────────────────────────────

/**
 * Translate a chat message to the target locale via the backend AI
 * translation endpoint.
 *
 * The backend uses an LLM (GPT-4o-mini or similar) for high-quality
 * contextual translation. Results are cached client-side.
 *
 * @param messageId Stable message ID (used for caching)
 * @param text Original message text
 * @param targetLocale ISO 639-1 code of the user's language
 * @returns Translation result with translated text and detected source language
 */
export async function translateMessage(
  messageId: string,
  text: string,
  targetLocale: string,
): Promise<TranslationResult> {
  const key = cacheKey(messageId, targetLocale);

  // Return cached result if available
  const cached = translationCache.get(key);
  if (cached) return cached;

  // Deduplicate concurrent requests
  const inFlight = inFlightRequests.get(key);
  if (inFlight) return inFlight;

  const promise = (async (): Promise<TranslationResult> => {
    try {
      const response = await fetchJson<TranslateApiResponse>(
        '/chat/translate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageId,
            text,
            targetLocale,
          }),
        },
        { timeoutMs: 10000 },
      );

      const result: TranslationResult = {
        translatedText: response.translatedText,
        sourceLanguage: response.sourceLanguage,
        targetLanguage: response.targetLanguage,
        model: response.model,
      };

      translationCache.set(key, result);
      return result;
    } catch (error) {
      // If the backend is unavailable, fall back to a no-op.
      // The UI will show the original text with no translate option.
      throw error;
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, promise);
  return promise;
}

/**
 * Clear the translation cache. Called when the user changes their
 * language preference so old translations don't persist.
 */
export function clearTranslationCache(): void {
  translationCache.clear();
  inFlightRequests.clear();
}

/**
 * Get a cached translation without triggering an API call.
 * Returns undefined if not cached.
 */
export function getCachedTranslation(
  messageId: string,
  targetLocale: string,
): TranslationResult | undefined {
  return translationCache.get(cacheKey(messageId, targetLocale));
}
