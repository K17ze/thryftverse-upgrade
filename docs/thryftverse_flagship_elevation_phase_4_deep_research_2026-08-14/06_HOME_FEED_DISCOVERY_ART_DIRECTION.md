# Home feed — art-directed commerce discovery

## Code surfaces inspected / affected

- `frontend/src/screens/HomeScreen.tsx`
- `frontend/src/components/ProductCardV2.tsx`
- `frontend/src/components/discover/PinterestMasonryGrid.tsx`
- `frontend/src/platform/product`

## Current diagnosis


Home has accumulated many correct systems: personalized For You, Following, masonry, Poster/Look content, media playback, listings, recommendations. The main remaining quality gap is **feed rhythm** and metadata density.

Current masonry listing presentation can carry image, title, price, seller avatar/handle and additional signals. A Pinterest-quality feed lets imagery carry more of the decision. The current Home header also introduces an “Explore” section inside Home, while Explore is already a top-level destination.


## User psychology / product job


The first job of Home is not “show all feature families.” It is:

> make the next interesting object obvious enough to stop the thumb.

Every extra line beneath a tile competes with that stop signal.

The user needs rapid visual recognition first, then commerce confidence after opening.


## Flagship target composition


Home should feel like one continuous authored feed with occasional deliberate interruptions:

- primary masonry/listing rhythm;
- sparse social/Poster entry;
- occasional Look/editorial block;
- contextual continuation rail only if it represents a different decision mode.

Avoid an endless stack of titled rails.

First screen should be at least ~70% content/media by area on a typical phone.


## Detailed implementation map


1. Create `FeedVisualRhythmPlanner` that assigns display roles based on content semantics, not random or only `featured`.
2. Roles:
   - standard masonry;
   - tall editorial;
   - paired Look;
   - Poster/social moment;
   - wide commerce editorial;
   - continuation.
3. Keep role assignment deterministic per feed response to avoid layout jumping.
4. Simplify standard tile metadata:
   - media;
   - one primary text line (title OR brand/product identity);
   - price;
   - optional one terse secondary fact.
   Seller identity appears only when it materially differentiates the item.
5. Seller avatar below every standard tile should be removed or reserved for creator/curated content.
6. Delete or rename the redundant inner `Explore` heading.
7. For You / Following: make it a quiet top scope, not another heavy component below a section heading.
8. Poster/story lane:
   - increase emotional/media presence;
   - reduce “tiny thumbnail rail” feel;
   - consider horizontal 9:16 cards with enough width to recognize content.
9. Video autoplay remains one-player; use first-frame poster and no spinner flash on fast scroll.
10. Insert recommendations based on interaction session, not every fixed N items when possible.


## Micro-detail pass


- Price typography must be visually quieter than imagery but stronger than metadata.
- Avoid active-dot, badges and favorite icons all appearing on every tile.
- Use heart/save on reveal, long press, or detail if feed becomes visually overloaded.
- Use subtle skeletons with exact final media geometry.
- Failed media should retain space without generic giant image icon.
- No repeated entrance animation after every pagination batch.


## Acceptance / screenshot QA


Screenshot 5 consecutive viewport lengths, not only top screen.

Review:
- repeated shapes;
- consecutive identical card heights;
- title wrapping;
- seller avatar repetition;
- content/chrome ratio;
- one-hand stop points;
- video/media consistency.

Pass:
- user can identify each listing visually in <1s;
- no two adjacent feed insertions feel like the same templated module;
- at most one titled rail visible in any typical viewport.


## Reference crosswalk


- Pinterest reference captures: media-dominant discovery, asymmetric collections, sparse headings.
- Depop/Vinted: relevance and accurate item metadata drive discovery.
- Pinterest 2026: recommendation/relevance should reduce effort rather than add UI.
