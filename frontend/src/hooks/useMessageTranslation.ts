/**
 * React hook for on-demand message translation in chat.
 *
 * Implements the WhatsApp/Instagram/Telegram 2026 translation UX pattern:
 * - Detects foreign-language messages client-side (Unicode script heuristic)
 * - On-demand translation via backend AI endpoint
 * - Caches results in-memory for instant re-display
 * - Auto-translate mode (opt-in via Settings)
 * - Retry on error (Telegram pattern: "Translation unavailable · Retry")
 * - Tracks source language for "Translated from {language}" label
 *
 * Usage in MessageBubble:
 *   const { translatedText, isLoading, isTranslated, translate, revert } =
 *     useMessageTranslation({ messageId, text, userLocale });
 */

import { useState, useCallback, useRef } from 'react';
import {
  translateMessage,
  getCachedTranslation,
  isForeignLanguageMessage,
  detectMessageLanguage,
  type TranslationResult,
} from '../services/messageTranslation';

/** Maps ISO 639-1 codes to display names for the "Translated from X" label */
const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ar: 'Arabic',
  hi: 'Hindi',
  zh: 'Chinese',
  pt: 'Portuguese',
  ja: 'Japanese',
  ru: 'Russian',
  tr: 'Turkish',
  ko: 'Korean',
  id: 'Indonesian',
};

interface UseMessageTranslationOptions {
  messageId: string;
  text: string | undefined;
  userLocale: string;
  /** If true, auto-translate foreign messages on mount */
  autoTranslate?: boolean;
}

interface UseMessageTranslationReturn {
  /** The translated text, or undefined if not translated */
  translatedText: string | undefined;
  /** True while a translation request is in-flight */
  isLoading: boolean;
  /** True if the message has been translated and is showing the translation */
  isTranslated: boolean;
  /** True if the message appears to be in a foreign language */
  isForeignLanguage: boolean;
  /** Detected source language code (e.g. 'en', 'ar') */
  detectedLanguage: string;
  /** Human-readable source language name for "Translated from X" label */
  sourceLanguageName: string;
  /** Error message if translation failed */
  error: string | undefined;
  /** Request a translation */
  translate: () => void;
  /** Revert to original text */
  revert: () => void;
  /** Retry a failed translation */
  retry: () => void;
}

export function useMessageTranslation({
  messageId,
  text,
  userLocale,
  autoTranslate = false,
}: UseMessageTranslationOptions): UseMessageTranslationReturn {
  const [translatedText, setTranslatedText] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [isTranslated, setIsTranslated] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [sourceLanguage, setSourceLanguage] = useState<string>('en');
  const hasAutoTranslated = useRef(false);

  const rawText = text ?? '';
  const detectedLanguage = detectMessageLanguage(rawText);
  const isForeignLanguage = isForeignLanguageMessage(rawText, userLocale);

  // Check cache on mount — hydrate synchronously if available
  const cached = getCachedTranslation(messageId, userLocale);
  if (cached && !isTranslated && !translatedText) {
    queueMicrotask(() => {
      setTranslatedText(cached.translatedText);
      setSourceLanguage(cached.sourceLanguage);
      setIsTranslated(true);
    });
  }

  // Auto-translate on mount if enabled and message is foreign
  if (autoTranslate && isForeignLanguage && !hasAutoTranslated.current && !cached) {
    hasAutoTranslated.current = true;
    queueMicrotask(() => {
      void doTranslate();
    });
  }

  const doTranslate = useCallback(async () => {
    if (!rawText || isLoading) return;
    setIsLoading(true);
    setError(undefined);
    try {
      const result: TranslationResult = await translateMessage(messageId, rawText, userLocale);
      setTranslatedText(result.translatedText);
      setSourceLanguage(result.sourceLanguage);
      setIsTranslated(true);
    } catch {
      setError('Translation unavailable');
    } finally {
      setIsLoading(false);
    }
  }, [messageId, rawText, userLocale, isLoading]);

  const translate = useCallback(() => {
    void doTranslate();
  }, [doTranslate]);

  const revert = useCallback(() => {
    setIsTranslated(false);
    setTranslatedText(undefined);
  }, []);

  const retry = useCallback(() => {
    setError(undefined);
    void doTranslate();
  }, [doTranslate]);

  return {
    translatedText,
    isLoading,
    isTranslated,
    isForeignLanguage,
    detectedLanguage,
    sourceLanguageName: LANGUAGE_DISPLAY_NAMES[sourceLanguage] ?? sourceLanguage,
    error,
    translate,
    revert,
    retry,
  };
}
