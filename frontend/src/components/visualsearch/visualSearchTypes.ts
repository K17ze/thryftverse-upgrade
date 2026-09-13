// Shared types and facet vocabulary for VisualSearchScreen and its extracted
// hooks/components. Single source of truth so the screen, section components
// and hooks all agree on the retrieval contract.

export type ResultStatus = 'idle' | 'loading' | 'populated' | 'empty' | 'error' | 'offline' | 'partial';

// F08: Per-facet candidate counts returned by the backend (keyed by facet
// value). Null when the backend did not supply facet metadata (offline /
// cached fallback) so chips never show fabricated numbers.
export type VisualSearchFacetCounts = {
  colors: Record<string, number>;
  styles: Record<string, number>;
} | null;

// G11/F08: Color and style facets for visual search refinement.
// Facets are retrieval parameters — they are sent to the backend with the
// search request so the SQL candidate set itself is narrowed (honest text
// matching on title/description/brand/category, not image analysis). The
// response returns per-facet candidate counts which are shown on the chips.
// These lists are the shared vocabulary contract with the backend
// (COLOR_FACET_VALUES / STYLE_FACET_VALUES in routes/visualSearch.ts).
export const COLOR_FACETS = ['Black', 'White', 'Blue', 'Red', 'Green', 'Brown', 'Grey', 'Pink', 'Beige', 'Navy'] as const;
export const STYLE_FACETS = ['Vintage', 'Minimal', 'Streetwear', 'Y2K', 'Formal', 'Casual', 'Sportswear', 'Luxury'] as const;

// Filter + facet payload sent to POST /visual-search. Facets are retrieval
// parameters so the candidate set is narrowed server-side before ranking.
export interface VisualSearchFilterPayload {
  query?: string;
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  facets?: {
    color?: string;
    style?: string;
  };
  sort: 'similarity';
  limit: number;
}
