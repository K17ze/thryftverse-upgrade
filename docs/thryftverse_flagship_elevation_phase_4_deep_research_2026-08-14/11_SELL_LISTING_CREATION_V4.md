# Sell / listing creation

## Code surfaces inspected / affected

- `frontend/src/screens/SellScreen.tsx`
- `frontend/src/components/listing/ListingMediaStudio.tsx`
- `frontend/src/components/listing/ListingModeSelector.tsx`
- `frontend/src/components/listing/ListingPublishFooter.tsx`
- `frontend/src/hooks/useListingAutofill.ts`

## Current diagnosis


Sell currently supports media queue/upload, autosave, listing modes, sold comps, autofill suggestions, quality tips, photo guide, tags, shipping, auction and Co-Own extensions.

This is operationally impressive but can become a “smart form cockpit.” Quality bars, tips, suggestions and mode extensions can make ordinary listing feel harder than competitors.


## User psychology / product job


Seller psychology is effort minimization plus uncertainty reduction.

The workflow should silently answer:
- Are my photos good enough?
- What do I have to fill?
- What should I price it at?
- Am I missing anything that will hurt trust/search?
- Can I leave and come back?

Guidance should appear **at the field where it helps**, not as a gamified score.


## Flagship target composition


Flow:
1. Media.
2. Item facts.
3. Price.
4. Delivery.
5. Review/publish.

Auction/Co-Own are mode-specific branches only after core identity/media are established.

Autosave is invisible except recovery/brief reassurance.


## Detailed implementation map


1. Media studio is the visual hero of creation.
2. First image has explicit `Cover` role and drag reorder.
3. Encourage flaw/authenticity photos contextually based on category/condition/luxury flag.
4. Video gets one clear Add video affordance; do not treat as separate advanced workflow.
5. Replace persistent generic `quality score` with contextual unresolved checks:
   - `Add a photo of the flaw`
   - `Size is missing`
   - `Brand helps buyers find this`
6. Autofill is a suggested field value, not an “AI card.”
7. Suggested price appears directly below price as sold-comparable range with sample size/source.
8. Never auto-apply seller-critical facts without review.
9. Listing mode selector:
   - Sell now
   - Auction
   - Co-Own
   must explain consequences only when selected.
10. Separate auction-specific reserve/duration fields after core listing facts.
11. Co-Own should hand off into specialist issuance flow rather than inflate Sell.
12. Publication stages stay internal; visible state `Publishing…`.
13. Draft restore must reconstruct media ordering/status exactly.
14. Remove 350–1500ms forced “saved/refresh” theatre where not needed; only use delays for perceivable state continuity if measured.


## Micro-detail pass


- Photo guide collapsed by default; contextual tips overlay/inline.
- Field sections use flat form rows and whitespace.
- No row of tag pills unless tags are genuinely part of marketplace search.
- Character counters appear near limit, not permanently if not useful.
- Required markers only where ambiguity exists.


## Acceptance / screenshot QA


Test 5 listing types:
- basic apparel;
- luxury bag/auth evidence;
- flawed used item;
- auction;
- Co-Own handoff.

Pass:
- ordinary fixed-price listing can be completed without seeing auction/Co-Own complexity;
- missing trust-critical details are caught before publish;
- guidance never feels like a scorecard.


## Reference crosswalk


- eBay: media/video + simple consistent listing information.
- Depop: drafts, sold-comp suggested range, accurate description/media.
- Vinted: full-view first photo and explicit flaw/authenticity evidence.
