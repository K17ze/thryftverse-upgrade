# P2 #30 — Accessibility & Large-Text Certification (Research)

**Scope:** `frontend/src` — accessibility semantics, hit targets, dynamic-type/large-text support, contrast, assistive-tech focus order, camera/editor/chart surfaces.
**Method:** evidence-based grep + read audit. No AI-design speculation. Every finding cites a path:line.
**Date:** 2026-08-25

---

## 1. Executive finding

ThryftVerse has a **mature, broadly-deployed accessibility layer** — `accessibilityRole`/`Label`/`Hint`/`State` appear across 6,212 occurrences and `accessibilityLiveRegion` is used on ~15 dynamic surfaces (chat, checkout, auctions, KYC, search). The flagship financial and commerce surfaces (Wallet, Withdraw, BidSheet, MakeOffer, Checkout, SellerReputationCard) carry rich, spoken-amount labels. The creator poster editor and canvas have a dedicated `CanvasAccessibilityLabels` module with positional/state-aware labels, and `CreatorIconButton` enforces a 48pt hit target with required `accessibilityLabel`.

However, the certification is **incomplete in five measurable ways**:

1. **Charts are silent to screen readers.** The custom View-based bar charts in `SellerAnalyticsScreen` (`ActivityChart`) and `CreatorAnalyticsDashboardScreen` (`TimelineChart`) expose no `accessibilityLabel` summary — bar values are invisible to VoiceOver/TalkBack. The Victory Native `charts/` barrel (`BarChart`/`LineChart`/`CandleChart`) has zero a11y props and appears unused (only self-references). Only the co-own charts (`CoOwnCandleChart`, `CoOwnPortfolioPerformanceChart`) provide textual summaries.
2. **The dev a11y audit is dead code.** `utils/accessibilityAudit.ts` (444 lines, tree-walking WCAG checker + contrast auditor) is never invoked by any screen — `auditAccessibility(` / `auditColorContrast(` have zero call sites outside the file itself. No runtime gating.
3. **No a11y lint rules.** ESLint config (`.eslintrc.js` + `eslint.config.mjs`) extends only `@typescript-eslint` and `react-hooks`. `eslint-plugin-react-native-a11y` is not installed; there is no static enforcement of labels/roles/hit-targets.
4. **Base-theme contrast fails AA for `textMuted`.** Default (non-high-contrast) `textMuted` is below 4.5:1 on `surface`/`surfaceAlt` in both themes (dark ≈4.1–4.3:1, light ≈4.0–4.2:1). High-contrast mode fixes it but is opt-in. `textMuted` is used for 11pt meta, placeholders, helper text — all normal-size text requiring 4.5:1.
5. **Large-text / Dynamic Type is partially capped and the in-app scale is dead.** `Text.tsx` caps `maxFontSizeMultiplier` at 1.3 for prices/titles — financial figures will not scale beyond 130% even when the user requests 200%. `numberOfLines={1}` on prices/balances will truncate at large scales. The in-app `textSizeScale` (`AccessibilityPreferencesContext`) is computed but never consumed by any component — the setting is a no-op.

**Verdict:** Not certifiable as-is. The semantics exist where authored, but charts, contrast defaults, lint enforcement, runtime auditing, and full-range Dynamic Type need closure before physical-device validation can sign off.

---

## 2. Evidence table

