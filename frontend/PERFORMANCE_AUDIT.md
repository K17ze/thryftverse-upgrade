# Performance Audit — FlatList Migration & Anti-Pattern Review

> **Date:** 2026-09-02
> **Auditor:** Performance optimization pass
> **Scope:** `frontend/src/**/*.tsx` — list rendering, anti-patterns, Hermes/New Arch status

---

## 1. Infrastructure summary

| Concern | Status | Evidence |
|---------|--------|----------|
| `@shopify/flash-list` installed | ✅ `2.0.2` | `package.json` line 93 |
| Metro `inlineRequires` | ✅ Opt-in with blockList | `metro.config.js` lines 38–53 |
| Metro tree-shaking | ✅ Automatic (Metro transformer) | Metro tree-shakes unused exports by default; `inlineRequires` defers module evaluation |
| Hermes engine | ✅ Enabled | `android/gradle.properties` `hermesEnabled=true`; Expo SDK 57 defaults to Hermes |
| New Architecture (Fabric + TurboModules) | ✅ Enabled | `android/gradle.properties` `newArchEnabled=true`; Expo SDK 57 defaults to New Arch |
| Reanimated worklets (off JS thread) | ✅ Active | `react-native-reanimated` 4.5, `react-native-worklets` plugin in `babel.config.js` |
| React Compiler (auto-memoisation) | ✅ Enabled | `babel-plugin-react-compiler` in `babel.config.js` with `compilationMode: 'infer'` |
| `transform-remove-console` (production) | ✅ Enabled | `babel.config.js` — strips `console.log/warn` in production, preserves `console.error` |
| `expo-image` with `cachePolicy` | ✅ Widely used | 25+ components use `cachePolicy="memory-disk"` or `cachePolicy="disk"` |
| Lazy screen loading | ✅ Via React Navigation | `getComponent(() => require(...))` pattern + `inlineRequires` defers module eval |
| `React.lazy` / dynamic import | ❌ Not used | Not needed — React Navigation's `getComponent` pattern achieves the same deferral for screen modules |

### Notes
- `LIST_RENDERING_POLICY.md` documents FlashList v2 as the default list component.
  60+ screens already use FlashList. This audit covers the remaining FlatList instances.
- The React Compiler (`babel-plugin-react-compiler`) auto-memoises components and hooks,
  which mitigates many traditional anti-patterns (missing `memo()`, inline style objects,
  missing `useCallback`). However, explicit memoisation is still best practice for
  list item components rendered in tight loops.

---

## 2. FlatList usage audit

### 2.1 Migration candidates — HIGH priority

These are user-visible, scrollable lists that can grow beyond a screen and should
migrate to FlashList v2.

| # | File | Line | List type | Approx. size | Context | Priority |
|---|------|------|-----------|--------------|---------|----------|
| 1 | `src/screens/LiveStreamViewerScreen.tsx` | 696 | Flat (vertical, inverted chat) | Unbounded (live chat) | Live stream chat overlay — messages accumulate during stream. Should use FlashList with `inverted` per LIST_RENDERING_POLICY §2.4. | **HIGH** |
| 2 | `src/creator/tools/commerce/ProductBrowserSheet.tsx` | 538 | Grid (2 columns, vertical) | Potentially many (product catalog search) | Product picker sheet in creator tools. Search results can return dozens of products. | **HIGH** |

### 2.2 Migration candidates — MEDIUM priority

These are scrollable lists that may grow beyond a screen but are less critical
to sustained scroll performance.

| # | File | Line | List type | Approx. size | Context | Priority |
|---|------|------|-----------|--------------|---------|----------|
| 3 | `src/components/MoodboardCommentsSheet.tsx` | 187 | Flat (vertical) | Potentially long (comments thread) | Comments sheet — similar to chat, can accumulate many comments. Should use FlashList with `inverted` or standard. | **MEDIUM** |
| 4 | `src/components/closet/SaveToCollectionModal.tsx` | 253 | Flat (vertical) | Bounded (user collections, typically < 50) | Collections picker modal. Bounded but could grow for power users. | **MEDIUM** |
| 5 | `src/screens/CreatePosterHighlightScreen.tsx` | 405 | Grid (N columns, vertical) | Potentially many (all user stories) | Frame selection grid for creating highlights. Could have many stories. | **MEDIUM** |
| 6 | `src/creator/CreatorTemplateBrowser.tsx` | 354 | Grid (2 columns, vertical) | Bounded (template catalog, ~20–40) | Template browser. Bounded but grid rendering benefits from FlashList recycling. | **MEDIUM** |

### 2.3 Migration candidates — LOW priority

