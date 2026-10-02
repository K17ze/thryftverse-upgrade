'use client';

/**
 * VisualSearchFilterPanel — the member-added refinement surface beside the
 * detected-attribute chips. Web port of mobile's useVisualSearchFilters
 * fields (describe-text, category, brand, min/max price, colour facet,
 * style facet) with a draft → Apply/Clear grammar: fields edit a local
 * draft; Apply commits through the hook and re-runs the match — fixture
 * scores client-side before the result cap, live mode re-queries
 * POST /visual-search with the same fields.
 *
 * Count honesty: live mode shows the serve's own facetCounts (per-facet
 * candidate counts inside the retrieval scope); fixture mode tallies the
 * catalogue with the same predicates the match applies. No fabricated
 * tallies — absent counts render nothing.
 */

import { useEffect, useMemo, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { useCategoryDirectory } from '@/components/search/useCategoryDirectory';
import { brandFacets } from '@/components/search/facetCounts';
import { EMPTY_FILTERS, listingColourNames } from '@/components/filters/filterTypes';
import { DATA_MODE } from '@/lib/api/client';
import { LISTINGS } from '@/lib/data/fixtures';
import type { VisualSearchFacetCounts } from '@/lib/api/services/visualSearch';
import {
  COLOR_FACETS,
  COLOR_VOCAB,
  EMPTY_MANUAL_FILTERS,
  STYLE_FACETS,
  manualFiltersActive,
  type VisualSearchManualFilters,
} from './visualSearchTypes';

const FIELD =
  'h-11 w-full rounded-lg border border-border bg-input px-3.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none';

/** Category rail cap — mobile shows its top-8; the sidebar rail does too. */
const MAX_CATEGORY_OPTIONS = 8;
/** Brand suggestion row cap — mobile's brandSuggestions slice. */
const MAX_BRAND_SUGGESTIONS = 6;

const LIVE = DATA_MODE === 'live';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-label text-text-muted">{children}</h3>;
}

interface VisualSearchFilterPanelProps {
  /** Committed filters — the draft re-syncs to this whenever the committed
   *  set changes elsewhere (e.g. the empty state's "Clear added filters"). */
  committed: VisualSearchManualFilters;
  /** Live serve's per-facet counts — null in fixture mode / before a serve. */
  facetCounts: VisualSearchFacetCounts | null;
  /** Fixture-mode preview of the draft's result count; null when no honest
   *  preview exists (live mode — the serve's count isn't computable here). */
  previewCount: (draft: VisualSearchManualFilters) => number | null;
  onApply: (next: VisualSearchManualFilters) => void;
  onClear: () => void;
}