| Surface | Path:Line | A11y defect | Severity |
|---|---|---|---|
| Seller analytics chart | `screens/SellerAnalyticsScreen.tsx:139-196` | `ActivityChart` renders bars with no `accessibilityLabel`/`accessibilityRole`; values invisible to screen readers | High |
| Creator analytics chart | `screens/CreatorAnalyticsDashboardScreen.tsx:612-671` | `TimelineChart`/`TimelineBar` expose no a11y summary; daily view counts not spoken | High |
| Victory Native charts (unused) | `components/charts/BarChart.tsx`, `LineChart.tsx:377`, `CandleChart.tsx:362` | Zero `accessibilityLabel`/`accessible` on chart container `View`; Skia canvas not exposed | Medium (dead, but a landmine if revived) |
| Dev a11y audit | `utils/accessibilityAudit.ts:106,374` | `auditAccessibility` / `auditColorContrast` never called — 0 call sites outside the file | High |
| ESLint config | `frontend/.eslintrc.js`, `frontend/eslint.config.mjs` | No `eslint-plugin-react-native-a11y`; no static rule for missing labels/roles/hit-targets | High |
| Form input primitive | `components/ui/AppInput.tsx:115-127` | `TextInput` has no `accessibilityLabel`; the `label` prop renders as a separate `Text` not associated with the input (no `nativeID`/`accessibilityLabelledBy`) | High |
| Address form | `screens/AddressFormScreen.tsx:496,523,547,566,589,605` | Raw `TextInput` fields (name, street, apartment, city, region, postal) have no `accessibilityLabel`; VoiceOver announces "Edit text" without field name | High |
| Theme contrast (dark base) | `constants/colors.ts:42` (`textMuted #7A7A7A`) on `:24` (`surface #141414`) | Contrast ≈4.28:1 < 4.5:1 AA for normal text | High |
| Theme contrast (dark base) | `constants/colors.ts:42` on `:26` (`surfaceAlt #1C1C1C`) | Contrast ≈4.12:1 < 4.5:1 | High |
| Theme contrast (light base) | `constants/colors.ts:127` (`textMuted #767676`) on `:108` (`surface #F5F5F5`) | Contrast ≈4.17:1 < 4.5:1 | High |
| Theme contrast (light base) | `constants/colors.ts:127` on `:110` (`surfaceAlt #EFEFEF`) | Contrast ≈3.99:1 < 4.5:1 | High |
| Price large-text cap | `components/ui/Text.tsx:230,253,276` | `Price`/`PriceCompact`/`PriceLarge` set `maxFontSizeMultiplier={1.3}` — financial figures won't scale past 130% | Medium |
| Title large-text cap | `components/ui/Text.tsx:154,176,198` | `Title1/2/3` capped at 1.3 — screen titles won't reach 200% | Medium |
| In-app text scale (dead) | `context/AccessibilityPreferencesContext.tsx:27,115` | `textSizeScale` computed but grep finds 0 consumers outside the context — setting has no effect | High |
| Balance truncation | `screens/WalletScreen.tsx:681` | `numberOfLines={1}` on balance figure — truncates at large font scale | Medium |
| Camera zoom (visual search) | `components/VisualSearchCamera.tsx:52-189` | Tap-focus is labelled (`accessibilityLabel="Tap Focus"` :190) but no zoom control is exposed to assistive tech | Low |
| Editor micro-controls | `creator/CreatorAssetPicker.tsx:4809,4865,4857` | `brushSliderHandle` 22pt, `sliderPreviewHandle` 20pt, `questionPreviewSendDot` 24pt — below 44pt with no `hitSlop` on the style | Medium |

**Positive evidence (surfaces that pass):**
- `components/AnimatedPressable.tsx:49,141-143` — default `hitSlop` 12pt, defaults `accessibilityRole='button'`, merges `disabled` into `accessibilityState`.
- `creator/controls/CreatorIconButton.tsx:48,166,174-180` — 48pt target (min 44), required `accessibilityLabel`, `accessibilityState` with `selected`/`disabled`.
- `creator/core/a11y/CanvasAccessibilityLabels.ts:1-40` — positional/state-aware layer/tool/timeline labels for the canvas.
- `components/coown/CoOwnCandleChart.tsx:126,154` — `accessibilityLabel={textualSummary}` on chart; `CoOwnPortfolioPerformanceChart.tsx:222` — `a11ySummary` spoken.
- `components/seller/SellerReputationCard.tsx:81-90` — `accessibilityRole="summary"` + per-metric labels.
- `screens/WithdrawScreen.tsx:559-801` — full label/hint coverage on payout flow.
- `components/ui/BidSheet.tsx:408-672` — bid amount, quick-offer, confirm, cancel all labelled.
- `screens/MakeOfferScreen.tsx:283-524` — offer amount, quick-offer % , validity, retry labelled.
- `creator/camera/CaptureToolsSheet.tsx:209-239,398-467` — close, timer, tool, settings all labelled with `accessibilityState`.
- `screens/CheckoutScreen.tsx:1560,1631,1944,2049` — `accessibilityLiveRegion` on error/progress.

