import { useState, useRef, useEffect } from 'react';
import {
  fetchAutocompleteSuggestions,
  type AutocompleteSuggestion,
} from '../../services/searchAutocompleteApi';

/**
 * Owns tag autocomplete state and the debounced fetch effect.
 * Takes the current tag input query and returns suggestions plus
 * visibility control for the autocomplete dropdown.
 */
export function useTagAutocomplete(query: string) {
  const [tagSuggestions, setTagSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [tagSuggestionsVisible, setTagSuggestionsVisible] = useState(false);
  const tagDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (tagDebounceRef.current) clearTimeout(tagDebounceRef.current);
    if (trimmed.length < 2) {
      setTagSuggestions([]);
      return;
    }
    tagDebounceRef.current = setTimeout(() => {
      fetchAutocompleteSuggestions(trimmed, undefined, 5).then((res) => {
        setTagSuggestions(res.suggestions.slice(0, 5));
      });
    }, 300);
    return () => {
      if (tagDebounceRef.current) clearTimeout(tagDebounceRef.current);
    };
  }, [query]);

  return {
    tagSuggestions,
    tagSuggestionsVisible,
    setTagSuggestionsVisible,
    setTagSuggestions,
  };
}
