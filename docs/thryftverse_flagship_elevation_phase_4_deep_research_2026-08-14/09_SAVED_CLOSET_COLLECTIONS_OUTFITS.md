# Saved / Closet / Collections / Outfits

## Code surfaces inspected / affected

- `frontend/src/screens/ClosetScreen.tsx`
- `frontend/src/components/closet/ClosetMediaMosaic.tsx`
- `frontend/src/screens/CollectionDetailScreen.tsx`
- `frontend/src/components/profile/MoodboardCollectionGrid.tsx`
- `frontend/src/screens/OutfitBuilderScreen.tsx`

## Current diagnosis


Closet currently supports `Saved | Wishlist | Collections | Outfits`, local search, sort, price-drop filtering, brand filters and aggregate value/savings stats.

Functionally rich; visually it risks becoming a management dashboard rather than a personal visual memory space.


## User psychology / product job


Saved content is emotional and future-oriented:
- “I may buy this.”
- “This inspires me.”
- “I want these together.”
- “Tell me if the price changes.”

The first interaction should therefore be rediscovery, not statistics.


## Flagship target composition


Recommended IA:
- top level: `Saved` and `Collections`.
- Wishlist becomes a meaningful filter/state inside Saved if product semantics allow, or keep only if the distinction has a strong transaction meaning.
- Outfits/Looks live as visual user-created collections rather than an equal inventory tab where possible.
- price drops appear as an attention strip/section when present.


## Detailed implementation map


1. Remove total-value/savings stats from the default first viewport; move to optional Insights.
2. Collections use 2x2 or asymmetrical cover mosaics, title + count + privacy/collaboration.
3. Saved grid defaults to pure visual density.
4. Search bar appears sticky only for sufficiently large saved libraries or after pull-down/tap search.
5. Brand filtering moves into Filters.
6. Price drops becomes a contextual `Price drops (N)` section or filter surfaced only when N>0.
7. Multi-select/manage mode is entered intentionally; do not permanently show management chrome.
8. Collection reorder uses direct drag with lift/elevation/haptic; no “move up/down” button list.
9. Empty collection invites Save/Add from marketplace rather than generic empty graphic.
10. Board/collection detail gets a large cover composition then media grid, inspired by the provided Pinterest board reference.


## Micro-detail pass


- Board titles need stronger typography and more whitespace than item metadata.
- Avoid count pills when simple `24 items` text works.
- Saved item tiles can show price only on tap/overlay if visual density target requires.
- Collection covers should preserve user visual identity instead of every cover using the same radius/height.


## Acceptance / screenshot QA


Capture:
- 100+ saved items;
- 0;
- 1;
- price drops;
- collections with 1/4/20 items;
- Outfits;
- manage mode.

Pass:
- no stats card before visual content;
- board covers are recognizable without reading;
- control density remains low when no filter is active.


## Reference crosswalk


- Pinterest boards/reference capture: mosaics carry identity.
- Vinted/Depop: saved intent and pricing relevance should be actionable, not dashboardized.