---

## 3. Hit-target violations list

The canonical pressable (`AnimatedPressable`) and `CreatorIconButton` meet 44pt via defaults. Violations are in ad-hoc `Pressable`/`View` controls:

| Control | Path:Line | Size | Issue |
|---|---|---|---|
| Brush slider handle | `creator/CreatorAssetPicker.tsx:4809` | 22×22 | Below 24pt CSS minimum; no `hitSlop` |
| Slider preview handle | `creator/CreatorAssetPicker.tsx:4865` | 20×20 | Below minimum; no `hitSlop` |
| Question preview send dot | `creator/CreatorAssetPicker.tsx:4857` | 24×24 | At minimum, below 44pt recommended; no `hitSlop` |
| Music preview play btn | `creator/CreatorAssetPicker.tsx:4742` | 32×32 | Below 44pt; verify `hitSlop` at call site |
| Music add btn | `creator/CreatorAssetPicker.tsx:4750` | 36×36 | Below 44pt; verify `hitSlop` |
| Sticker search clear | `creator/CreatorAssetPicker.tsx:4763` | 32×32 | Below 44pt; verify `hitSlop` |
| Draft list item control | `creator/CreatorDraftListScreen.tsx:685` | 32×32 | Below 44pt; verify `hitSlop` |
| Profile avatar (small) | `screens/UserProfileScreen.tsx:718` | 28×28 | Below 44pt; verify `hitSlop` |
| Review thumb | `components/profile/ProfileReviews.tsx:222,309` | 28×28 | Decorative thumb; if tappable, needs `hitSlop` |
| Spectrum indicator | `creator/CreatorAssetPicker.tsx:4803` | 28×28 | Overlay indicator; verify tap handling |
| Switch thumb (CaptureTools) | `creator/camera/CaptureToolsSheet.tsx:569-577` | 44×26 track / 22×22 thumb | Track height 26 < 44; relies on `hitSlop` |
| Visual search close | `components/VisualSearchCamera.tsx:232` | `hitSlop={12}` on small btn | OK — hitSlop present, verify visual size |

Note: many `CreatorAssetPicker` controls are editor-internal drag handles where the gesture is the value; these still need a 44pt accessible target or an explicit `accessibilityRole` with a labelled alternative action.

---

## 4. Large-text risk list (screens that break at 200% font scale)

| Screen | Path | Risk |
|---|---|---|
| Wallet | `screens/WalletScreen.tsx:681` | Balance `numberOfLines={1}` truncates; `localFiatText` :446 `numberOfLines={1}` |
| Sell | `screens/SellScreen.tsx:526,1208,1211,1455,1461,1467` | Tag/title/subtitle `numberOfLines={1}` on dense rows; autofill values truncate |
| Checkout | `screens/CheckoutScreen.tsx:1531,1963,2053` | Balance amount `numberOfLines={1}`; progress label `numberOfLines={1}` |
| Any screen using `T.Price`/`T.PriceLarge` | `components/ui/Text.tsx:230,276` | `maxFontSizeMultiplier={1.3}` hard-caps financial figures at 130% — won't honour 200% Dynamic Type |
| Any screen using `T.Title1/2/3` | `components/ui/Text.tsx:154,176,198` | Screen titles capped at 130% |
| Seller analytics | `screens/SellerAnalyticsScreen.tsx:187` | Chart axis labels `numberOfLines={1}` — at 200% labels collide/truncate |
| Creator analytics | `screens/CreatorAnalyticsDashboardScreen.tsx:655-671` | Timeline labels every Nth; at 200% the label interval logic doesn't account for scaled text height |
| Address form | `screens/AddressFormScreen.tsx:496-605` | Raw `TextInput` with no `maxFontSizeMultiplier` — inputs scale fully but layout `minHeight` is fixed in `AppInput` (48pt) and may clip |