These are bounded lists with `scrollEnabled={false}` (rendered inside a parent
ScrollView) or very small fixed lists. FlatList is acceptable here per
LIST_RENDERING_POLICY §2.3 ("For lists guaranteed <20 items, FlatList is
acceptable but FlashList is preferred for recycling consistency").

| # | File | Line | List type | Approx. size | Context | Priority |
|---|------|------|-----------|--------------|---------|----------|
| 7 | `src/screens/SellerVerificationScreen.tsx` | 304, 319 | Flat (vertical, `scrollEnabled=false`) | Bounded (verification demands, < 10) | Two non-scrollable lists inside a ScrollView. | **LOW** |
| 8 | `src/screens/LiveStreamSellerScreen.tsx` | 424 | Flat (vertical, `scrollEnabled=false`) | Bounded (stream lots, < 20) | Lot list in seller setup, non-scrollable. | **LOW** |
| 9 | `src/screens/LiveStreamSellerScreen.tsx` | 645 | Flat (vertical, `scrollEnabled=false`) | Fixed (max 3 — `slice(index+1, index+4)`) | "Up Next" preview, always max 3 items. | **LOW** |
| 10 | `src/creator/tools/captions/CaptionEditorSheet.tsx` | 483 | Flat (vertical, `scrollEnabled=false`) | Bounded (caption segments, < 30) | Caption segments list, non-scrollable inside sheet. | **LOW** |
| 11 | `src/components/look/OutfitPieceEditor.tsx` | 148, 199 | Flat (vertical, `scrollEnabled=false`) | Bounded (outfit tags + search results) | Outfit tag editor, non-scrollable. | **LOW** |
| 12 | `src/components/discover/EditorialImageRow.tsx` | 64 | Grid (4 columns, `scrollEnabled=false`) | Fixed (4 images per row) | Non-scrollable 4-column image row. | **LOW** |
| 13 | `src/creator/tools/effects/AIEffectGrid.tsx` | 294 | Grid (3 columns, vertical) | Bounded (AI effect presets, ~12–20) | Effect picker grid. Bounded but scrollable. | **LOW** |

### 2.4 NOT migration candidates — Horizontal carousels / pagers

These use `FlatList` from `react-native-gesture-handler` for pinch-zoom gesture
integration or are bounded horizontal pagers (2–10 items). FlashList v2 does not
support the gesture-handler integration required for pinch-to-zoom carousels.
These should remain as FlatList.

| # | File | Line | Type | Reason |
|---|------|------|------|--------|
| 14 | `src/components/commerce/CommerceMediaStage.tsx` | 907, 1102 | Horizontal pager (gesture-handler) | Pinch-zoom gesture integration requires gesture-handler FlatList |
| 15 | `src/components/product/FullscreenMediaViewer.tsx` | 410 | Horizontal pager (gesture-handler) | Pinch-zoom + pan gesture integration |
| 16 | `src/components/ImageViewer.tsx` | 235 | Horizontal pager | Bounded image viewer (2–10 images) |
| 17 | `src/components/coown/CoOwnMarketHighlightsCarousel.tsx` | 160 | Horizontal carousel | Bounded carousel with auto-play |
| 18 | `src/components/discover/EditorialDiscoveryHero.tsx` | 121 | Horizontal hero carousel | Bounded hero carousel with auto-play |
| 19 | `src/components/discover/HeroCarousel.tsx` | 139 | Horizontal paging carousel | Bounded paging carousel with auto-play |
| 20 | `src/components/ui/MediaStage.tsx` | 624 | Horizontal pager (gesture-handler) | Pinch-zoom gesture integration |
| 21 | `src/components/product/ProductMediaGallery.tsx` | 274, 390 | Horizontal gallery (gesture-handler) | Pinch-zoom + viewability tracking |
| 22 | `src/components/look/LookMediaCarousel.tsx` | 843 | Horizontal carousel (gesture-handler) | Pinch-zoom gesture integration |
| 23 | `src/creator/CreatorTemplateBrowser.tsx` | 365 | Horizontal featured rail (nested) | Bounded horizontal rail inside ListHeaderComponent |

### 2.5 Already migrated (FlatList is fallback only)

| # | File | Note |
|---|------|------|
| 24 | `src/creator/tools/stickers/StickerBrowserSheet.tsx` | Uses FlashList; `FlatList` is exported as `StickerGridFallback` for environments without FlashList |
| 25 | `src/creator/tools/MediaBrowser/MediaBrowserSheet.tsx` | Uses FlashList; FlatList import may be unused — verify and remove if dead |

---

## 3. Performance anti-pattern audit

### 3.1 `console.log` in production code

**Status: ✅ Clean**

Only 2 `console.log` instances found in `src/`, both `__DEV__` gated:
- `src/platform/monitoring/performanceMonitor.ts:323` — inside `if (__DEV__)` block
- `src/utils/accessibilityAudit.ts:428` — inside `if (!__DEV__) return` guard

Additionally, `babel.config.js` uses `babel-plugin-transform-remove-console` with
`exclude: ['error']` in production builds, which strips all `console.log/warn`
calls at build time as a safety net.

### 3.2 Inline style objects in render

**Status: ⚠️ Low risk (mitigated by React Compiler)**

A few inline style objects exist (e.g., `style={{ flex: 1, gap: Space.xs / 2 }}`
in `OutfitPieceEditor.tsx:165`, `style={{ height: StyleSheet.hairlineWidth }}`
in `MoodboardCommentsSheet.tsx:192`). The React Compiler (`babel-plugin-react-compiler`
with `compilationMode: 'infer'`) auto-memoises these, preventing the re-render
penalty that inline styles traditionally cause. No action required unless the
compiler is disabled.

### 3.3 Missing `memo()` on list item components

**Status: ⚠️ Low risk (mitigated by React Compiler)**

Some list item components are not explicitly wrapped in `React.memo()` (e.g.,
inline `renderItem` arrows in `LiveStreamSellerScreen.tsx`, `SellerVerificationScreen.tsx`).
The React Compiler auto-memoises these. For the HIGH priority migration candidates
(§2.1), the FlashList migration should include `useCallback`-wrapped `renderItem`
per LIST_RENDERING_POLICY §3.1, which is the canonical pattern regardless of
compiler optimisation.

### 3.4 `useEffect` with missing or overly broad dependency arrays

**Status: Not audited in this pass** — This requires static analysis of every
`useEffect` call across the codebase. The `eslint-plugin-react-hooks` package
(devDependency) is configured and will flag missing/exhaustive dependencies at
lint time. Run `npm run lint` to surface these.

### 3.5 Large component trees without `React.lazy` / dynamic import

**Status: ✅ Handled via alternative pattern**

No `React.lazy` usage found. However, the app uses React Navigation's
`getComponent(() => require(...))` pattern for screen-level code splitting,
which achieves the same deferral as `React.lazy` but is better suited for
navigation-based apps. Combined with Metro's `inlineRequires` (opt-in in
`metro.config.js`), non-screen modules are also deferred to first use.
This is the recommended 2026 pattern for React Native apps.

