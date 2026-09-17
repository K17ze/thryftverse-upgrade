import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BROWSE_FILTERS,
  activateBrowseContextPatch,
  updateContextPatch,
  resetContextPatch,
  type BrowseFilterContextState,
} from '../store/browseFilterContexts';

function makeState(overrides?: Partial<BrowseFilterContextState>): BrowseFilterContextState {
  return {
    browseContextKey: 'default',
    browseFiltersByContext: {},
    browseFilters: { ...DEFAULT_BROWSE_FILTERS },
    ...overrides,
  };
}

describe('browse filter context isolation', () => {
  it('writes the active context bucket and mirrors it into browseFilters', () => {
    let state = makeState({ browseContextKey: 'browse:women' });
    const patch = updateContextPatch(state, 'browse:women', { brands: ['Nike'] });
    state = { ...state, ...patch };

    expect(state.browseFilters.brands).toEqual(['Nike']);
    expect(state.browseFiltersByContext['browse:women'].brands).toEqual(['Nike']);
  });

  it('activating another context restores its own bucket — no leakage', () => {
    let state = makeState({ browseContextKey: 'browse:women' });
    state = { ...state, ...updateContextPatch(state, 'browse:women', { brands: ['Nike'], priceMin: 50 }) };

    const activate = activateBrowseContextPatch(state, 'browse:mens');
    expect(activate).not.toBeNull();
    state = { ...state, ...activate! };

    // Mens bucket never existed → fresh defaults, women's filters absent.
    expect(state.browseFilters.brands).toEqual([]);
    expect(state.browseFilters.priceMin).toBeNull();
    expect(state.browseContextKey).toBe('browse:mens');
  });

  it('returning to a prior context restores that context\'s filters', () => {
    let state = makeState({ browseContextKey: 'browse:women' });
    state = { ...state, ...updateContextPatch(state, 'browse:women', { brands: ['Nike'] }) };
    state = { ...state, ...activateBrowseContextPatch(state, 'browse:mens')! };
    state = { ...state, ...activateBrowseContextPatch(state, 'browse:women')! };

    expect(state.browseFilters.brands).toEqual(['Nike']);
  });

  it('targeted writes land in the named bucket without touching the active view', () => {
    let state = makeState({ browseContextKey: 'discovery' });
    state = { ...state, ...updateContextPatch(state, 'browse:search', { query: 'boots', brands: ['Dr. Martens'] }) };

    expect(state.browseFiltersByContext['browse:search'].query).toBe('boots');
    // Active view untouched — discovery keeps its own filters.
    expect(state.browseFilters.query).toBe('');
  });

  it('targeted write to the ACTIVE context mirrors into browseFilters', () => {
    let state = makeState({ browseContextKey: 'search' });
    state = { ...state, ...updateContextPatch(state, 'search', { condition: 'New with tags' }) };

    expect(state.browseFilters.condition).toBe('New with tags');
    expect(state.browseFiltersByContext.search.condition).toBe('New with tags');
  });

  it('resetting the active context clears both the view and its bucket', () => {
    let state = makeState({ browseContextKey: 'browse:women' });
    state = { ...state, ...updateContextPatch(state, 'browse:women', { sizes: ['M'] }) };
    state = { ...state, ...resetContextPatch(state, 'browse:women') };

    expect(state.browseFilters.sizes).toEqual([]);
    expect(state.browseFiltersByContext['browse:women'].sizes).toEqual([]);
  });

  it('activating the already-active context is a no-op', () => {
    const state = makeState({ browseContextKey: 'browse:women' });
    expect(activateBrowseContextPatch(state, 'browse:women')).toBeNull();
  });
});