export function VisualSearchFilterPanel({
  committed,
  facetCounts,
  previewCount,
  onApply,
  onClear,
}: VisualSearchFilterPanelProps) {
  const { categories } = useCategoryDirectory();
  const [draft, setDraft] = useState<VisualSearchManualFilters>(committed);

  // External commits (Clear on the empty state, photo removal) re-seed the
  // draft — the panel never shows stale fields the matcher isn't running.
  useEffect(() => {
    setDraft(committed);
  }, [committed]);

  const patch = (p: Partial<VisualSearchManualFilters>) =>
    setDraft((d) => ({ ...d, ...p }));

  // ── Option vocabularies ────────────────────────────────────────────────
  // Departments ordered by real catalogue count (fixture: computed from
  // LISTINGS; live: the directory's server-computed count). Zero-count
  // departments stay hidden unless selected — a chip that can only produce
  // an empty set is clutter, not choice.
  const categoryOptions = useMemo(
    () =>
      [...categories]
        .sort((a, b) => b.count - a.count)
        .filter((c) => c.count > 0 || draft.category === c.slug)
        .slice(0, MAX_CATEGORY_OPTIONS),
    [categories, draft.category],
  );

  // Colour/style chip counts — live mode reads the serve's facetCounts;
  // fixture mode tallies the catalogue with the same predicates the match
  // applies (strict named-colour for colour, text haystack for style).
  const colourCounts = useMemo(() => {
    const map = new Map<string, number>();
    if (LIVE) {
      for (const c of facetCounts?.colors ?? []) map.set(c.value.toLowerCase(), c.count);
      return map;
    }
    for (const name of COLOR_FACETS) {
      const count = LISTINGS.filter((l) => listingColourNames(l).includes(name)).length;
      if (count > 0) map.set(name.toLowerCase(), count);
    }
    return map;
  }, [facetCounts]);

  const styleCounts = useMemo(() => {
    const map = new Map<string, number>();
    if (LIVE) {
      for (const s of facetCounts?.styles ?? []) map.set(s.value.toLowerCase(), s.count);
      return map;
    }
    for (const style of STYLE_FACETS) {
      const needle = style.toLowerCase();
      const count = LISTINGS.filter((l) =>
        `${l.title} ${l.description} ${l.brand ?? ''} ${l.category}`
          .toLowerCase()
          .includes(needle),
      ).length;
      if (count > 0) map.set(needle, count);
    }
    return map;
  }, [facetCounts]);

  // Brand suggestions — fixture catalogue's busiest brands. Live mode has
  // no local catalogue to derive from honestly, so the row stays out and
  // the text input carries the facet alone.
  const brandSuggestions = useMemo(
    () => (LIVE ? [] : brandFacets(LISTINGS, EMPTY_FILTERS).slice(0, MAX_BRAND_SUGGESTIONS)),
    [],
  );

  const swatchFor = (name: string) =>
    COLOR_VOCAB.find((c) => c.name.toLowerCase() === name.toLowerCase())?.rgb;

  const setPrice = (key: 'priceMin' | 'priceMax', raw: string) => {
    if (raw === '') {
      patch({ [key]: null });
      return;
    }
    const n = Number(raw);
    if (!Number.isNaN(n) && n >= 0) patch({ [key]: n });
  };

  const dirty =
    JSON.stringify(draft) !== JSON.stringify(committed);
  /** Enter inside any field commits the draft — desktop keyboard grammar;
   *  chips still need the explicit Apply/Show action below. */
  const applyOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && dirty) onApply(draft);
  };
  const anythingSet =
    manualFiltersActive(draft) || manualFiltersActive(committed);
  const preview = previewCount(draft);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-label text-text-muted">Refine further</h2>
        {anythingSet ? (
          <button
            type="button"
            onClick={() => {
              setDraft(EMPTY_MANUAL_FILTERS);
              onClear();
            }}
            className="pressable -mr-2 rounded-md px-2 py-1 text-caption font-medium text-text-secondary hover:text-text-primary"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="mt-2.5 space-y-4">
        <input
          type="text"
          value={draft.query}
          onChange={(e) => patch({ query: e.target.value })}
          onKeyDown={applyOnEnter}
          placeholder="Add words — e.g. vintage band tee"
          aria-label="Describe what you're looking for"
          className={FIELD}
        />

        {categoryOptions.length > 0 ? (
          <section>
            <SectionLabel>Category</SectionLabel>
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Category">
              <Chip
                selected={draft.category === null}
                onClick={() => patch({ category: null })}
              >
                All
              </Chip>
              {categoryOptions.map((c) => (
                <Chip
                  key={c.slug}
                  selected={draft.category === c.slug}
                  onClick={() =>
                    patch({ category: draft.category === c.slug ? null : c.slug })
                  }
                >
                  {c.name}
                  <span className="tnum opacity-60">{c.count}</span>
                </Chip>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <SectionLabel>Colour</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Colour">
            {COLOR_FACETS.map((name) => {
              const selected = draft.color === name;
              const rgb = swatchFor(name);
              const count = colourCounts.get(name.toLowerCase());
              return (
                <Chip
                  key={name}
                  selected={selected}
                  onClick={() => patch({ color: selected ? null : name })}
                >
                  {rgb ? (
                    <span
                      aria-hidden
                      className="h-3 w-3 rounded-full border border-border-subtle"
                      style={{
                        backgroundColor: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`,
                      }}
                    />
                  ) : null}
                  {name}
                  {count != null ? (
                    <span className="tnum opacity-60">{count}</span>
                  ) : null}
                </Chip>
              );
            })}
          </div>
        </section>

        <section>
          <SectionLabel>Style</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Style">
            {STYLE_FACETS.map((style) => {
              const selected = draft.style === style;
              const count = styleCounts.get(style.toLowerCase());
              return (
                <Chip
                  key={style}
                  selected={selected}
                  onClick={() => patch({ style: selected ? null : style })}
                >
                  {style}
                  {count != null ? (
                    <span className="tnum opacity-60">{count}</span>
                  ) : null}
                </Chip>
              );
            })}
          </div>
        </section>

        <section>
          <SectionLabel>Brand</SectionLabel>
          <input
            type="text"
            value={draft.brand}
            onChange={(e) => patch({ brand: e.target.value })}
            onKeyDown={applyOnEnter}
            placeholder="e.g. Levi's"
            aria-label="Brand"
            className={`${FIELD} mt-2`}
          />
          {brandSuggestions.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Brand suggestions">
              {brandSuggestions.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => patch({ brand: o.label })}
                  className="pressable rounded-md px-1 py-0.5 text-caption font-medium text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section>
          <SectionLabel>Price</SectionLabel>
          <div className="mt-2 flex items-center gap-2.5">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body text-text-muted">
                £
              </span>
              <input
                inputMode="decimal"
                value={draft.priceMin ?? ''}
                onChange={(e) => setPrice('priceMin', e.target.value)}
                onKeyDown={applyOnEnter}
                placeholder="Min"
                aria-label="Minimum price"
                className={`${FIELD} pl-7`}
              />
            </div>
            <span className="text-text-muted" aria-hidden>
              –
            </span>
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body text-text-muted">
                £
              </span>
              <input
                inputMode="decimal"
                value={draft.priceMax ?? ''}
                onChange={(e) => setPrice('priceMax', e.target.value)}
                onKeyDown={applyOnEnter}
                placeholder="Max"
                aria-label="Maximum price"
                className={`${FIELD} pl-7`}
              />
            </div>
          </div>
        </section>
      </div>

      <button
        type="button"
        disabled={!dirty}
        onClick={() => onApply(draft)}
        className="pressable mt-4 flex h-11 w-full items-center justify-center rounded-lg bg-brand text-body font-semibold text-text-inverse disabled:opacity-50"
      >
        {preview != null ? (
          <span className="tnum">Show {preview} match{preview === 1 ? '' : 'es'}</span>
        ) : (
          'Apply filters'
        )}
      </button>
    </div>
  );
}