**Dead in-app scale:** `AccessibilityPreferencesContext.textSizeScale` (`context/AccessibilityPreferencesContext.tsx:115`) is never read by any component, so the Accessibility Settings "Small/Medium/Large/XL" toggle (`screens/AccessibilitySettingsScreen.tsx:33-37`) currently changes nothing. The only live scaling path is the OS fontScale × `maxFontSizeMultiplier` caps above.

---

## 5. Contrast risks

Computed against `constants/colors.ts` base palette (high-contrast overrides in `ThemeContext.tsx:125-151` are opt-in):

| Pair | Foreground | Background | Ratio | Required | Status |
|---|---|---|---|---|---|
| Dark textMuted on surface | `#7A7A7A` | `#141414` | ≈4.28:1 | 4.5:1 | **Fail** |
| Dark textMuted on surfaceAlt | `#7A7A7A` | `#1C1C1C` | ≈4.12:1 | 4.5:1 | **Fail** |
| Dark textMuted on background | `#7A7A7A` | `#0A0A0A` | ≈4.58:1 | 4.5:1 | Pass (marginal) |
| Dark textSecondary on surface | `#A3A3A3` | `#141414` | ≈7.3:1 | 4.5:1 | Pass |
| Light textMuted on surface | `#767676` | `#F5F5F5` | ≈4.17:1 | 4.5:1 | **Fail** |
| Light textMuted on surfaceAlt | `#767676` | `#EFEFEF` | ≈3.99:1 | 4.5:1 | **Fail** |
| Light textSecondary on surface | `#666666` | `#F5F5F5` | ≈5.26:1 | 4.5:1 | Pass |

`textMuted` is the token used for: 11pt `meta` typography (`theme/typography.v2.ts:131`), placeholder text (`AppInput.tsx:123`), helper text (`AppInput.tsx:131`), chart axis labels (`SellerAnalyticsScreen.tsx:187`), timestamps. All are normal-size text requiring 4.5:1. The high-contrast palette (`#9A9A9A` dark / `#5A5A5A` light) passes (~6:1 / ~7.4:1) but is not the default.

**Risk:** any surface using `colors.textMuted` on a `surface`/`surfaceAlt` card in the default theme fails WCAG AA. This is pervasive (456 files reference `textSecondary`/`textMuted`).

---

## 6. Assistive-tech semantic gaps

**Forms (Sell, Edit, Checkout, Payout, Address):**
- `AppInput` (`components/ui/AppInput.tsx:115`) does not associate the visible `label` `Text` with the `TextInput`. VoiceOver will read the label as a separate element then "Edit text, double tap to edit" for the field — the field name is not bound. Fix: pass `accessibilityLabel={label}` on the `TextInput`, or use `nativeID` + `accessibilityLabelledBy`.
- `AddressFormScreen` uses raw `TextInput` (`screens/AddressFormScreen.tsx:496-605`) with a sibling `Text` label and no `accessibilityLabel` — same gap, worse because there's no `AppInput` wrapper.
- `SellScreen` (`screens/SellScreen.tsx`) has strong label coverage on buttons but the price/title `TextInput` fields need verification (grep shows labels on surrounding controls, not the inputs themselves).

**Focus order:** No explicit `accessibilityFocusOrder` / `tabIndex` found. Forms rely on visual DOM order, which is generally correct, but `AddressFormScreen` uses ref-based `onSubmitEditing` chaining (`:506,533,555`) — this helps keyboard users but does not set VoiceOver swipe order explicitly. Acceptable but worth device-validation.

**Charts:** `ActivityChart` and `TimelineChart` are the primary gap — a screen reader user gets "image" or nothing for the central data visualisation. The co-own charts are the model to replicate (`CoOwnCandleChart.tsx:126` `textualSummary`).

