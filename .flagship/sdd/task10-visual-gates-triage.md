# F18 — Visual Release Gates Triage Report

**Date:** scanner run against `frontend/` on current working tree
**Scanner:** `frontend/scripts/check-visual-release-gates.mjs` (note: script lives under `frontend/scripts/`, not repo-root `scripts/` — the path in the task brief is stale)
**Mode:** `--report` (warn-only). Default strict mode would exit 1 on the 50 P0s.

## 1. Totals

| Severity | Count | Rules |
|---|---|---|
| P0 | **50** | `no-hardcoded-color` ×37, `placeholder-screenshot-baseline` ×12, `missing-accessibility-label` ×1 |
| P1 | **17** | `missing-accessibility-role` ×13, `missing-reduced-motion` ×3, `missing-hitslop` ×1 |
| Warning | **134** | `possible-card-on-card` ×134 (all warnings are this one heuristic rule) |
| **Total** | **201** | across **1,456** files scanned |

> Drift note: the brief quoted "50 P0 / 18 P1 / 138 warnings across 1,440 files". The live run produces 50 / 17 / 134 across 1,456 files — minor drift as the tree moved; the P0 count is stable.

## 2. Triage by category

### P0 — `no-hardcoded-color` (37 findings, 10 files)

| File | Hits | Verdict |
|---|---|---|
| `src/screens/CreateAuctionScreen.tsx` (410, 681, 780, 979, 1015, 1023, 1158, 1184, 1189, 1375, 1430, 1475, 1495) | 13 | **True defect** — hardcoded `#f59e0b` amber accents, `rgba(59,130,246,*)` / `rgba(37,99,235,*)` blue tints, `rgba(0,0,0,0.7/0.85)` scrims, `#fff` surface/text, `shadowColor:'#000'`. Dark-mode aware but token-bypassing; theme already exports `colors.overlay`, `scrimTextPrimary`, accent tokens. |
| `src/components/auction/AuctionBidLadderPreview.tsx` (8 lines) | 8 | **True defect** — same hardcoded amber `#f59e0b` + blue rgba tints. Mechanical token mapping. |
| `src/services/chatPreferencesApi.ts` (30–34) | 5 | **Exception** — a `Record<ChatTheme, {light, dark}>` preset table. This is *domain data*, same class as the already-exempted `data/posters`, `data/stickerPresets`, `services/moodboardApi`. The file simply isn't in `ALLOWED_COLOR_FILES`/exemption patterns. |
| `src/components/listing/UploadProgressRing.tsx` (130, 140, 189, 193, 200) | 5 | **Exception** — SVG progress ring + scrim over media thumbnails (`rgba(255,255,255,0.45)` stroke on image, `rgba(0,0,0,*)` scrims). Same media-overlay class the scanner exempts for camera surfaces; file isn't in `CAMERA_SURFACE_PATTERNS`. Could optionally migrate to `colors.overlay`/`scrimText*` tokens. |
| `src/components/BottomSheet.tsx:345`, `BottomSheetPicker.tsx:169`, `sell/ShippingPickerSheet.tsx:56` | 3 | **True defect** — drag-handle `isDark ? colors.border : 'rgba(0,0,0,0.2)'`: half-themed, light branch hardcoded. One-token fix each. |
| `src/screens/YourAlgorithmScreen.tsx:559` | 1 | **True defect** — `sheetScrim: 'rgba(0,0,0,0.4)'`; `colors.overlay` token exists for exactly this. |
| `src/components/coown/CoOwnMarketHighlightsCarousel.tsx:124`, `CoOwnFeaturedAsset.tsx:68` | 2 | **Scanner limitation** — the flagged "color" is `'#000000'` inside a **block-comment continuation line** documenting scrim derivation ("the theme's scrim base, '#000000' in both themes"). Real code derives from `colors.shadow`. Comment-skip logic only strips lines starting with `//`, `*`, `/*` — not mid-block lines. |

