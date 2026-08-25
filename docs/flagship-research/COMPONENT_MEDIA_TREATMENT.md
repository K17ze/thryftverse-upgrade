# ThryftVerse Flagship Upgrade — Media Treatment & Art Direction

> **Document class:** Component-level flagship research (Design.md-style)
> **Surface scope:** Every media-bearing surface in ThryftVerse — feed, masonry discovery, product hero, profile cover/avatar, story ring, gallery, co-own asset cards
> **Source documents:** `AGENTS.md` §4 (Push to Maximum Quality), §15 (Media Rules / Image art direction); `Design.md` (Media Quality & Art Direction Pipeline, Media-first geometry, Component Micro Specs)
> **Benchmark date:** 2026-08
> **Status:** Research synthesis — informs implementation, not a substitute for device render validation

---

## 1. 2026 Competitor Benchmark — Media Treatment

The 2026 media-treatment landscape has converged on a small set of principles: true aspect ratios, focal-point preservation, progressive loading with encoded placeholders, and the "image is the card" philosophy where chrome recedes behind photography. The following benchmark is drawn from current public product analysis and 2026 design guidance.

### Pinterest — masonry as the canonical media surface

Pinterest remains the gold standard for media-first discovery. Its 2026 treatment is defined by:

- **True image aspect ratios.** Pins render at their native proportions inside a two-column masonry grid. The platform's own creative guidance states that the 2:3 vertical ratio (1000×1500px) receives the best feed distribution, and that landscape images get squeezed into vertical slots, making them appear small and easy to scroll past ([LighterImage — Pinterest Image Optimization](https://lighterimage.com/guides/pinterest-image-optimization.html)). The lesson for ThryftVerse: never force a universal square or 4:5 crop on discovery media when the server provides real dimensions.
- **Focal-point centring.** Pinterest crops pin images from the edges inward in search results and related-pin grids. Products or text placed near the edges get cut off. The guidance is explicit: "Center your focal point and keep all critical elements within the inner 80% of the frame" ([LighterImage](https://lighterimage.com/guides/pinterest-image-optimization.html)). This is the same principle as ThryftVerse's `getCategoryFocalPoint` — but Pinterest applies it at the platform level, while ThryftVerse must apply it at the client crop layer.
- **Invisible chrome.** Pinterest's design system uses a warm-cream neutral palette (`#fbfbf9` page wash, `#f6f6f3` card surface) with a single saturated red reserved exclusively for the Sign-up CTA and active-tab indicator. Each tile is a 16px-radius card at its natural aspect ratio with 8px gutters ([shadcn.io — Pinterest design system](https://www.shadcn.io/design/pinterest)). The image is the surface; there is no visible card frame around every pin.
- **Single dominant hero object.** Pinterest's 2026 visual search ad guidance states: "Keep a single, dominant hero object in frame. Avoid overly busy collages as your default. Use contrast so the subject separates from the background" ([Sagum — Pinterest Visual Search Optimization](https://sagum.com/2026/05/23/pinterest-visual-search-optimization-for-ads/)). This directly maps to ThryftVerse's AGENTS.md §15: "fashion objects remain visible, shoes and bags are not cropped at critical edges."

### Instagram — full-attention media with stable action grammar

Instagram's media treatment is defined by full-bleed imagery that owns the viewport, with chrome limited to floating scrims and a stable action row. Key 2026 patterns:

- **4:5 feed media** as the primary crop, with 9:16 for Stories and 1:1 for the legacy grid. The platform's split between square grid tradition and 4:5 mobile-first feed requires producing multiple crops from a single master image ([Rewarx — Product Images for TikTok Shop and Instagram 2026](https://www.rewarx.com/blogs/create-product-images-tiktok-shop-instagram-shopping-2026)).
- **Media dominates chrome.** The action row (like, comment, share, save) sits below the media with 44pt hit areas and 24pt icons. The media area owns at least 70% of the viewport — a principle ThryftVerse has adopted in Design.md's Component A spec.
- **Stories distinguish seen/unseen** with ring states. This is a media-treatment detail: the story ring is a media-adjacent chrome element that communicates state without competing with the avatar image inside it.

### eBay / Vinted — transactional media clarity

Marketplace apps treat media as the primary trust and decision surface. The 2026 mobile-first product photography guidance is blunt: "56% of shoppers cite poor product imagery as a primary reason for abandoning a product page without buying" ([Online Store News — Mobile-First Product Photography System](https://onlinestorenews.com/how-to-build-a-mobile-first-product-photography-system-that-actually-converts/), citing Baymard 2026). Key patterns:

- **4:5 or 1:1 product carousels** on mobile, with tighter crops and foreground-dominant compositions. "Mobile-first shoots use tighter crops, higher contrast, and foreground-dominant compositions. Details fill the frame. Empty negative space — beautiful on a 27-inch monitor — becomes wasted real estate on mobile" ([Online Store News — Mobile-First Product Photography Strategy](https://onlinestorenews.com/how-to-build-a-mobile-first-product-photography-strategy-that-converts/)).
- **Aspect-ratio mismatch is the core failure.** "Studio shoots default to 3:2 or 16:9. That mismatch means every image is being auto-cropped by the platform in ways your photographer never intended — and often in ways that cut off the product itself" ([Online Store News](https://onlinestorenews.com/how-to-build-a-mobile-first-product-photography-strategy-that-converts/)). This is exactly the defect ThryftVerse's `resolveListingMediaAspectRatio` and `AspectRatio` tokens are designed to prevent.
- **Live commerce thumbnails** must answer three questions in under a second: what is being sold, why enter now, and does this look trustworthy. "Do not make the thumbnail a mini catalog. Pick the hero product or the strongest bundle anchor" ([GESTEL — Live Commerce Thumbnails](https://www.gestel.studio/blog/live-commerce-thumbnail-product-photos)).

### Snapchat — full-screen media canvas with floating chrome

Snapchat's Stories pattern (which Instagram and ThryftVerse's Poster composer follow) is the canonical "media is the background, chrome floats on top" architecture. The 2026 guidance for this pattern: pure black background behind the canvas in dark mode, gradient scrims at top and bottom for legibility, all chrome icons white on dark scrim. ThryftVerse's `MediaStage.tsx` already implements this correctly with its `topScrim` and `controlIcon` text-shadow approach (lines 672–677, 793–797).

### Cross-platform aspect-ratio strategy

The 2026 social-commerce photography guidance recommends capturing in 9:16 vertical, then producing 4:5 and 1:1 crops from the same master: "Set your camera to capture primary shots in 9:16 vertical framing. From the same vantage point, capture additional frames in 4:5 and 1:1" ([Rewarx](https://www.rewarx.com/blogs/create-product-images-tiktok-shop-instagram-shopping-2026)). ThryftVerse's `AspectRatio` token set (`portrait` 3:4, `marketplace` 4:5, `square` 1:1, `portraitTall` 9:16) maps directly to this taxonomy.

---

## 2. Psychology & Principles

### Media as primary color

AGENTS.md §4 is explicit: "On discovery, profile and creator surfaces, real media must be the primary colour and visual anchor. Generic grey placeholder cards never become the dominant first-viewport story." This is not a styling preference — it is a visceral-level design principle. Don Norman's three levels of emotional design (AGENTS.md §27.1) place visceral reaction as the first, unconscious judgment: "Premium is less about decoration and more about control. Users form snap judgments about quality within seconds of opening an app." When a user opens Explore and sees a wall of grey shimmer placeholders or `ImageEmptyGraphic` fallbacks, the visceral judgment is "empty" or "broken," regardless of how fast the API responded.

The principle: **imagery carries colour on media surfaces** (Design.md, Colors §Rules). The UI must not compete with user content. On a media surface, the canvas is neutral (white/near-black) and the photography provides all visual warmth, saturation, and identity.

### "Image is the card" principle

Design.md's masonry spec states it directly: "The image is the card. Avoid visible frames around every pin." Pinterest's design system confirms this: each tile is a 16px-radius card at its natural aspect ratio, with no additional card shell ([shadcn.io](https://www.shadcn.io/design/pinterest)). The implication for ThryftVerse: a `CachedImage` inside a `View` with `borderRadius: Radius.lg` and `overflow: 'hidden'` is the correct pattern — but adding a `backgroundColor: colors.surface` card wrapper, a `borderWidth: 1`, and a `borderColor` around every image creates card-on-card composition that AGENTS.md §4 prohibits.

The `FlagshipProductCard.tsx` already follows this correctly: the image wrap has `borderRadius: Radius.lg` and `backgroundColor: colors.surfaceAlt` (for loading state), but no border or shadow (lines 126–130). The metadata sits below the image in a flat layout with no card shell (lines 88–103). This is the correct pattern.

### Focal-point preservation

AGENTS.md §15: "Do not rely on `cover` blindly. Use category-sensitive focal positioning when supported safely." The psychology: when a user sees a shoe cropped at the toe, a bag with the handle cut off, or a portrait garment with the silhouette amputated, the behavioral-level judgment is "this seller doesn't care" or "this product is low quality." The image itself may be high-resolution, but the crop communicates carelessness.

The 2026 imgix focal-point cropping guidance frames it as: "Because detail and focus tend to get lost at smaller sizes and the desired aspect ratio isn't the same across all devices, the focal point won't always remain in-frame or legible just by shrinking the image. You need to art-direct the image to ensure that the focal point is the focus" ([imgix — Focal Point Cropping](https://docs.imgix.com/en-US/getting-started/tutorials/cropping-and-enhancement/focal-point-cropping)).

ThryftVerse's `getCategoryFocalPoint` function (`utils/media.ts:55–65`) implements this with category-sensitive defaults: shoes/bags at `{x:0.5, y:0.56}`, watches/jewellery at `{x:0.5, y:0.5}`, tops at `{x:0.5, y:0.42}`, dresses at `{x:0.5, y:0.48}`. The `CachedImage` component translates this to `contentPosition` for `expo-image` (lines 151–153). This is the correct architecture — but it is only applied where callers pass `focalPoint`, and many surfaces do not.

### "Media dominates chrome" rule

AGENTS.md §4's squint test: "blur or squint at the screen; media/identity/content should dominate, while navigation and utility chrome recede." The 2026 mobile UX guidance reinforces this: "Use size, weight, and color to establish content priority. Limit the number of visual elements competing for attention" ([UXPin — Mobile UI 2026](https://www.uxpin.com/studio/blog/what-is-mobile-ui/)). On a media surface, the media-to-chrome area ratio should be overwhelmingly in favor of media. Design.md's first-viewport comparative measurements include "media-to-chrome area ratio" as a recorded metric (line 1106).

### Progressive loading as perceived performance

The 2026 image optimization guidance is clear: "An optimised image still feels slow if the user stares at a blank box while it loads. Placeholders fix that" ([CodeDrips — Image Optimisation Beyond WebP AVIF LQIP 2026](https://www.codedrips.com/journal/image-optimisation-beyond-webp-avif-lqip-and-the-new-defaults/)). The strategy hierarchy:

| Strategy | Payload | Visual fidelity | When to use |
|----------|---------|-----------------|-------------|
| Dominant color | ~7 bytes (hex) | Low | Background tint behind skeleton |
| LQIP (tiny base64) | 200–500 bytes | Medium | Inline preview before full image |
| BlurHash | ~20–30 bytes | Medium | CMS-driven sites with metadata |
| ThumbHash | ~25 bytes | High (color + alpha) | 2026 preferred over BlurHash |
| CSS skeleton | 0 bytes | None | Layout reservation only |

([Sujeet Jaiswal — Image Loading Optimization](https://sujeet.pro/articles/image-loading-optimization))

The `expo-image` library supports both BlurHash and ThumbHash placeholders natively via the `placeholder` prop ([expo-image npm](https://www.npmjs.com/package/expo-image), [React Native Relay — expo-image Tutorial 2026](https://reactnativerelay.com/article/expo-image-tutorial-caching-blurhash-2026)). The 2026 best practice: "Prefer ThumbHash over BlurHash when possible — it offers better color accuracy and transparency support" ([Engin Bolat — Why expo-image is the Best Image Solution for Expo in 2026](https://medium.com/@engin.bolat/why-expo-image-is-the-best-image-solution-for-expo-in-2026-and-how-to-use-it-properly-fd648023a9c1)).

### Art direction as trust

The reflective level of emotional design (AGENTS.md §27.1) is about meaning and message. Art-directed media communicates: "we care enough about this product to show it correctly." When a shoe is cropped at the toe, the message is the opposite. The 2026 Baymard study finding — 56% of shoppers abandon product pages citing poor imagery ([Online Store News](https://onlinestorenews.com/how-to-build-a-mobile-first-product-photography-system-that-actually-converts/)) — is not about resolution. It is about art direction: crops that cut off the product, aspect-ratio mismatches that auto-crop in unintended ways, and inconsistent compositions that make a catalog look uncared-for.

---

## 3. Current ThryftVerse Audit — Concrete Defects

The codebase has a solid media foundation (`CachedImage` wrapper, `expo-image` adoption, category focal points, CDN downscaling, `ImageEmptyGraphic` fallback). However, a production audit reveals specific defects against the flagship media-treatment bar.

### 3.1 Missing focal-point data on most surfaces

**Defect:** The `focalPoint` prop is supported by `CachedImage` (line 45) and correctly translated to `contentPosition` (lines 151–153), but only a minority of call sites pass it. Grep results show `focalPoint` used in 35 locations across `frontend/src`, but the majority are through `getCategoryFocalPoint(item.category)` — a category-level heuristic, not per-image metadata.

**Affected surfaces:**
- `FlagshipProductCard.tsx:51–57` — `CachedImage` is rendered with `contentFit="cover"` but **no `focalPoint` prop**. The card uses a hardcoded 4:5 ratio (`CARD_H = CARD_W * 1.25`, line 15) and blind `cover` crop. This violates AGENTS.md §15: "Do not rely on `cover` blindly."
- `FlagshipAssetCard.tsx:44` — `CachedImage` with `contentFit="cover"` and **no `focalPoint`**. Co-own asset images (watches, art, collectibles) are exactly the category where centring matters most.
- `FlagshipProfileMedia.tsx:76–82` — cover image uses `contentFit="cover"` with **no `focalPoint`**. Only the avatar (line 161) gets `FACE_FOCAL_POINT`. Cover photos on profiles are often full-body shots or lifestyle images where upper-center focal positioning would prevent head cutoff.
- `FlagshipHeroSection.tsx:33` — `contentFit="cover"` with no focal point.

**Root cause:** The backend API contract includes `focalX`/`focalY` fields (visible in `productDetailViewModel.ts:476` and `AuctionDetailScreen.tsx:578`), but these are only consumed on detail screens, not on discovery/card surfaces. The `Listing` domain type does not surface focal-point data to card components.

### 3.2 Hardcoded aspect ratios on flagship card components

**Defect:** `FlagshipProductCard.tsx:15` hardcodes `CARD_H = CARD_W * 1.25` (4:5 ratio) for all products, regardless of the actual media dimensions. This contradicts Design.md's masonry spec: "Use server/media dimensions. Fallback to 4:5 only when dimensions are unavailable" and "Never derive height from item ID/hash/random render values."

**Contrast with correct pattern:** `ProductCardV2.tsx:91` does it correctly: `const aspectRatio = mediaAspectRatio ?? resolveListingMediaAspectRatio(item)`, and `PinterestMasonryGrid.tsx:109` passes `resolveListingMediaAspectRatio(item)` to each tile. The flagship card component is **less** media-fidelity-aware than the production card it is meant to supersede.

**Affected surfaces:**
- `FlagshipProductCard.tsx:15` — hardcoded 4:5
- `FlagshipAssetCard.tsx:87,109–112` — hardcoded 80×80 square (`IMAGE_SIZE = 80`)

### 3.3 No blurhash/dominant color in the rendering pipeline

**Defect:** `CachedImage` supports `blurhash` (line 28, 327) but the prop is almost never passed by callers. Grep shows `blurhash` referenced in only 11 locations — 3 in `CachedImage.tsx` itself, 2 in API service types (`marketApi.ts:101`, `listingsApi.ts:525`), 4 in `MediaPreview.tsx`, and 2 in test files. The API contracts define `blurhash` as a field, but the data is not flowing to the rendering layer on most surfaces.

**Dominant color:** Grep for `dominantColor` returns **zero matches** across `frontend/src`. The Design.md pipeline requires "dominant/placeholder colour" as preserved metadata (line 1005), but this data does not exist in the codebase at all.

**Impact:** During image load, users see a `colors.surfaceAlt` shimmer placeholder (CachedImage.tsx:272) or an `ImageEmptyGraphic` gradient fallback. There is no blurred preview, no dominant-color tint, no progressive loading sensation. The image pops in after a 280ms crossfade. On slow networks, this is a blank-to-full-image jump.

### 3.4 Grey placeholders as first-viewport story

**Defect:** `CachedImage.tsx:272` uses `{ backgroundColor: colors.surfaceAlt }` as the shimmer placeholder background. `ImageEmptyGraphic.tsx` uses gradient pairs (`#F5F0EB` → `#EDE8E1` in light mode, `#1A1A1A` → `#141414` in dark, lines 18–30) with a diagonal stripe texture and an icon ring. While these are more crafted than a flat grey rectangle, they are still **non-media surfaces** that become the dominant first-viewport story when a feed loads slowly.

AGENTS.md §4: "Generic grey placeholder cards never become the dominant first-viewport story." The current `ImageEmptyGraphic` is not generic grey — it has a gradient and texture — but it is still a placeholder, not media. On a slow-loading Explore screen, the first viewport can be dominated by 4–6 `ImageEmptyGraphic` tiles, which fails the squint test.

### 3.5 Inconsistent contentFit across surfaces

**Defect:** Grep for `contentFit` shows 60+ matches across the codebase, almost all using `"cover"`. But `MediaStage.tsx:98` defaults to `'contain'` for images (`fit?: 'cover' | 'contain'` defaults to `contain` in the `ImagePage` render at line 315: `contentFit={item.fit ?? 'contain'}`). This means product detail media uses `contain` (letterboxing) while discovery cards use `cover` (cropping). The inconsistency is intentional — detail surfaces want to show the full image, discovery surfaces want to fill the tile — but it is not documented or enforced by a shared policy.

**Affected inconsistency:** `FlagshipProfileMedia.tsx:79` cover uses `cover`; `MediaStage.tsx:315` image pages default to `contain`; `CachedImage.tsx:84` defaults to `cover`. Three different defaults across three components.

### 3.6 Missing image failure states on flagship cards

**Defect:** `FlagshipProductCard.tsx:51–57` renders `CachedImage` with no `onError` handler and no failure-state fallback. If the image URI returns a 404 or network error, `CachedImage` internally falls back to `ImageEmptyGraphic` (line 262–267), but the `FlagshipProductCard` has no way to know this happened and no card-level failure state (e.g., a "Photo unavailable" label or a retry affordance).

`FlagshipAssetCard.tsx:43–49` does have a fallback (`imageUri ? <CachedImage> : <View style={imageFallback}>`), but the fallback is a plain `Ionicons name="image-outline"` icon with no label, no gradient, and no art direction — it is less crafted than `ImageEmptyGraphic`.

### 3.7 Skeleton geometry mismatch

**Defect:** `FlagshipProductCard.tsx` has no skeleton state at all. When used in a loading list, the parent must provide skeletons. `PinterestMasonryGrid.tsx` does provide a `MasonrySkeleton` (line 10), but the skeleton uses `SKELETON_ASPECT_RATIOS[i % SKELETON_ASPECT_RATIOS.length]` (visible in `GalleriaScreen.tsx:400`) — a rotating set of ratios, not the actual per-item aspect ratios. This means the skeleton geometry does not match the final media geometry, causing layout shift when images decode. Design.md's performance gate: "skeleton geometry differs from final media" is a fail condition (line 1482).

### 3.8 Direct Image usage bypassing CachedImage

**Defect:** Grep counts show 228 `<CachedImage` usages vs 50 `<Image` usages. The 50 direct `<Image` usages include `expo-image` `Image` imports in creator tools, media studios, and some screens. While most are legitimate (creator canvas rendering, video poster frames), some may bypass the CDN downscaling, focal-point, and failure-state handling that `CachedImage` provides. Each direct usage should be audited for whether it needs the production media pipeline.

---

## 4. Micro Improvements

### 4.1 Pass focal points to every card surface

Every `CachedImage` in a card/tile component should receive a `focalPoint` prop. For surfaces where per-image metadata is unavailable, use `getCategoryFocalPoint(item.category)` as the fallback (already implemented in `ProductCardV2.tsx:194`). Specific fixes:

- `FlagshipProductCard.tsx:51–57` — add `focalPoint={getCategoryFocalPoint(item.category)}` (requires passing `category` as a prop or extending the card's interface).
- `FlagshipAssetCard.tsx:44` — add `focalPoint={getCategoryFocalPoint(asset.category)}` or a collectible-appropriate default `{x:0.5, y:0.5}`.
- `FlagshipProfileMedia.tsx:76–82` — add a cover-appropriate focal point (e.g., `{x:0.5, y:0.4}` for lifestyle/full-body cover photos).

### 4.2 Replace hardcoded aspect ratios with resolved geometry

`FlagshipProductCard.tsx` should accept `aspectRatio` as a prop (or resolve it from listing data) instead of hardcoding `CARD_W * 1.25`. The pattern from `ProductCardV2.tsx:91` is the canonical approach:

```typescript
const aspectRatio = mediaAspectRatio ?? resolveListingMediaAspectRatio(item);
```

`FlagshipAssetCard.tsx` should use a resolved aspect ratio for the thumbnail instead of a fixed 80×80 square, or at minimum use `contentFit="cover"` with a focal point on the square crop.

### 4.3 Wire blurhash from API to rendering layer

The API contracts already define `blurhash` (`marketApi.ts:101`, `listingsApi.ts:525`). The data pipeline should flow this to every `CachedImage` call site:

- Extend the `Listing` domain type to include `blurhash?: string` on media items.
- Pass `blurhash={item.blurhash}` to `CachedImage` in all card/tile components.
- For profile covers/avatars, pass `blurhash` from the profile API response.

### 4.4 Add dominant-color tint to loading placeholders

Introduce a `dominantColor` field in the API contract and use it as the background color of the `CachedImage` container during loading, instead of `colors.surfaceAlt`. This creates a subtle "preview tint" that hints at the upcoming image's color palette. The 2026 guidance: "Dominant color" at ~7 bytes payload provides "Low" visual fidelity but zero JS cost ([Sujeet Jaiswal](https://sujeet.pro/articles/image-loading-optimization)).

### 4.5 Add onError handlers to flagship cards

`FlagshipProductCard.tsx` and `FlagshipAssetCard.tsx` should pass `onError` to `CachedImage` and render a card-level failure state (a subtle "Photo unavailable" label below the placeholder, or a retry affordance if the parent screen supports it).

### 4.6 Standardize contentFit defaults

Document and enforce a shared contentFit policy:
- Discovery cards, profile covers, avatars: `contentFit="cover"` with focal point.
- Product detail gallery, full-screen viewer: `contentFit="contain"` for full-image viewing.
- Story/poster canvas: `contentFit="cover"` with focal point.

`CachedImage.tsx:84` already defaults to `cover`, which is correct for the majority case. `MediaStage.tsx` should document why it defaults to `contain` for detail surfaces.

### 4.7 Match skeleton geometry to final media

Replace `SKELETON_ASPECT_RATIOS[i % ...]` with per-item resolved aspect ratios. When the API provides `mediaWidth`/`mediaHeight`, skeletons should use the same `resolveListingMediaAspectRatio` function. When dimensions are unavailable, use the `DEFAULT_LISTING_MEDIA_ASPECT_RATIO` (3:4) fallback — the same fallback the final image uses.

---

## 5. Macro Improvements

### 5.1 Media Pipeline — end-to-end metadata flow

The media pipeline should be a complete system from upload to render:

**Upload layer:**
- On image upload, compute and store: width, height, aspect ratio, focal point (auto-detected or user-set), blurhash/thumbhash, dominant color, media type, poster frame (for video).
- The `mediaUploadAsset.ts` and `imagePreloader.ts` utilities should be extended to extract this metadata client-side before upload, or the backend should compute it on receipt.

**API/contract layer:**
- Extend the `Listing` domain type and API responses to include: `blurhash`, `dominantColor`, `focalX`, `focalY`, `mediaWidth`, `mediaHeight`, `mediaAspectRatio` on every media item (not just the listing level).
- The `marketApi.ts:101` and `listingsApi.ts:525` contracts already define `blurhash` — ensure it is populated and flows through serializers.

**Rendering layer:**
- `CachedImage` should accept and use: `blurhash` (already supported), `dominantColor` (new — use as container background during load), `focalPoint` (already supported).
- Every card/tile component should pass the full metadata set to `CachedImage`.

**Failure layer:**
- `CachedImage` already falls back to `ImageEmptyGraphic` on error (line 262). This should be extended with a retry affordance when the parent screen supports it.
- Card-level failure states should show a restrained "Photo unavailable" label, not just an icon.

### 5.2 Art Direction System — category-aware crop policy

The current `getCategoryFocalPoint` function (`utils/media.ts:55–65`) is a good start but should be extended into a full art-direction system:

- **Per-image focal points** from backend metadata (not just category-level heuristics).
- **Category-aware contentFit**: shoes/bags may benefit from `contain` on a neutral background rather than `cover` crop; jewellery/watches should use `cover` with center focal point; apparel should use `cover` with upper-center focal point.
- **Crop-position preservation** across surfaces: the same image should use the same focal point on discovery card, product detail, and profile grid. Currently, `ProductCardV2` uses `getCategoryFocalPoint` but `FlagshipProductCard` uses no focal point at all.
- **Featured vs supporting crops**: Design.md §15 states "featured and supporting crops should not look identical." The system should support multiple crop presets per image (hero, thumbnail, square) with different focal-point emphasis.

### 5.3 Media-as-Card Philosophy — eliminate card shells

Audit every media surface for card-on-card composition. The pattern should be:
- `CachedImage` with `borderRadius` and `overflow: 'hidden'` on the image wrapper.
- `backgroundColor: colors.surfaceAlt` (or `dominantColor` when available) on the wrapper for loading state.
- No `borderWidth`, no `borderColor`, no `shadow` on routine media cards.
- Metadata (title, price, seller) in a flat layout below the image, not inside a card shell.

`FlagshipProductCard.tsx` already follows this correctly. `FlagshipAssetCard.tsx` **violates** it: the root has `backgroundColor: colors.surface`, `borderRadius: Radius.lg`, `borderWidth: 1`, `borderColor: colors.border` (lines 90–99). This creates a visible card shell around the entire row, which is appropriate for a list-row asset card but not for a media-first surface. The asset card should either flatten (image + content in a transparent row with hairline separator) or justify the card shell with a distinct interaction/state boundary.

### 5.4 Progressive Loading Strategy

Implement a three-tier progressive loading system:

1. **Tier 0 — Dominant color / blurhash** (instant): Render a blurred preview or dominant-color tint immediately on layout. This requires the API to provide `blurhash` or `dominantColor` metadata.
2. **Tier 1 — Low-quality preview** (fast): `CachedImage` already supports `previewUri` (line 23). For CDN-supported providers, generate a 20px-wide preview URL and pass it as `previewUri`.
3. **Tier 2 — Full resolution** (normal): The current `CachedImage` behavior with 280ms crossfade.

The 2026 best practice: "BlurHash encodes an image as a 20-30 character string that decodes to a blurred representation. It is smaller than LQIP on the wire and avoids the extra image request" ([CodeDrips](https://www.codedrips.com/journal/image-optimisation-beyond-webp-avif-lqip-and-the-new-defaults/)). For React Native specifically: "Prefer ThumbHash over BlurHash when possible — it offers better color accuracy and transparency support" ([Engin Bolat](https://medium.com/@engin.bolat/why-expo-image-is-the-best-image-solution-for-expo-in-2026-and-how-to-use-it-properly-fd648023a9c1)).

### 5.5 Image Failure & Recovery System

- **No broken-image icons.** `CachedImage` already handles this correctly by falling back to `ImageEmptyGraphic` (line 262).
- **No collapsing layout.** The image wrapper must reserve the final aspect-ratio space even on failure. `CachedImage` does this by rendering inside a `View` with the style applied.
- **Retry where useful.** For transient network errors, a retry affordance should be available. For permanent 404s, the placeholder should be final (no retry spinner).
- **User-safe copy.** "Photo unavailable" not "Error 404" or "Network request failed."

---

## 6. Flagship Acceptance Criteria — Media Treatment

A media surface is flagship only when ALL of the following are true:

### Media storytelling
- [ ] On discovery, profile and creator surfaces, real media is the primary color and visual anchor.
- [ ] Generic grey placeholder cards never become the dominant first-viewport story.
- [ ] The first viewport passes the squint test: media/identity/content dominates, chrome recedes.
- [ ] The first viewport passes the thumbnail test at 25% scale: primary object and reading order remain obvious.

### Focal-point preservation
- [ ] Every `CachedImage` with `contentFit="cover"` receives a `focalPoint` prop (per-image metadata or category heuristic).
- [ ] Fashion objects remain visible: shoes not cropped at toe, bags not cropped at handle, jewellery centered, portrait garments retain silhouette.
- [ ] Featured and supporting crops do not look identical (different focal emphasis or aspect ratio).
- [ ] `contentFit="cover"` is never used blindly without focal-point awareness.

### Skeleton geometry match
- [ ] Skeleton aspect ratios match final media aspect ratios exactly — no layout shift on image decode.
- [ ] Skeletons use the same `resolveListingMediaAspectRatio` resolution as the final image.
- [ ] No `SKELETON_ASPECT_RATIOS[i % ...]` rotation patterns that do not reflect actual item geometry.

### Progressive loading
- [ ] Every image has a visible loading state (blurhash, dominant-color tint, or skeleton matching final aspect ratio).
- [ ] Media fades in (`Duration.normal` crossfade, 200–300ms), never pops.
- [ ] No blank-to-full-image jump on slow networks.

### Failure states
- [ ] Every image has a failure state: restrained placeholder (`colors.surface` + category icon), not broken-image icon.
- [ ] No collapsing layout on image failure.
- [ ] User-safe copy on failure ("Photo unavailable", not error codes).

### Art direction
- [ ] Product images are cropped honestly — category-sensitive focal positioning.
- [ ] `contentFit` is consistent within a surface family (all discovery cards use `cover` + focal point; all detail galleries use `contain`).
- [ ] No card-on-card composition around media (image is the card; no visible frame unless it carries distinct status/interaction).

---

## 7. Priority & Sequencing

### Phase 1 — P0 fixes (ship blockers)

1. **Add focal points to all flagship card components.** `FlagshipProductCard`, `FlagshipAssetCard`, `FlagshipProfileMedia` cover, `FlagshipHeroSection`. Use `getCategoryFocalPoint` as fallback. (Effort: small. Impact: high — prevents crop-of-product defects.)
2. **Add `onError` handlers to flagship cards.** Card-level failure states with "Photo unavailable" label. (Effort: small. Impact: medium — prevents broken-image-icon P0.)
3. **Replace hardcoded aspect ratios in `FlagshipProductCard`.** Accept `aspectRatio` prop or resolve from listing data. (Effort: small. Impact: high — enables true-aspect-ratio masonry.)

### Phase 2 — P1 fixes (flagship blockers)

4. **Wire `blurhash` from API to rendering layer.** Extend `Listing` type, pass to `CachedImage` in all card/tile components. (Effort: medium. Impact: high — progressive loading.)
5. **Add `dominantColor` to API contract and rendering.** New field, used as container background during load. (Effort: medium. Impact: medium — perceived performance.)
6. **Fix skeleton geometry mismatch.** Replace rotating `SKELETON_ASPECT_RATIOS` with per-item resolved ratios. (Effort: small. Impact: high — eliminates layout shift.)
7. **Standardize `contentFit` policy.** Document and enforce: `cover` + focal for cards/covers/avatars; `contain` for detail/full-screen. (Effort: small. Impact: medium — consistency.)

### Phase 3 — P2 polish (9/10 quality)

8. **Per-image focal-point metadata from backend.** Move beyond category heuristics to actual image-level focal points. (Effort: large — backend + frontend. Impact: high for art direction.)
9. **ThumbHash adoption.** Migrate from BlurHash to ThumbHash for better color accuracy. (Effort: small. Impact: medium.)
10. **Tier-1 preview URI generation.** Generate low-quality preview URLs for CDN-supported providers. (Effort: medium. Impact: medium.)
11. **Featured vs supporting crop presets.** Multiple focal-point presets per image for different surface contexts. (Effort: large. Impact: medium.)
12. **Audit 50 direct `<Image` usages.** Ensure none bypass the production media pipeline inappropriately. (Effort: small. Impact: low-medium.)

---

## 8. Token-Level Spec Table — Media Surfaces

| Surface | Aspect ratio | contentFit | Focal point | Placeholder | Skeleton | Failure state | Radius | CDN downscale |
|---------|-------------|------------|-------------|-------------|----------|---------------|--------|---------------|
| **Feed media** (post/listing unit) | 4:5 or 3:4 (native); `AspectRatio.marketplace` fallback | `cover` | Per-image or `getCategoryFocalPoint` | BlurHash + shimmer | 4:5/3:4 skeleton matching item ratio | `ImageEmptyGraphic` + "Photo unavailable" | `Radius.lg` (12pt) | `downscaleWidth={screenWidth}` |
| **Masonry card** (discovery) | True native (`resolveListingMediaAspectRatio`); `AspectRatio.portrait` (3:4) fallback | `cover` | Per-image or `getCategoryFocalPoint` | BlurHash + shimmer | Per-item ratio skeleton | `ImageEmptyGraphic` + category icon | `Radius.lg` (12pt) | `downscaleWidth={colWidth}` |
| **Product hero** (detail gallery) | Natural or 4:5; `AspectRatio.marketplace` fallback | `contain` (full image visible) | Per-image `focalX`/`focalY` from API | BlurHash + poster frame | Exact-size skeleton | `ImageEmptyGraphic` + "Photo unavailable" | `Radius.none` (full-bleed) | Full resolution (no downscale) |
| **Profile cover** | Full-width, 180–220pt height | `cover` | `{x:0.5, y:0.4}` (lifestyle/upper-center) | Dominant color + shimmer | 220pt skeleton | `ImageEmptyGraphic` + "Cover unavailable" | `Radius.none` (full-bleed top) | `downscaleWidth={screenWidth}` |
| **Profile avatar** | 80–96pt circle | `cover` | `FACE_FOCAL_POINT` `{x:0.5, y:0.35}` | Gradient fallback (already in `FlagshipProfileMedia`) | Circle skeleton with gradient | Person icon + gradient (already implemented) | `Radius.full` | `downscaleWidth={96}` |
| **Story ring** | 64pt circle (avatar inside) | `cover` | `FACE_FOCAL_POINT` | Gradient ring (seen/unseen) | N/A (story rail is horizontal scroll) | Person icon fallback | `Radius.full` (ring) | `downscaleWidth={64}` |
| **Gallery** (product detail swipe) | Natural per image; `AspectRatio.marketplace` fallback | `contain` (detail) / `cover` (thumbnail strip) | Per-image `focalX`/`focalY` | BlurHash + shimmer | Per-image ratio skeleton | `ImageEmptyGraphic` + "Photo unavailable" | `Radius.none` (full-bleed) / `Radius.md` (thumbs) | Full for active, downscale for thumbs |
| **Co-own asset card** | 80×80 square (list row) or resolved ratio (discovery) | `cover` | `getCategoryFocalPoint` (collectibles center) | Shimmer | Square skeleton | `Ionicons image-outline` → upgrade to `ImageEmptyGraphic` | `Radius.md` (8pt) | `downscaleWidth={160}` |
| **Co-own featured hero** | Resolved or 4:5 | `cover` | `getCategoryFocalPoint` | BlurHash + shimmer | Aspect-matched skeleton | `ImageEmptyGraphic` | `Radius.lg` (12pt) | `downscaleWidth={screenWidth}` |
| **Board/collection cover** | Authored mosaic or strong single-media | `cover` | Per-image or center | BlurHash | Mosaic skeleton | `ImageEmptyGraphic` + "Collection empty" | `Radius.lg` (12pt) | `downscaleWidth={colWidth}` |
| **Look preview card** | `aspectRatio: 0.85` (current) or template aspect | `cover` | Center or template-defined | Shimmer | Template-ratio skeleton | `ImageEmptyGraphic` | `Radius.lg` (12pt) | `downscaleWidth={cardWidth}` |
| **Search result thumbnail** | Square (1:1) or native | `cover` | `getCategoryFocalPoint` | Shimmer | Square skeleton | `ImageEmptyGraphic` | `Radius.md` (8pt) | `downscaleWidth={120}` |
| **Chat attachment** | Variable (image native) | `contain` (full view) / `cover` (thumbnail) | N/A (user-selected) | Local URI preview | N/A | "Attachment unavailable" | `Radius.md` (8pt) | N/A (local URI) |
| **Notification thumbnail** | Square (1:1) | `cover` | `getCategoryFocalPoint` | Shimmer | N/A (inline) | `ImageEmptyGraphic` | `Radius.md` (8pt) | `downscaleWidth={80}` |

---

## 9. Implementation References

### Current codebase architecture

| Component | File | Role |
|-----------|------|------|
| `CachedImage` | `frontend/src/components/CachedImage.tsx` | Production image wrapper: expo-image, CDN downscaling, focal points, blurhash, shimmer, failure fallback |
| `ImageEmptyGraphic` | `frontend/src/components/ImageEmptyGraphic.tsx` | Crafted placeholder: gradient + texture + icon ring |
| `MediaStage` | `frontend/src/components/ui/MediaStage.tsx` | Full-bleed media hero for detail surfaces: paged carousel, pinch-zoom, video playback, floating controls |
| `CommerceMediaStage` | `frontend/src/components/commerce/CommerceMediaStage.tsx` | Commerce-specific media stage with parallax, shared-element transitions |
| `FlagshipProfileMedia` | `frontend/src/components/flagship/FlagshipProfileMedia.tsx` | Profile cover + avatar with edit controls, upload failure states |
| `FlagshipProductCard` | `frontend/src/components/flagship/FlagshipProductCard.tsx` | Two-column discovery product card (flagship) |
| `FlagshipAssetCard` | `frontend/src/components/flagship/FlagshipAssetCard.tsx` | Co-own asset list-row card |
| `ProductCardV2` | `frontend/src/components/ProductCardV2.tsx` | Production discovery tile with resolved aspect ratios, focal points, CDN downscaling |
| `PinterestMasonryGrid` | `frontend/src/components/discover/PinterestMasonryGrid.tsx` | FlashList v2 masonry grid with true aspect ratios |
| `MediaPreview` | `frontend/src/components/MediaPreview.tsx` | Viewability-driven media preview with blurhash + focal points |

### Utility functions

| Function | File | Purpose |
|----------|------|---------|
| `getCategoryFocalPoint` | `frontend/src/utils/media.ts:55` | Category-sensitive focal point mapping |
| `FACE_FOCAL_POINT` | `frontend/src/utils/media.ts:71` | Face-aware focal point for avatars |
| `resolveListingMediaAspectRatio` | `frontend/src/utils/listingMediaGeometry.ts:33` | Resolve real media geometry from API data |
| `isVideoUri` | `frontend/src/utils/media.ts:3` | Detect video URIs |
| `AspectRatio` | `frontend/src/theme/designTokens.ts:546` | Aspect ratio token constants |

### Design tokens

| Token | Value | Usage |
|-------|-------|-------|
| `AspectRatio.square` | 1 (1:1) | Collectibles, search thumbnails, legacy grid |
| `AspectRatio.portrait` | 0.75 (3:4) | Default listing media, profile archive |
| `AspectRatio.marketplace` | 0.8 (4:5) | Feed media, product hero |
| `AspectRatio.portraitTall` | 0.5625 (9:16) | Video, stories |
| `Radius.lg` | 12pt | Standard media cards |
| `Radius.xl` | 16pt | Editorial cards, form fields |
| `Radius.full` | 999pt | Avatars, story rings |
| `Duration.normal` | 250ms | Image crossfade |

---

## 10. Web Sources

1. [Imagic AI — Mobile Image Optimization Guide](https://imagic-ai.com/blog/mobile-image-optimization-guide) — responsive image widths, LCP guidance, breakpoint-specific source widths
2. [Android Developers — Images and Graphics](https://developer.android.com/design/ui/mobile/guides/layout-and-content/images-graphics) — resolution buckets, vector-first, scrim guidance
3. [UXPin — What Is Mobile UI (2026)](https://www.uxpin.com/studio/blog/what-is-mobile-ui/) — touch targets, visual hierarchy, platform conventions
4. [Heurilens — Mobile UX Best Practices 2026](https://heurilens.com/blog/technical-ux/mobile-ux-best-practices-data-driven-guide) — thumb zones, 44pt targets, progressive disclosure
5. [CodeDrips — Image Optimisation Beyond WebP AVIF LQIP 2026](https://www.codedrips.com/journal/image-optimisation-beyond-webp-avif-lqip-and-the-new-defaults/) — BlurHash, LQIP, dominant color, 2026 baseline
6. [Sujeet Jaiswal — Image Loading Optimization](https://sujeet.pro/articles/image-loading-optimization) — resource budgets, placeholder strategy comparison, LCP optimization
7. [Pixotter — Lazy Loading Images Complete Guide](https://pixotter.com/blog/lazy-loading-images/) — Intersection Observer, native lazy loading, 40-60% request reduction
8. [ShortPixel — Progressive JPEG vs Baseline 2026](https://shortpixel.com/blog/progressive-jpeg-vs-baseline-jpeg-does-it-still-matter-in-2026/) — progressive rendering on slow networks, Core Web Vitals
9. [React Native Relay — expo-image Tutorial 2026](https://reactnativerelay.com/article/expo-image-tutorial-caching-blurhash-2026) — contentFit, contentPosition, BlurHash/ThumbHash, prefetching, FlashList integration
10. [Engin Bolat — Why expo-image is the Best Image Solution for Expo in 2026](https://medium.com/@engin.bolat/why-expo-image-is-the-best-image-solution-for-expo-in-2026-and-how-to-use-it-properly-fd648023a9c1) — cachePolicy, ThumbHash vs BlurHash, recyclingKey, priority
11. [expo-image npm](https://www.npmjs.com/package/expo-image) — official API reference, contentFit/contentPosition, placeholder support
12. [expo/expo GitHub — expo-image](https://github.com/expo/expo/tree/main/packages/expo-image) — SDWebImage/Glide, BlurHash/ThumbHash, CSS object-fit semantics
13. [LighterImage — Pinterest Image Optimization](https://lighterimage.com/guides/pinterest-image-optimization.html) — 2:3 ratio, focal-point centring, edge-crop behavior
14. [Sagum — Pinterest Visual Search Optimization for Ads](https://sagum.com/2026/05/23/pinterest-visual-search-optimization-for-ads/) — single dominant hero object, scene families, visual fingerprint
15. [shadcn.io — Pinterest Design System](https://www.shadcn.io/design/pinterest) — neutral palette, 16px radius, 8px gutters, image-is-card
16. [Benly — Pinterest Ad Formats 2026](https://benly.ai/learn/pinterest-ads/pinterest-ad-formats-specs) — 2:3 vertical outperforms square, mobile 85%+ of usage
17. [imgix — Focal Point Cropping for Responsive Art Direction](https://docs.imgix.com/en-US/getting-started/tutorials/cropping-and-enhancement/focal-point-cropping) — art direction, focal-point preservation across breakpoints
18. [Online Store News — Mobile-First Product Photography Strategy](https://onlinestorenews.com/how-to-build-a-mobile-first-product-photography-strategy-that-converts/) — aspect-ratio mismatch, tighter crops, foreground-dominant composition
19. [Online Store News — Mobile-First Product Photography System](https://onlinestorenews.com/how-to-build-a-mobile-first-product-photography-system-that-actually-converts/) — Baymard 2026: 56% abandon due to poor imagery, shot list architecture
20. [GESTEL — Live Commerce Thumbnails](https://www.gestel.studio/blog/live-commerce-thumbnail-product-photos) — single focal product, safe-zone composition, thumbnail clarity
21. [Rewarx — Product Images for TikTok Shop and Instagram 2026](https://www.rewarx.com/blogs/create-product-images-tiktok-shop-instagram-shopping-2026) — 9:16 capture, 4:5 and 1:1 crops, vertical-first strategy
22. [Online Store News — Mobile-First PDPs 2026](https://onlinestorenews.com/mobile-first-pdps-are-now-the-primary-conversion-battleground-in-2026/) — 68% mobile sessions, PDP conversion battleground
23. [expo-image iOS contentPosition bug](https://github.com/expo/expo/issues/44466) — white line/gap with cover + contentPosition, rounding issue

---

## 11. Summary

ThryftVerse's media treatment foundation is strong: `CachedImage` is a production-grade wrapper with CDN downscaling, focal-point support, blurhash wiring, shimmer placeholders, and crafted failure fallbacks. The `getCategoryFocalPoint` system and `resolveListingMediaAspectRatio` utility demonstrate the right architecture.

The flagship gaps are in **adoption and data flow**, not architecture:

1. **Flagship card components (`FlagshipProductCard`, `FlagshipAssetCard`) bypass the production media pipeline** — no focal points, hardcoded aspect ratios, no blurhash, no onError handlers. They are less media-fidelity-aware than the `ProductCardV2` they are meant to supersede.
2. **BlurHash and dominant-color metadata exist in API contracts but do not flow to the rendering layer** on most surfaces. The progressive loading story is shimmer-only.
3. **Skeleton geometry does not match final media geometry** on masonry surfaces, causing layout shift.
4. **`FlagshipProfileMedia` cover has no focal point**, risking head-cutoff on lifestyle cover photos.
5. **`FlagshipAssetCard` has a card shell** that violates the "image is the card" philosophy for media surfaces.

The fix sequence is clear: Phase 1 (P0) wires focal points and onError handlers to flagship cards and replaces hardcoded ratios. Phase 2 (P1) flows blurhash/dominant-color from API to render and fixes skeleton geometry. Phase 3 (P2) moves to per-image focal-point metadata, ThumbHash adoption, and multi-crop presets.

The 2026 industry benchmark is unambiguous: media-first apps that win (Pinterest, Instagram, Depop) treat images as the primary surface, use true aspect ratios, preserve focal points, and load progressively with encoded placeholders. ThryftVerse has the architecture to match them — the flagship upgrade is about wiring it end-to-end.
