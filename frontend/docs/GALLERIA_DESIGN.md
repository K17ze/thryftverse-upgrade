# Galleria — Editorial Discovery Surface

> The Galleria is ThryftVerse's editorial discovery surface for Co-Own assets and curated collections. It is the documented differentiator — per AGENTS.md §6, the #1 recommended expansion department.

---

## 1. Concept & Purpose

The Galleria is **not a product grid**. It is an authored editorial experience that combines:

- **Pinterest's visual discovery** — masonry grid with 8pt gutters, media as the primary color anchor
- **Grailed's staff picks** — human curation highlighting underpriced or significant pieces
- **Depop's moodboard collaging** — collections as visual stories, not just item buckets
- **A museum gallery's curation** — provenance, story, and context as first-class citizens

The Galleria exists because discovery and curation are different things. Discovery shows you everything. Curation shows you what matters. In a marketplace where Co-Own assets can range from a £6,000 Bottega Veneta briefcase to a £64,000 Cartier Tank Cintrée, the user needs a guide — not an infinite scroll.

### What the Galleria solves

1. **Editorial context** — Every asset has a story (provenance, significance, cultural context). The Galleria is where that story is told.
2. **Curated collections** — Human curators group assets by theme, era, or aesthetic, giving users an entry point beyond category browsing.
3. **Co-Own discovery** — The Galleria surfaces Co-Own assets in a premium context, reinforcing that fractional ownership is about owning a share of a story, not just a financial instrument.
4. **Visual inspiration** — The masonry grid and editorial imagery make the Galleria a place to browse for inspiration, not just to shop.

---

## 2. Competitive Differentiation (2026 Analysis)

| Competitor | Feature | Galleria's Differentiation |
|---|---|---|
| **Poshmark** | "Guided Discovery" with editorial curation | Galleria goes beyond guided discovery — it combines editorial long-form content with Co-Own fractional ownership, making high-value assets accessible. |
| **Grailed** | "Staff Picks" highlighting underpriced items | Galleria's curated collections are authored by named curators with avatars and profiles, not anonymous staff picks. Each collection has a theme and editorial context. |
| **Depop** | "Outfits" moodboard-style collaging | Galleria's collections are thematic (Heritage, Modernist, Quiet Luxury) rather than outfit-based, serving a collector mindset rather than a styling mindset. |
| **Pinterest** | Masonry grid with 8px gutters, two-radius system | Galleria adopts Pinterest's masonry geometry but elevates it with editorial overlays, gradient scrims, and a strict surface/radius/text budget per AGENTS.md §4. |

### Key differentiators

1. **Co-Own integration** — No competitor combines editorial curation with fractional ownership. The Galleria makes high-value collectibles accessible at a fraction of the cost.
2. **Named curators** — Collections are authored by identifiable curators, building trust and editorial authority.
3. **Provenance-first** — Every featured asset includes a story/provenance note, not just a title and price.
4. **Editorial depth** — Long-form editorial pieces provide context that no competitor offers alongside discovery.

---

## 3. Design Decisions

### Media-first composition (AGENTS.md §4)

The Galleria is a discovery surface, so **media is the primary color anchor**. Surfaces recede behind photography:

- The hero editorial card uses a full-bleed image with a gradient scrim for text legibility — no card panel.
- Collection rail cards use cover images with gradient overlays — the image is the card.
- Featured asset tiles are image-dominant with minimal metadata below.
- The background is the canvas color (`colors.background`), not a surface fill.

### Surface budget

Above the fold, the Galleria has **one dominant non-media panel**: the hero editorial card. The collections rail below it is media-dominant. No grey surfaces wrap the sections — flat canvas, spacing, and hairlines are the utility structure.

### Radius budget

Two non-avatar radius sizes are used:
- **Radius.xl (16pt)** — hero editorial card, Galleria preview card on HomeScreen
- **Radius.lg (12pt)** — collection rail cards, featured asset tiles, editorial list item heroes

### Text budget

The first viewport uses three type sizes:
- **Type.title (24pt bold)** — hero editorial title
- **Type.subtitle (17pt bold)** — collection card titles, editorial list titles
- **Type.caption (12pt medium)** — metadata, author, read time

Plus one eyebrow: **Type.meta (11pt semibold, uppercase)** — section labels ("CURATED COLLECTIONS", "FEATURED ASSETS", "EDITORIAL").

### Masonry grid (Pinterest-style)

The featured assets section uses a true masonry layout:
- 2-column grid with 8pt gutters (`MASONRY_GAP = 8`)
- Items assigned to the shortest column by cumulative height (not simple alternation)
- Each asset's `aspectRatio` drives the image height, creating visual rhythm
- No card-on-card composition — tiles are flat on the canvas

### Hairline separators

Editorial list items are separated by `StyleSheet.hairlineWidth` lines, not borders or card surfaces. This follows AGENTS.md §4 stroke grammar: separators are hairlines.

### No card-on-card composition

Every media surface sits directly on the canvas. Metadata appears below or overlaid on the image via gradient scrim — never in a nested card.

---

## 4. Screen Architecture

### GalleriaScreen (`src/screens/GalleriaScreen.tsx`)

The main discovery surface, structured as four sections in a single ScrollView:

1. **Hero editorial** — Full-width 16:10 card with title overlaid on image. The dominant first-viewport object.
2. **Curated Collections rail** — Horizontal scroll of 200pt-wide collection cards. Each card shows cover image, theme, title, and curator avatar.
3. **Featured Assets** — 2-column masonry grid of Co-Own assets. Each tile shows image, collection name, title, and valuation.
4. **Editorial** — Vertical list of editorial pieces. Each item shows 16:9 hero image, title, excerpt, author avatar, and read time. Hairline separators between items.

