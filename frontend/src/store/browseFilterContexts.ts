import type { BrowseFilterState } from './useStore';

export const DEFAULT_BROWSE_FILTERS: BrowseFilterState = {
  query: '',
  sort: 'Recommended',
  brands: [],
  sizes: [],
  condition: 'Any',
  sustainableOnly: false,
  priceMin: null,
  priceMax: null,
};

export interface BrowseFilterContextState {
  browseContextKey: string;
  browseFiltersByContext: Record<string, BrowseFilterState>;
  browseFilters: BrowseFilterState;
}

/** Swap the active context. Returns null when the key is already active. */
export function activateBrowseContextPatch(
  state: Pick<BrowseFilterContextState, 'browseContextKey' | 'browseFiltersByContext'>,
  key: string,
): Pick<BrowseFilterContextState, 'browseContextKey' | 'browseFilters'> | null {
  if (state.browseContextKey === key) return null;
  return {
    browseContextKey: key,
    browseFilters: state.browseFiltersByContext[key] ?? { ...DEFAULT_BROWSE_FILTERS },
  };
}

/** Merge updates into a context bucket and mirror it into browseFilters
 *  when the target is the active context. `browseFilters` is absent when
 *  the target context is inactive — the active filter state is untouched. */
export function updateContextPatch(
  state: BrowseFilterContextState,
  key: string,
  updates: Partial<BrowseFilterState>,
): Pick<BrowseFilterContextState, 'browseFiltersByContext'> &
  Partial<Pick<BrowseFilterContextState, 'browseFilters'>> {
  const current =
    (key === state.browseContextKey ? state.browseFilters : state.browseFiltersByContext[key])
    ?? { ...DEFAULT_BROWSE_FILTERS };
  const next = { ...current, ...updates };
  const browseFiltersByContext = { ...state.browseFiltersByContext, [key]: next };
  return state.browseContextKey === key
    ? { browseFiltersByContext, browseFilters: next }
    : { browseFiltersByContext };
}

/** Reset a context bucket to defaults; mirrors into browseFilters when the
 *  target is active. `browseFilters` is absent when the target is inactive. */
export function resetContextPatch(
  state: BrowseFilterContextState,
  key: string,
): Pick<BrowseFilterContextState, 'browseFiltersByContext'> &
  Partial<Pick<BrowseFilterContextState, 'browseFilters'>> {
  const reset = { ...DEFAULT_BROWSE_FILTERS };
  const browseFiltersByContext = { ...state.browseFiltersByContext, [key]: reset };
  return state.browseContextKey === key
    ? { browseFiltersByContext, browseFilters: reset }
    : { browseFiltersByContext };
}