**Camera/editor:** `VisualSearchCamera` labels focus, flash, shutter, switch, gallery (`components/VisualSearchCamera.tsx:190,250,275,285`). `CaptureToolsSheet` labels all tools (`creator/camera/CaptureToolsSheet.tsx:209-467`). `AIPhotoEnhancementScreen` labels presets and before/after (`screens/AIPhotoEnhancementScreen.tsx:290-436`). Gap: no zoom slider/affordance is exposed; pinch-zoom is invisible to assistive tech. The creator canvas has full label support via `CanvasAccessibilityLabels.ts`.

**Live regions:** well-deployed — `ChatScreen` (5), `CheckoutScreen` (4), `AuctionDetailScreen` (4), `LoginScreen` (2), `SignUpScreen` (2), `AuthLandingScreen` (2), plus banners/tooltips. No `assertive` misuse found (assertive reserved for errors).

---

## 7. Proposed a11y certification programme

### 7.1 Lint rules (static enforcement)
Install `eslint-plugin-react-native-a11y` (or `@react-native/eslint-plugin-a11y`) and enable as **errors** in `.eslintrc.js` / `eslint.config.mjs`:
- `react-native-a11y/has-accessibility-label` — icon-only `Pressable`/`TouchableOpacity` must have `accessibilityLabel`.
- `react-native-a11y/has-accessibility-hint` — icon-only controls should have `accessibilityHint`.
- `react-native-a11y/no-nested-touchables` — prevent inaccessible touchable nesting.
- `react-native-a11y/accessible-touchable` — touchables must have `accessible` not false.
- `react-native-a11y/has-valid-accessibility-role` — valid role values.
- `react-native-a11y/no-missing-accessibility-state` — `Switch`/checkbox must declare `accessibilityState.checked`.
- Custom rule (codemod): any `<Text>` rendering a price/balance/amount must not set `numberOfLines={1}` without an `accessibilityLabel` fallback.

### 7.2 Component prop requirements
- **`AnimatedPressable`**: already defaults `hitSlop` 12pt + `role='button'` + `disabled` state. Keep as the only sanctioned pressable.
- **`AppInput`**: add `accessibilityLabel={label}` to the inner `TextInput` (or `accessibilityLabelledBy` via `nativeID`). Make `label` required when no `placeholder` is set. Add `maxFontSizeMultiplier` passthrough.
- **`Text.tsx` primitives**: raise `maxFontSizeMultiplier` for `Price`/`PriceLarge` from 1.3 → 1.5 minimum (financial figures must scale); keep titles at 1.3 only if layout is verified to reflow. Remove `numberOfLines={1}` from any price/balance usage at call sites; allow wrap.
- **Charts**: require an `accessibilitySummary: string` prop on `ActivityChart`, `TimelineChart`, and the `charts/` barrel components; render an off-screen `<Text accessibilityLabel={summary} accessibilityRole="text">` inside the chart container.
- **`CreatorIconButton`**: already correct — keep as the only sanctioned icon button.

### 7.3 Runtime audit (revive dead code)
- Wire `auditAccessibility` into `__DEV__` `useEffect` on the top 20 screens (Home, Sell, Checkout, Wallet, Withdraw, ItemDetail, AuctionDetail, MakeOffer, BidSheet, AddressForm, SellerAnalytics, CreatorAnalytics, ChatScreen, etc.). Fail CI if the dev audit log contains errors on a smoke run.
- Wire `auditColorContrast` against the theme palette pairs in `__DEV__` at app boot; assert all `textMuted`/`textSecondary` on `surface`/`surfaceAlt`/`background` pairs pass 4.5:1 in **both** base and high-contrast palettes.

