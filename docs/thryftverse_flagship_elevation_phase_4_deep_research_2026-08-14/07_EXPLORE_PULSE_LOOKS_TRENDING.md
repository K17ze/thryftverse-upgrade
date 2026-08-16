# Explore — Discover, Pulse, Looks and trend architecture

## Code surfaces inspected / affected

- `frontend/src/screens/SearchScreen.tsx`
- `frontend/src/components/explore/PulseTab.tsx`
- `frontend/src/components/explore/LooksTab.tsx`
- `frontend/src/components/explore/EditTab.tsx`

## Current diagnosis


Explore currently has a four-way full-width segment:
`Discover | Pulse | Looks | Trending`.

This exposes Thryftverse's internal content taxonomy directly. Four equally weighted modes plus Search and Visual Search make the top of the screen control-heavy before the user sees content.


## User psychology / product job


Explore should answer “what is interesting right now?” not “which subsystem do you want?”

Users are more comfortable switching *content intent* than implementation type. Pulse and Trending are especially close psychologically: both imply what is happening now.


## Flagship target composition


Preferred:
- Search field;
- Discover feed as default;
- small secondary category/scope access;
- Looks and live/trending material integrated as authored modules.

Alternative if distinct modes are strategically essential:
- `Discover | Looks | Pulse`
- Trending becomes a section/sort within Discover/Pulse, not a fourth permanent tab.


## Detailed implementation map


1. Run analytics to validate use of all four segments.
2. Merge or demote low-frequency modes.
3. `EditTab` should not be called/edit-coded if visible meaning is Trending; rename code to the actual product concept.
4. Make Pulse event-based:
   - live auctions;
   - fresh drops;
   - price movement;
   - creator activity;
   not generic cards.
5. Looks becomes high-visual 4:5/portrait composition feed; avoid standard listing card chrome.
6. Discover uses masonry and category/visual-search cues.
7. Preserve scroll position separately per retained mode.
8. Use distinct empty states without huge generic illustration boxes.


## Micro-detail pass


- Segment indicator: text + underline or restrained segmented control, not four filled pills.
- Do not show item counts in top tabs unless count changes the decision.
- Pulse urgency color only for truly live/time-sensitive events.
- Looks should let the composition reach edges more often than marketplace tiles.


## Acceptance / screenshot QA


Capture:
- default Discover;
- Looks;
- Pulse;
- transition between modes;
- no content;
- loading;
- 320–360dp Android.

Pass:
- controls above first media use <25% of usable viewport;
- user can explain difference between retained modes without reading helper copy.


## Reference crosswalk


- Pinterest: discovery surface combines categories, boards and visual content without forcing content-type taxonomy first.
- Instagram: content families are strongly differentiated by format but primary browsing remains simple.
