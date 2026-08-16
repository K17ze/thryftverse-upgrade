# Navigation, Search and global information architecture

## Code surfaces inspected / affected

- `frontend/src/navigation/TabNavigator.tsx`
- `frontend/src/navigation/AppNavigator.tsx`
- `frontend/src/screens/SearchScreen.tsx`
- `frontend/src/screens/GlobalSearchScreen.tsx`

## Current diagnosis


The bottom navigation is already relatively strong: five destinations, glass background, restrained labels, profile avatar. The largest conceptual problem is that the middle `Create` item is an **action disguised as a tab** and opens `CreateCamera` with `mode: 'look'`. Current Apple HIG explicitly frames tab bars as navigation, not actions; Android separates navigation destinations from a high-priority action.

Search is also split between:
- Explore tab landing;
- a search field that pushes GlobalSearch;
- Visual Search;
- local search in multiple departments.

This can work, but the distinction between **Explore** and **Search** must be made intentional.


## User psychology / product job


People need two different mental modes:

1. **browse without a known target** — inspiration;
2. **resolve a target quickly** — search.

A flagship IA does not make the user choose between multiple search implementations. It gives one global search concept and allows local filtering where context is unambiguous.


## Flagship target composition


### Compact phone
Bottom navigation:
- Home
- Explore
- Inbox
- Profile

Creation becomes a single detached action/floating accessory, or remain center if product strategy requires it but it must not adopt tab-selection semantics.

Explore landing:
- search field;
- visual-search camera affordance;
- editorial discovery content.

When search receives focus:
- recents/saved searches;
- predictive suggestions;
- scope appears after intent is known;
- keyboard/search field behave as one continuous experience.

### Expanded
- navigation rail;
- Explore/Search can become list/detail or discovery/content panes.


## Detailed implementation map


1. Change Create navigation semantics. Options in preference order:
   - attached central creation accessory distinct from nav selection;
   - top-level creation button in Home/Explore toolbars;
   - if existing center placement is retained, prevent it from behaving like a route tab and persist last-used creation mode instead of silently defaulting to Look.
2. Use one global search route/state model.
3. `SearchScreen` is renamed conceptually to Explore; `GlobalSearchScreen` becomes the focused/searching state of the same product.
4. Introduce a shared `SearchIntentState`:
   - idle discovery
   - focused
   - typing
   - results
   - scoped results
5. Local search (Closet, Inbox, Co-Own) must visually declare local scope through placeholder/title and never masquerade as global search.
6. On iOS, investigate semantic search-tab/system search placement rather than hand-reproducing all behavior.
7. On large Android, move bottom nav to rail and allow supporting panes.


## Micro-detail pass


- Remove redundant “Explore” heading when the route/navigation already supplies context unless it meaningfully anchors an editorial page.
- Search field should not sit beside multiple same-weight utility buttons.
- Camera visual-search affordance: icon-only is sufficient with accessibility label.
- Search transitions: field should maintain geometry between Explore and result state where possible.
- Keyboard dismissal should restore the prior discovery scroll position.
- Search scope tokens appear below the field only after query/focus.


## Acceptance / screenshot QA


Required screenshots:
- Explore untouched;
- search focused + keyboard;
- search with query;
- items scope;
- people scope;
- visual search entry;
- empty/no-result;
- iOS current;
- small Android;
- expanded/tablet.

Pass criteria:
- exactly one obvious global search entry;
- Create never appears selected as a content destination;
- no duplicated search headers;
- Search can be operated one-handed;
- filtering never feels like a second product.


## Reference crosswalk


- Apple Search Fields 2026: dedicated search areas support rich discovery; immediate search and suggestions.
- Apple Tab Bars 2026: navigation, not arbitrary actions.
- Android 2026: primary navigation 3–5 destinations; high-priority actions separate.
- Pinterest: discovery and image-as-query.