---

## 4. Hermes and New Architecture status

### 4.1 Hermes JS engine

| Location | Key | Value | Status |
|----------|-----|-------|--------|
| `android/gradle.properties:42` | `hermesEnabled` | `true` | ✅ |
| `app.json` | `jsEngine` | **not set** | ⚠️ Added in this audit (see below) |
| Expo SDK 57 default | — | Hermes | ✅ (default since RN 0.70) |

**Action taken:** Added `"jsEngine": "hermes"` to `app.json` for explicit
declaration. This ensures the Hermes engine is used on all platforms (including
iOS and web) and makes the configuration self-documenting.

### 4.2 New Architecture (Fabric + TurboModules + JSI)

| Location | Key | Value | Status |
|----------|-----|-------|--------|
| `android/gradle.properties:38` | `newArchEnabled` | `true` | ✅ |
| `app.json` / `app.config.js` | `newArchEnabled` | **not set** | ℹ️ Not an Expo app.json key |
| Expo SDK 57 default | — | New Arch on | ✅ (default in SDK 57 / RN 0.86) |

**Note:** `newArchEnabled` is a native build property (gradle.properties for
Android, Podfile for iOS), not an Expo `app.json` key. Expo SDK 57 enables the
New Architecture by default. The `android/gradle.properties` explicitly sets
`newArchEnabled=true` for Android. For iOS, Expo's prebuild generates the
correct Podfile configuration automatically. No action needed.

---

## 5. Recommendations

### Immediate (this audit)
1. **Add `jsEngine: 'hermes'` to `app.json`** — Done in this pass.
2. **Migrate HIGH priority FlatLists to FlashList** (§2.1):
   - `LiveStreamViewerScreen.tsx` chat list → FlashList with `inverted`
   - `ProductBrowserSheet.tsx` product grid → FlashList with `numColumns={2}`
3. **Remove dead FlatList import** in `MediaBrowserSheet.tsx` if unused (§2.5, item 25).

### Short-term (next sprint)
4. **Migrate MEDIUM priority FlatLists to FlashList** (§2.2):
   - `MoodboardCommentsSheet.tsx` comments list
   - `SaveToCollectionModal.tsx` collections list
   - `CreatePosterHighlightScreen.tsx` frame grid
   - `CreatorTemplateBrowser.tsx` template grid
5. **Run `npm run bundle:analyze`** to verify JS bundle is under 2MB budget.
6. **Profile cold start in release mode** on a mid-tier Android device to
   verify < 2.0s TTI target.

### Ongoing
7. Run `npm run lint` regularly to catch `useEffect` dependency issues.
8. Run `npm run check:residue` in CI to catch production code residue.
9. Run `npm run check:bundle-size` in CI to enforce bundle size limits.
