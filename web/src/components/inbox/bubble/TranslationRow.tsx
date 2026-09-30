'use client';

/**
 * TranslationRow — in-bubble translation affordance for foreign-language messages.
 * Automatically checks language via script detection, translates on-demand,
 * displays attribution with language name, and allows toggling original vs translated text.
 */

import { useState } from 'react';
import type { Message } from '@/lib/contracts/domain';
import { type TranslationResult } from '@/lib/api/services/chat';
import {
  getCachedTranslation,
  isForeignLanguageMessage,
  languageDisplayName,
  translateMessage,
} from '@/lib/chat/translation';
import { DATA_MODE } from '@/lib/api/client';
import { useLocale } from '@/lib/i18n';
import { Spinner } from '@/components/ui/Spinner';

interface TranslationRowProps {
  message: Message;
}

/**
 * TranslationRow — the in-bubble translate affordance, port of the
 * mobile translationRow block: idle "Translate" link → spinner →
 * translated body with source-language label + "Show original", or the
 * honest failed state with retry. Script detection decides whether the
 * row shows at all; results cache per message+locale for the session.
 */
export function TranslationRow({ message }: TranslationRowProps) {
  const { locale } = useLocale();
  const [result, setResult] = useState<TranslationResult | undefined>(() =>
    getCachedTranslation(message.id, locale),
  );
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>(() =>
    getCachedTranslation(message.id, locale) ? 'done' : 'idle',
  );

  // Fixture mode has no translate backend — an affordance that can only
  // ever fail is worse than none.
  const foreign =
    DATA_MODE === 'live' && isForeignLanguageMessage(message.text ?? '', locale);
  if (!foreign) return null;

  const run = () => {
    setState('loading');
    translateMessage(message.id, message.text ?? '', locale)
      .then((r) => {
        setResult(r);
        setState('done');
      })
      .catch(() => setState('error'));
  };

  return (
    <div className="mt-1.5 border-t border-border-subtle pt-1.5">
      {state === 'done' && result ? (
        <>
          <p className="whitespace-pre-wrap break-words text-body text-text-secondary">
            {result.translatedText}
          </p>
          <p className="mt-0.5 text-micro text-text-muted">
            Translated from {languageDisplayName(result.sourceLanguage, locale)}
            {' · '}
            <button
              type="button"
              onClick={() => setState('idle')}
              className="pressable underline decoration-transparent hover:decoration-current"
            >
              Show original
            </button>
          </p>
        </>
      ) : state === 'loading' ? (
        <p className="flex items-center gap-1.5 text-meta text-text-muted">
          <Spinner size={12} tone="inherit" />
          Translating…
        </p>
      ) : state === 'error' ? (
        <button
          type="button"
          onClick={run}
          className="pressable text-meta font-semibold text-text-secondary underline decoration-transparent hover:decoration-current"
        >
          Translation failed — try again
        </button>
      ) : (
        <button
          type="button"
          onClick={run}
          className="pressable text-meta font-semibold text-text-secondary underline decoration-transparent hover:decoration-current"
        >
          Translate
        </button>
      )}
    </div>
  );
}