**P0 color subtotal: 25 true defects · 10 exceptions · 2 scanner limitations.**

### P0 — `placeholder-screenshot-baseline` (12 findings)

All 12 golden-route baseline PNGs in `src/__tests__/__screenshots__/` are **70-byte 1×1 placeholders** (auction, chat, coown, home, inbox, pdp, poster, profile, search, sell, seller-hub, settings).

- **Verdict: True defect ×12** (infrastructure gap, not a code bug). Per the P0.6 gate, a green build requires approved device baselines. Fix = run `.maestro/golden-route-screenshots.yml` on the device matrix, review against the optical rubric, commit real PNGs. Cannot be closed by code edits.

### P0 — `missing-accessibility-label` (1 finding)

- `src/components/coown/asset-detail/AssetOwnershipSection.tsx:456` — **Scanner limitation.** The Pressable has `accessibilityRole="button"`, `accessibilityState`, and a `<Text>` child — but the text is a JSX **expression** `{eventsExpanded ? 'Hide past events' : 'Past events (N)'}`, which the `hasTextChild` regex (`/>[^<{]{2,}</`) cannot see. False positive; the control is accessible.

### P1 — `missing-accessibility-role` (13 findings)

- `CreateAuctionScreen.tsx` ×11 (260, 281, 292, 519, 559, 565, 571, 618, 624, 631, 746) — **True defect.** Back buttons, phase tabs, preset chips: all are genuine interactive controls missing `accessibilityRole`. Mechanical fix: `accessibilityRole="button"` (+ label on the two icon-only back buttons).
- `YourAlgorithmScreen.tsx` ×2 (357–358) — **True finding, needs judgment.** The two Pressables are a sheet-scrim dismiss target and an inner touch-blocker (`onPress={() => {}}`). Correct treatment is likely `accessible={false}` on the blocker + `accessibilityRole="button"`/`accessibilityLabel="Close"` on the scrim — not blindly adding roles to both.

### P1 — `missing-hitslop` (1 finding)

- `src/creator/publish/CreatorPublishReview.tsx:89` — **Scanner limitation.** The Pressable wraps a `<CreatorCanvas>` page **thumbnail** in the cover picker (a large target, already >44pt). The heuristic saw `<Ionicons>` in the 300-char child window — but that's a tiny checkmark *badge* overlay, not the control's content. False positive.

### P1 — `missing-reduced-motion` (3 findings)

- `src/components/home/HomeHeader.tsx`, `src/components/home/HomeMasonryFeed.tsx`, `src/components/myprofile/ProfileHeaderHero.tsx` — **True defect ×3.** All use `useAnimatedStyle` for scroll-driven collapse/parallax with no `useReducedMotion`/`useMotionConfig` handling anywhere in-file. Correct per the gate; fix is mechanical (guard shared-value drivers with `useReducedMotion()`).

### Warnings — `possible-card-on-card` (134 findings)

The rule flags any **two** `<View|Card|Surface|FlagshipScreen|…>` tags carrying `style` + `backgroundColor` within **300 characters** — it never verifies actual parent/child nesting. Sampled evidence:

- `skeletons/*`, `CommerceStateCanvas` (9 hits), `CandleChart`/`ProfileSkeleton` — skeleton loader bars on a container: intentional layering, not cards. (~13+ skeleton hits)
- `src/creator/*` (22 hits) — camera grid lines, framing brackets, tool docks over media: media-surface overlays exempted from other checks but not this one.
- `SettingsScreen:98` (status pill → status dot in a row), `AITrustBadge:78` (badge + nearby view) — siblings/pills/dots tripping the 300-char proximity window.
- Residual plausible cases in `screens/*` (36 hits), `components/coown/*` (27), `components/commerce/*` (10), `components/seller/*` (5), `chat` (5) — panels that *may* genuinely nest a surfaced card; each needs a visual read.

