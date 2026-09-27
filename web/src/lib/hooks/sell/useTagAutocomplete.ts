'use client';

/**
 * useTagAutocomplete — debounced tag suggestions for the sell flow.
 * Ports frontend/src/hooks/sell/useTagAutocomplete.ts: the mobile hook
 * debounces a query against the search-autocomplete service; the web
 * fixture mode resolves the same contract from the local tag taxonomy.
 */

import { useEffect, useRef, useState } from 'react';
import { matchTagSuggestions } from './tagTaxonomy';

const TAG_DEBOUNCE_MS = 250;

export function useTagAutocomplete(query: string, taken: readonly string[]) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setSuggestions(matchTagSuggestions(query, taken));
    }, TAG_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, taken]);

  return { suggestions, setSuggestions };
}
