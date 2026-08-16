# Co-Own Hub, Galleria and Portfolio

## Code surfaces inspected / affected

- `frontend/src/screens/SyndicateHubScreen.tsx`
- `frontend/src/screens/GalleriaScreen.tsx`
- `frontend/src/screens/PortfolioScreen.tsx`
- `frontend/src/components/coown/*`

## Current diagnosis


Co-Own currently has two overlapping discovery personalities:
- Hub: market highlights, Active/New Issues/Watchlist, positions, instruments, search/sort.
- Galleria: editorial hero, curated collections, featured asset masonry, editorials.

This is an opportunity rather than a defect, but the two surfaces need distinct jobs. Hub can be the market; Galleria can be the culture/catalogue.


## User psychology / product job


Fractional ownership has two psychological barriers:
1. desire/understanding of the object;
2. financial/legal confidence.

Galleria should solve #1.
Hub/Asset/Due Diligence should progressively solve #2.


## Flagship target composition


### Galleria
Museum/editorial discovery:
- one strong hero;
- curated collection rail;
- featured objects;
- editorials.

### Hub
Market utility:
- portfolio entry;
- watchlist;
- active/new issues;
- concise search/sort;
- instrument grid.

Do not duplicate the same “featured assets” experience in both.


## Detailed implementation map


1. Give Galleria a dedicated editorial type scale and larger media rhythm than generic discovery.
2. Remove excessive rounded cards from editorial list; images + text + whitespace.
3. Hub highlights should be smaller/transactional than Galleria hero.
4. Your Positions rail remains close to top when holdings exist.
5. Hub header: Portfolio and Activity can become one account/portfolio destination plus overflow.
6. Sort does not need an expanded permanent control; one compact sort.
7. Instrument card should communicate:
   - title;
   - per-unit price;
   - availability/allocation;
   one status.
8. Galleria collection cards should not all be fixed 200×260 if images/curation deserve variable editorial treatment.
9. Portfolio should lead with total position only if valuation is reliable; individual holdings media remains visible.
10. Never fabricate market movement to make cards lively.


## Micro-detail pass


- Galleria eyebrow labels used sparingly; “EDITORIAL” on every item becomes repetitive.
- Valuation is secondary to title/media in Galleria.
- Allocation bars only in market context, never on editorial collection covers.


## Acceptance / screenshot QA


Pass:
- user can explain “Galleria vs Co-Own Market” instantly.
- no surface duplicates the other's first two modules.
- holding state is reachable in ≤1 tap from Hub.


## Reference crosswalk


- Pinterest editorial/collection reference for Galleria.
- Rally-style collectible storytelling logic: object desire before market mechanics.
