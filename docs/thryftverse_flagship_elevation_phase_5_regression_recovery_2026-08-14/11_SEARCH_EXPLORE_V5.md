# Search & Explore V5

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Preserve

Phase 4’s direction toward one global search experience remains sound.

## Fix role confusion

Explore is discovery.
Search is high intent.

The current product can still expose content taxonomies and filters too early.

## Explore first viewport

```text
Explore
[ Search items, brands & people   camera ]

Discover     Looks     Pulse

[first media]
```

If usage data does not justify all modes, integrate low-frequency modes into modules rather than permanent tabs.

## Search idle

- recent;
- saved searches;
- Browse categories;
- visual search.

Never label static category slices “Trending”.

## Search result card

Unlike Home:
a result can be slightly denser because user intent is explicit.

Show:
- media;
- product identity;
- price;
- relevant query-match fact if useful.

## Filter

Server-authoritative facets.
Only facets relevant to current result universe.

Do not show auction sort `Ending soon` for fixed-price results.

## Visual search

Image/region becomes source query.
Then allow:
- category;
- color;
- style;
- price;
- size.

No “AI” badge.

## Performance

- stale query cancellation;
- debounce network, not typing;
- cached prior result can render immediately;
- result grid dimensions known;
- no filter sheet causing full result unmount.

## Reference logic

Apple 2026 recommends one clearly identifiable search location and supports dedicated search/discovery areas.
Vinted says expressed query/filters, description and image resemblance are major recommendation/search parameters.
Depop says relevance has the biggest search-ranking impact.

Phase 5 should make data quality and filter correctness more important than decorative search chrome.