**Estimated warning split:** ~55% scanner limitation (proximity, siblings, pills/dots/skeleton bars), ~30% exception (creator/media overlays + intentional skeletons), ~15% indeterminate → need individual design judgment.

## 3. Findings by verdict

| Verdict | Count | Share |
|---|---|---|
| **True defect** | **53** | 25 color + 12 baselines + 13 a11y-role (incl. 2 judgment fixes) + 3 reduced-motion |
| **Exception** | **~50** | 10 color (chat-prefs data 5 + media scrims 5) + ~40 warnings (creator overlays, intentional skeletons) |
| **Scanner limitation** | **~98** | 2 comment-hex + 1 a11y-label + 1 hitslop + ~94 warnings (proximity false positives) |

## 4. Top patterns

1. **`possible-card-on-card` — 134 (67% of all findings).** Pure proximity heuristic; dominated by false positives.
2. **`no-hardcoded-color` — 37 (18%).** Concentrated: `CreateAuctionScreen` (13) + `AuctionBidLadderPreview` (8) = 57% of the rule's hits in 2 files; amber `#f59e0b`/blue `rgba(59,130,246,*)` accent tints are the recurring literal.
3. **`placeholder-screenshot-baseline` — 12 (6%).** Single root cause: all golden-route baselines are 70-byte stub PNGs.

## 5. Recommended actions & effort

| Bucket | Action | Effort |
|---|---|---|
| P0 color defects (25) | Bulk token-mapping pass: amber/blue accents → theme accent tokens; scrims → `colors.overlay`; `#fff`-on-media → `scrimTextPrimary`; sheet handles → `colors.border*`. Two files carry most of it. | ~0.5–1 dev-day (mechanical, needs a token-mapping decision table) |
| P0 baselines (12) | Run Maestro golden-route flow on the device matrix; review + commit real PNGs. **Blocks strict-mode green build.** | 1–2 days incl. device time + visual review |
| P0 exceptions (10) | Add `chatPreferencesApi.ts` to `ALLOWED_COLOR_FILES` (or move presets under `src/theme/`); add `UploadProgressRing` to `CAMERA_SURFACE_PATTERNS` or migrate to overlay tokens. | <1 hour |
| P1 a11y roles (13) | Add `accessibilityRole="button"` to 11 CreateAuctionScreen controls (+ labels on icon-only back buttons); judgment fix on the 2 YourAlgorithmScreen sheet Pressables (`accessible={false}` blocker, labelled scrim dismiss). | ~2 hours |
| P1 reduced-motion (3) | Add `useReducedMotion()` guards around the scroll-driven animated styles. | ~1–2 hours |
| Scanner limitations (4 confirmed + ~94 warnings) | Two cheap scanner fixes would cut noise: (a) strip block-comment bodies before the color scan; (b) treat JSX-expression text children as visible text for the label check; (c) exclude `creator/`, `skeletons/`, chart skeleton states from the card-on-card heuristic — or upgrade it to an AST parent/child check. | ~0.5 day scanner work |
| Warning remainder (~20–25 files) | One manual visual pass over `screens/*` + `coown/commerce/seller/chat` panel hits to catch genuine card-on-card cases against the surface-budget rule. | ~0.5 day |

## 6. Recommended next action

**Fix the 25 hardcoded-color defects in `CreateAuctionScreen` + `AuctionBidLadderPreview` first** (they are the bulk of what makes strict mode fail on real code), **then clear the 12 placeholder baselines** — those two workstreams take P0 from 50 → ~0 once the exceptions/limitations are handled via allowlist + scanner tweaks. The 134 warnings should not be bulk-fixed; they warrant a scanner upgrade plus one scoped visual audit.

---
*Read-only triage — no source files were modified. The scanner was run once in `--report` mode; a patched copy under `/tmp` (slice limits removed, `ROOT` pinned) was used only to enumerate findings beyond the 30/15-line print caps. No repo files were changed.*