### GalleriaCollectionDetailScreen (`src/screens/GalleriaCollectionDetailScreen.tsx`)

The collection detail screen, opened when a user taps a collection from the rail:

- **Parallax hero header** — Collection cover image with parallax scroll effect (image translates slower than scroll, scales on overscroll). Title, subtitle, theme, and curator overlaid via gradient scrim.
- **Floating header** — Fades in as the hero scrolls under, showing the collection title with a back button.
- **Masonry items grid** — 2-column masonry of the collection's items, same geometry as the Galleria's featured assets.
- **Shared transition tag** — `galleria-collection-{id}` on the hero image for smooth shared-element transitions from the rail card.

### HomeScreen Galleria section

A non-disruptive entry point on the HomeScreen footer:
- Shows the hero editorial's image as a preview card (16:10, same geometry as the Galleria hero)
- "GALLERIA" eyebrow + "Editorial Discovery" title via `DiscoverySectionHeader`
- "Explore Galleria" CTA button that navigates to the Galleria screen
- Appears after the main feed, before the loading-more indicator

---

## 5. Service Architecture

### `src/services/galleriaApi.ts`

A mock-ready service following the same pattern as `liveShoppingApi.ts`:

**Types:**
- `GalleriaCollection` — curated collection (id, title, subtitle, curator, coverImage, theme, publishedAt, itemIds, isDemo)
- `GalleriaEditorial` — editorial piece (id, title, excerpt, heroImage, author, publishedAt, readTime, content[], isDemo)
- `GalleriaFeaturedAsset` — featured Co-Own asset (id, title, valuation, image, collection, story, aspectRatio, isDemo)
- `GalleriaCollectionDetail` — collection + resolved items

**Functions:**
- `fetchGalleriaCollections()` — returns collections sorted by most recently published
- `fetchGalleriaEditorials()` — returns editorials sorted by most recently published
- `fetchFeaturedAssets()` — returns featured Co-Own assets
- `fetchCollectionDetail(id)` — returns a single collection with its resolved items

**Mock data:**
- 6 collections (The Archive Vault, Modernist Objects, Quiet Luxury, The Watch Department, Sculptural Form, The Leather Atelier)
- 4 editorials (provenance, quiet luxury, horology, sculpture)
- 8 featured assets (watches, bags, furniture, ceramics, silverware)
- All mock data carries `isDemo: true` per AGENTS.md §11
- `GALLERIA_DEMO_MODE = true` flag controls the demo banner

**Mock-ready pattern:**
- Functions simulate network latency via `delay()` for honest loading states
- When a real backend is wired, set `GALLERIA_DEMO_MODE = false` and replace the mock branches with real fetch calls
- The UI layer does not need to change — it consumes the same types and function signatures

---

## 6. State Coverage (AGENTS.md §14)

Both screens implement full state coverage:

| State | GalleriaScreen | GalleriaCollectionDetailScreen |
|---|---|---|
| **Loading** | Skeleton placeholders (hero, rail, masonry, editorial) | Skeleton masonry + hero image |
| **Populated** | Full editorial experience | Collection hero + items masonry |
| **Empty** | "The Galleria is being curated" empty state | "No pieces in this collection yet" |
| **Error** | "Galleria unavailable" with retry CTA | "Collection unavailable" with retry CTA |
| **Offline** | Offline banner ("Offline — showing cached Galleria content") | Offline banner |
| **Not found** | N/A (list screen) | "Collection not found" with back CTA |
| **Refreshing** | Pull-to-refresh with haptic feedback | Pull-to-refresh with haptic feedback |

---

## 7. Accessibility

All interactive elements include:
- `accessibilityRole="button"` on all tappable cards and CTAs
- `accessibilityLabel` describing the content (e.g., "Collection: The Archive Vault")
- `accessibilityHint` describing the navigation action (e.g., "Opens the collection detail")
- Haptic feedback on every tap via `useHaptic().selection()`

---

## 8. Navigation

### Routes (RootStackParamList)
- `Galleria` — undefined params, pushed screen
- `GalleriaCollectionDetail` — `{ collectionId: string }`, pushed screen

Both routes are registered in `AppNavigator.tsx` with lazy `getComponent` for code splitting.

### Entry points
1. **HomeScreen footer** — Galleria preview section with "Explore Galleria" CTA
2. **Direct navigation** — Any screen can `navigation.navigate('Galleria')`

### Flow
```
HomeScreen → Galleria → GalleriaCollectionDetail → ItemDetail
```

---

## 9. Future Expansion

### Near-term
- **Real API integration** — Replace mock data with a CMS-driven editorial API. Set `GALLERIA_DEMO_MODE = false`.
- **Editorial reader screen** — A dedicated long-form reading experience for editorial pieces (currently acknowledged via haptic; the content is ready in `GalleriaEditorial.content[]`).
- **Curator profiles** — Tapping a curator's avatar navigates to a curator profile showing their collections and bio.
- **Personalisation** — Curator following, themed recommendations based on browsing history.

### Medium-term
- **Saved articles** — Bookmark editorials for later reading.
- **Collection following** — Get notified when a curator adds to a followed collection.
- **Co-Own CTA integration** — Direct "Co-Own this" action from featured asset cards, navigating to the trade flow.
- **Search within Galleria** — Search collections, editorials, and featured assets.

### Long-term
- **Video editorials** — Short-form video content from curators, embedded in the editorial list.
- **Virtual exhibitions** — Themed online exhibitions with guided navigation through a collection.
- **Curator-generated content** — Allow verified curators to publish collections and editorials directly from the app.
- **Auction integration** — Surface upcoming auctions for assets featured in the Galleria.