### 7.4 Contrast remediation
- Raise base `textMuted` to the high-contrast values (`#9A9A9A` dark / `#5A5A5A` light) as the **default**, or pick intermediate values that clear 4.5:1 on `surface` and `surfaceAlt` (dark needs ≥ `#888888` on `#1C1C1C`; light needs ≤ `#6E6E6E` on `#EFEFEF`). Keep the high-contrast toggle for AAA.
- Alternatively, restrict `textMuted` to ≥18pt (large text, 3:1) usage only and route all 11pt meta to `textSecondary`.

### 7.5 Large-text remediation
- Make `AccessibilityPreferencesContext.textSizeScale` actually scale text: apply it as a multiplier on `fontSize` inside `Text.tsx` primitives (or set `PixelRatio.getFontScale()` override in dev). Today the setting is a no-op.
- Audit every `numberOfLines={1}` on prices/balances/addresses and either remove the cap or provide an `accessibilityLabel` with the full value (Wallet already does this at `:437,517,530` — replicate).

### 7.6 Device test matrix

| Device | OS | Screen reader | Font scale | Themes |
|---|---|---|---|---|
| iPhone 15 | iOS 17 | VoiceOver on/off | 100%, 130%, 200% | Light + Dark + High-contrast |
| iPhone SE (small screen) | iOS 17 | VoiceOver | 200% | Dark |
| Pixel 8 | Android 14 | TalkBack on/off | 100%, 130%, 200% | Light + Dark |
| Samsung A-series (dense) | Android 14 | TalkBack | 200% | Dark |

### 7.7 Per-surface physical-device checklist

| Surface | Path | Checklist |
|---|---|---|
| Sell / Edit listing | `screens/SellScreen.tsx`, `EditListingScreen.tsx` | Every field announced with name; price input speaks currency; photo add/remove labelled; category/brand/size pickers announce selection; 200% font no truncation on title/price |
| Checkout | `screens/CheckoutScreen.tsx` | Total spoken; address selector labelled; payment method announces last4; error live-region announces; 200% font no truncation on totals |
| Wallet / Withdraw / Payout | `screens/WalletScreen.tsx`, `WithdrawScreen.tsx` | Balance spoken with currency; hide/show toggle announces state; amount input labelled; payout confirmation reads amount + destination |
| Address form | `screens/AddressFormScreen.tsx` | Every TextInput has bound label; postcode suggestion announced; country picker announces selection; default-address switch announces state |
| Auction detail / Bid | `screens/AuctionDetailScreen.tsx`, `components/ui/BidSheet.tsx` | Bid activity live-region announces; bid amount labelled; quick-bid % announced; confirm/cancel labelled |
| Make offer | `screens/MakeOfferScreen.tsx` | Offer amount labelled; quick-offer % reads amount; validity period announced |
| Seller analytics | `screens/SellerAnalyticsScreen.tsx` | Chart speaks summary (min/max/total views); period selector announces; listing rows announce views+revenue |
| Creator analytics | `screens/CreatorAnalyticsDashboardScreen.tsx` | Timeline chart speaks summary; period selector announces; KPI cards labelled |
| Co-own charts | `components/coown/CoOwnCandleChart.tsx` | Already speaks `textualSummary`; verify range selector announces; verify 200% font on axis labels |
| Camera (visual search) | `components/VisualSearchCamera.tsx` | Focus/flash/shutter/switch/gallery labelled; verify zoom gesture has an accessible alternative |
| AI photo enhancement | `screens/AIPhotoEnhancementScreen.tsx` | Before/after toggle labelled; presets labelled with description; slider announces value |
| Creator poster editor | `creator/poster/PosterComposerScreen.tsx`, `creator/CreatorCanvas.tsx` | Undo/redo/close/next labelled; frame tray labelled; canvas layers speak via `CanvasAccessibilityLabels`; tool dock announces selected state |
| Chat | `screens/ChatScreen.tsx` | Message bubbles announce sender + content; typing indicator live-region; attachment menu labelled |
| Reputation | `components/seller/SellerReputationCard.tsx` | Summary role announces; metrics labelled |

---

## 8. Evidence tags (line refs)

