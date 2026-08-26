import { useCallback, useRef, useState } from 'react';
import {
  analyzeListingImages,
  type AIListingRequest,
  type ListingSuggestionResult,
  type FieldSuggestion,
  type ListingField,
} from '../services/aiListingApi';

export interface UseAIListingSuggestionResult {
  /** The full field-level suggestion result, or null when not yet analyzed. */
  suggestion: ListingSuggestionResult | null;
  isLoading: boolean;
  error: string | null;
  analyze: (request?: Partial<AIListingRequest>) => Promise<void>;
  clearError: () => void;
  reset: () => void;
  /** Get the candidate for a specific field, or null when abstained/missing. */
  getField: (field: ListingField) => FieldSuggestion | null;
}

/**
 * Hook that wraps `analyzeListingImages` with loading/error state and
 * caches the last successful suggestion.
 *
 * The caller passes the image URIs up front; calling `analyze()` re-runs
 * analysis on the current URIs (or an override). The caller is responsible
 * for presenting each field candidate for explicit seller review — this
 * hook never auto-applies suggestions to any form.
 */
export function useAIListingSuggestion(
  imageUris: string[],
  categoryHint?: string,
): UseAIListingSuggestionResult {
  const [suggestion, setSuggestion] = useState<ListingSuggestionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache the last successful suggestion so re-renders don't lose it.
  const cachedRef = useRef<ListingSuggestionResult | null>(null);
  // Track the last analyzed signature to avoid duplicate work.
  const lastSignatureRef = useRef<string>('');

  const urisRef = useRef(imageUris);
  urisRef.current = imageUris;
  const hintRef = useRef(categoryHint);
  hintRef.current = categoryHint;

  const analyze = useCallback(
    async (request?: Partial<AIListingRequest>) => {
      const uris = request?.imageUris ?? urisRef.current;
      const hint = request?.categoryHint ?? hintRef.current;

      if (!uris || uris.length === 0) {
        setError('Add at least one photo to generate suggestions.');
        return;
      }

      const signature = `${uris.join('|')}::${hint ?? ''}`;
      if (signature === lastSignatureRef.current && cachedRef.current) {
        setSuggestion(cachedRef.current);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const result = await analyzeListingImages({ imageUris: uris, categoryHint: hint });
        cachedRef.current = result;
        lastSignatureRef.current = signature;
        setSuggestion(result);
      } catch (e: unknown) {
        const msg =
          typeof e === 'object' && e !== null && 'message' in e && typeof (e as Error).message === 'string'
            ? (e as Error).message
            : 'Analysis failed. Try again.';
        setError(msg);
        setSuggestion(null);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const clearError = useCallback(() => setError(null), []);

  const reset = useCallback(() => {
    setSuggestion(null);
    setError(null);
    setIsLoading(false);
    cachedRef.current = null;
    lastSignatureRef.current = '';
  }, []);

  const getField = useCallback(
    (field: ListingField): FieldSuggestion | null => {
      if (!suggestion) return null;
      return suggestion.fields.find((f) => f.field === field) ?? null;
    },
    [suggestion],
  );

  return { suggestion, isLoading, error, analyze, clearError, reset, getField };
}
