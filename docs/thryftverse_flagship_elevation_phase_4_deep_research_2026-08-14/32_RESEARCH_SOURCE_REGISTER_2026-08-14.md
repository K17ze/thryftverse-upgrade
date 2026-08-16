# Research source register — August 2026

This folder was built against current source material retrieved on 2026-08-14 and against the user-supplied reference captures. The reference apps are treated as **behavioural and compositional benchmarks**, not as skins to copy.

## Apple — current 2026 HIG

### Search Fields — updated 8 June 2026
Key implications:
- Search may be a dedicated tab, a toolbar control, or inline.
- Start search as the user types when practical.
- Recent searches and predictive suggestions reduce effort.
- Search scopes/tokens belong in the result context, not as an unrelated filter universe.
- A dedicated search area is appropriate when browsing and search are tightly coupled.
- Search should have one clearly identifiable primary location across the app.

### Searching — updated 8 June 2026
Key implications:
- Search deserves a primary position when it is core to the product.
- Scope must remain obvious.
- Personal suggestions and recent searches can help, but search history must remain private/clearable.

### Tab Bars — updated 8 June 2026
Key implications:
- A tab bar represents top-level navigation, not arbitrary actions.
- It should remain structurally stable.
- On current iOS, the navigation layer floats above content and uses Liquid Glass.
- Search can have a semantic search-tab role.

### Materials / Liquid Glass
Key implications:
- Liquid Glass belongs to navigation/control chrome, not the content layer.
- Overusing glass inside content creates visual confusion.
- Accessibility settings such as Reduce Transparency and Increase Contrast must be respected.
- The reason to use the material is to make content primary, not to decorate the UI.

## Android — June 2026 current design guidance

### Layouts and navigation patterns — updated 17 June 2026
Key implications:
- Primary navigation: 3–5 top-level destinations.
- High-priority action: at most one prominent FAB-style action.
- Secondary actions belong in top bars or near their content.
- Additional actions belong in overflow.
- Large screens should adapt navigation rather than stretching a phone bar.

### Content composition and structure — updated 18 June 2026
Key implications:
- Start from hierarchy and a flexible grid.
- Use explicit containment only when it clarifies a true group.
- Whitespace can be containment.
- Editorial/detail views should use hierarchical grids; galleries can use modular/masonry grids.
- Image crop/focal behavior must be specified, not left accidental.

### Adaptive guidance
Key implications:
- Thryftverse cannot achieve production flagship quality if it is only tuned to one portrait phone.
- Test compact, medium, expanded, landscape, foldables and keyboard-constrained surfaces.
- Lists/details should become panes when space permits instead of simply getting wider.

## Pinterest — 2026

### Visual search / AWS expansion — 4 June 2026
Pinterest is continuing to invest in visual-search responsiveness and shopping discovery. The product lesson is not “add an AI button”; it is to make the **image itself a query surface**.

### Pinterest AI/shopping tools — 17 June 2026
Pinterest frames the shift around recommendation, relevance and action. The useful lesson for Thryftverse: intelligence should reduce decision effort and improve context, rather than add a decorative “AI layer.”

### Current visual-search model
Pinterest’s product language supports:
- image/object/region as search input;
- refinements around style, occasion, color and visual attributes;
- discovery continuing directly from content.

### Collage / shoppable composition pattern
Pinterest’s collage direction treats saved/products/cutouts as composable visual material. The important reference for Look is:
- source tray;
- direct manipulation;
- swap/reorder;
- commerce association that remains subordinate to the composition.

## Instagram / Meta — 2026

### Instants — 13 May 2026
Meta introduced a deliberately constrained camera-first sharing flow:
- open directly to camera;
- no gallery upload in this mode;
- no pre-share editing beyond caption;
- very small audience decision;
- replies/reactions after sharing;
- private archive/recap support.

Product lesson: **not every creator surface should expose the full editor**. A fast authentic path and a designed/studio path can coexist.

## Snapchat — current

### Multi Snap
- Multiple photo/video captures can be taken quickly.
- Users review and edit captures individually.
- Any capture can be removed before sending.

### Quick Cut
- Multiple photos/clips can immediately become a rendered video preview.
- The stated product objective is fewer creation steps.

### Timeline Editor / Long Snap
Current video editing supports:
- trim;
- split;
- duplicate;
- replace;
- speed;
- volume;
- crop/rotate;
- delete;
- reorder;
- timed text/sticker/sound layers.

Product lesson: temporal editing should become a timeline only when media is temporal; do not make every Poster user manage “layers/pages” as if using desktop software.

## eBay — current 2026

### Listing media
- Main photo drives search presentation.
- Multiple high-quality images are core listing evidence.
- Current listing tools support photos and video.
- Seller tooling keeps description formatting deliberately simple/consistent.

### Search/filtering
- Broad attribute filters are expected: brand, size, condition, format, delivery/returns, etc.
- Search and filter serve buyer intent; they are not independent destinations.

## Depop — current 2026

### Search ranking
Depop says query/listing relevance has the largest impact. Other factors include popularity, location, shopping habits, recency and seller information.

### Listing quality
Depop recommends:
- clear accurate descriptions;
- accurate brand/category information;
- multiple photos showing details/flaws;
- suggested pricing based on comparable sold items.

### Listing workflow
Current flow supports drafts and cross-device continuation. Product lesson: autosave should be invisible confidence, not a repeated “system status” event.

## Vinted — current 2026

### Recommendation/search
Current ranking uses item ontology including category, brand, size, color, listing photos and other attributes; condition, price, interactions, recency, seller type and expressed query/filters matter.

### Photo/condition guidance
Vinted emphasizes:
- full-item first image;
- clear authenticity/details;
- accurate condition;
- each flaw photographed and described;
- up to 20 informative photos.

Product lesson: listing quality should be taught contextually at the media/condition step, not by a generic gamified quality score.

## Whatnot — current 2026
Live auctions center:
- real-time countdown;
- bid mechanics;
- custom/max bid;
- pre-bid;
- automatic purchase for winner;
- explicit timer extension/sudden-death rules.

Product lesson: Auction UI should make **price + time + bidder state** dominant. Everything else is secondary while bidding is live.

---

# User-supplied reference captures

The supplied Pinterest/Instagram/Depop-style references consistently show:
- media occupying more of the viewport than app chrome;
- flat rows and whitespace instead of nested cards;
- large editorial headings used sparingly;
- restrained search/navigation;
- asymmetric visual collections/boards;
- identity and conversation lists that rely on avatar, image and typography more than borders;
- settings composed from grouped flat rows with hairlines;
- black/dark canvases that let imagery provide the visual color.

These captures are the direct visual target for this audit.