- `accessibilityAudit.ts` dead: `utils/accessibilityAudit.ts:106` (export), 0 external call sites — grep `auditAccessibility\(` → only `:14` docstring + `:106` decl.
- `AnimatedPressable` defaults: `components/AnimatedPressable.tsx:49` (`DEFAULT_HIT_SLOP`), `:141` (`accessibilityRole='button'`), `:142` (`accessibilityState`), `:143` (`hitSlop`).
- `CreatorIconButton` 48pt: `creator/controls/CreatorIconButton.tsx:48` (`HIT_TARGET=48`), `:166` (`Math.max(hitTarget, HIT_MIN)`), `:174-180` (role/label/state).
- `AppInput` no label binding: `components/ui/AppInput.tsx:115-127` (TextInput has no `accessibilityLabel`), `:103` (label is sibling Text).
- `AddressFormScreen` raw TextInput: `screens/AddressFormScreen.tsx:496,523,547,566,589,605`.
- `Text.tsx` caps: `components/ui/Text.tsx:230` (Price 1.3), `:253` (PriceCompact 1.3), `:276` (PriceLarge 1.3), `:154,176,198` (Title1/2/3 1.3), `:80` (Body 2), `:32` (Caption 1.8), `:302` (Meta 1.8).
- `textSizeScale` dead: `context/AccessibilityPreferencesContext.tsx:27,115` — grep `textSizeScale` → 2 hits, both in the same file.
- Base contrast fails: `constants/colors.ts:42` (`textMuted #7A7A7A`), `:24` (`surface #141414`), `:26` (`surfaceAlt #1C1C1C`), `:127` (`textMuted #767676`), `:108` (`surface #F5F5F5`), `:110` (`surfaceAlt #EFEFEF`).
- High-contrast fix: `theme/ThemeContext.tsx:131-132` (dark), `:145-146` (light).
- Charts no a11y: `screens/SellerAnalyticsScreen.tsx:139-196` (`ActivityChart`), `screens/CreatorAnalyticsDashboardScreen.tsx:612-671` (`TimelineChart`), `components/charts/LineChart.tsx:377` (container View, no a11y), `components/charts/BarChart.tsx` (0 a11y matches), `components/charts/CandleChart.tsx:362` (0 a11y).
- Charts with a11y (model): `components/coown/CoOwnCandleChart.tsx:126,154` (`textualSummary`), `components/coown/CoOwnPortfolioPerformanceChart.tsx:204,222` (`a11ySummary`).
- Wallet a11y good: `screens/WalletScreen.tsx:416,437,517,530,677`.
- BidSheet a11y good: `components/ui/BidSheet.tsx:408,431,474,559,672`.
- Withdraw a11y good: `screens/WithdrawScreen.tsx:559,631,719,763,795`.
- Camera a11y: `components/VisualSearchCamera.tsx:190` (Tap Focus), `:250` (flash switch), `:275` (shutter), `:285` (switch camera); no zoom a11y.
- CaptureToolsSheet a11y: `creator/camera/CaptureToolsSheet.tsx:209-239,398-467`.
- Canvas a11y module: `creator/core/a11y/CanvasAccessibilityLabels.ts:1-40`.
- Live regions: `screens/ChatScreen.tsx:1302,1718,1844,1883,1991`; `screens/CheckoutScreen.tsx:1560,1631,1944,2049`; `screens/AuctionDetailScreen.tsx:936,966,1019,1263`.
- Hit-target micro-controls: `creator/CreatorAssetPicker.tsx:4809` (22pt), `:4865` (20pt), `:4857` (24pt), `:4742` (32pt), `:4750` (36pt), `:4763` (32pt).
- No a11y lint: `frontend/.eslintrc.js` (plugins: `@typescript-eslint`, `react-hooks` only), `frontend/eslint.config.mjs` (same); `package.json` has no `eslint-plugin-react-native-a11y`.
- `numberOfLines` on balances: `screens/WalletScreen.tsx:681`, `screens/CheckoutScreen.tsx:1531`.

---

## 9. 2026 industry research

### React Native accessibility (2026)

- **Every interactive element needs a label** describing what it does (not what it looks like). Decorative elements hidden via `accessibilityElementsHidden`/`importantForAccessibility="no"`. [VERIFIED — EXTERNAL]
- **Reading order matters**: VoiceOver/TalkBack reads in DOM order. Explicit `accessibilityFocusOrder`/`tabIndex` when visual order differs from DOM order. [VERIFIED — EXTERNAL]
- **`useLargeText` hook**: detect ≥1.7x font scale and adapt layout (switch from side-by-side to stacked, hide secondary text, increase tap targets). ThryftVerse's dead `textSizeScale` should be wired to this pattern. [VERIFIED — EXTERNAL]
- **`MAX_CAPPED_FONT_SCALE`**: 2.143 aligns with iOS Accessibility settings max. ThryftVerse caps at 1.3 for prices — too aggressive. 1.5-2.0 is the recommended range for financial figures. [VERIFIED — EXTERNAL]
- **`AccessibilityInfo`**: `announceForAccessibility()`, `setAccessibilityFocus()`, `isScreenReaderEnabled()`, `isReduceMotionEnabled()`. ThryftVerse uses `accessibilityLiveRegion` but not `announceForAccessibility` for dynamic content changes. [VERIFIED — CODE]

### WCAG 2.2 (2023, current standard through 2026)

- **2.4.11 Focus Not Obscured (Minimum)**: focused element must not be fully hidden by other content. Verify on screens with sticky headers + scrollable content. [VERIFIED — EXTERNAL]
- **2.5.7 Dragging Movements**: if an action can be performed by dragging, it must also be performable by a single tap/press. Creator canvas drag operations need tap alternatives. [VERIFIED — EXTERNAL]
- **3.2.6 Consistent Help**: help mechanism (contact, FAQ, chatbot) in same relative order across pages. ThryftVerse's HelpSupport is an unregistered route (item 26). [VERIFIED — EXTERNAL]

### Chart accessibility (2026)

- **SVG charts**: add `<title>` to SVG elements; `role="img"` + `aria-label` on container. [VERIFIED — EXTERNAL]
- **React Native View-based charts** (ThryftVerse's approach): add `accessibilityLabel={textualSummary}` + `accessibilityRole="summary"` on chart container. Co-own charts are the model (`CoOwnCandleChart.tsx:126`). [VERIFIED — CODE]
- **Data table alternative**: provide a hidden `<Text>` with the full data series as a table for screen reader users who want detail. [VERIFIED — EXTERNAL]

### Contrast (2026)

- **WCAG AA 4.5:1** for normal text (<18pt / <14pt bold). **WCAG AAA 7:1** for enhanced. [VERIFIED — EXTERNAL]
- **ThryftVerse's `textMuted` fails AA** at ≈4.0-4.3:1 on surface/surfaceAlt. The fix is to raise `textMuted` to `#9A9A9A` (dark) / `#5A5A5A` (light) as default, not opt-in high-contrast. [VERIFIED — CODE]
- **Large text (≥18pt / ≥14pt bold) requires only 3:1**. `textMuted` passes for large text but is used for 11pt meta — fails. [VERIFIED — EXTERNAL]

### Dynamic Type / font scale (2026)

- **iOS**: Settings → Accessibility → Display & Text Size → Larger Text. Max = 310% (Accessibility L). `maxFontSizeMultiplier` caps the scaling. [VERIFIED — EXTERNAL]
- **Android**: Settings → Accessibility → Font size. Max = 200%. `fontScale` system property. [VERIFIED — EXTERNAL]
- **React Native**: `PixelRatio.getFontScale()` returns current scale. `maxFontSizeMultiplier` on `Text` caps scaling per-component. [VERIFIED — EXTERNAL]
- **Best practice**: cap at 1.5-2.0 for financial figures (must scale but remain readable), 2.0+ for body text (full scaling). ThryftVerse's 1.3 cap on prices is too aggressive. [VERIFIED — EXTERNAL]
