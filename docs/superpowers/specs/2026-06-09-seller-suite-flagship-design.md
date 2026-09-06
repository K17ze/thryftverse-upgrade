# Seller Suite Flagship Design Spec

**Date:** 2026-06-09
**Status:** AWAITING USER APPROVAL
**Campaign:** flagship-seller-suite-2026-06
**Branch:** feat/product-detail-contract-media-device-closure

---

## 1. Problem Statement

Three independent read-only audits of Analytics, Seller Hub, and Edit Profile identified **11 P0 issues** (fabricated data, broken upload semantics, fake trust badges) and **12 P1 issues** (dashboard silhouettes, token violations, touch-target failures, AI-sounding copy). The current surfaces read as assembled dashboards, not authored product surfaces. The user's complaint — "still so many surfaces are bot looking shit" — is confirmed by evidence.

This spec defines the target design for each surface, the data contracts, the state models, and the implementation boundaries. **No implementation begins until this spec is approved.**

---

## 2. Design Principles (from AGENTS.md + Design.md)

1. **Composition over decoration** — one dominant object per viewport, flat rows for secondary info, no card-on-card.
2. **Honesty** — no fabricated metrics, no fake trust badges, no synthetic chart data, no decorative luxury chrome.
3. **Token discipline** — one radius grammar, one stroke grammar, one icon family, one typography system per viewport.
4. **Full state coverage** — loading, empty, error, partial, offline, populated for every surface.
5. **Touch targets ≥ 44pt** — visible glyph may be 20-24pt, hit area must be 44pt.
6. **Dark/light parity** — geometry and density identical across themes.
7. **Reduced motion** — all animations guarded by `useReducedMotion`.

---

## 3. Surface Designs

### 3.1 Seller Hub — Task-First, Not Dashboard

**Current problem:** Stack of 5 metric sections (executive hero, action dock, fulfillment radar, inventory matrix, operations rail). Reads as an operational dashboard. Fabricated status labels. Equal-weight KPI grid.

**Target silhouette:**

```
┌─────────────────────────────┐
│  Store name + verified mark  │  ← identity row (media-anchored avatar)
│  Net sales (30d)    £X,XXX   │  ← ONE dominant metric, flat, no card
│  Available payout   £X,XXX   │  ← secondary metric as flat row
├─────────────────────────────┤
│  ▸ 1 item to ship            │  ← urgent task hero (if tasks exist)
│    Listing title · £XX       │
│    [Mark shipped]            │
├─────────────────────────────┤
│  ▸ 2 pending inquiries       │  ← secondary task row (flat)
│  ▸ Import in progress (42%)  │  ← secondary task row (flat)
├─────────────────────────────┤
│  List new piece              │  ← primary action (full-width, 52pt)
│  View all listings  (XX)     │  ← flat navigation row
│  Store analytics             │  ← flat navigation row
│  Wallet & payouts            │  ← flat navigation row
└─────────────────────────────┘
```

**Key decisions:**
- **One dominant metric:** Net sales (30d) as a flat number-row, not a card. Available payout as a secondary flat row below it.
- **Task-queue pattern:** If there are urgent tasks (items to ship, pending inquiries, import in progress), they appear as a hero task + flat secondary rows. If no tasks, this section is hidden — no "all caught up" decorative card.
- **No equal-weight KPI grid.** Inventory count, active listings, etc. are flat navigation rows with the count inline.
- **No fabricated status.** If `sellerTrust` is loading, show nothing (no banner flash). If `sellerTrust.rating` is missing, show no rating — not "Top Rated Merchant" or "5.0 ★".
- **No decorative pills/badges** except for verified mark (which is real data) and order count badge on a navigation row.
- **Copy:** Terse. "List new piece" not "Publish your first archive piece to unlock merchant operations." "Items to ship" not "Fulfillment radar."

**Data contract:**
- `businessPulse.netSalesGbp` — if null/undefined, show "—" not "£0.00".
- `businessPulse.availableGbp` — same.
- `sellerTrust.verified` — only show verified mark if `true`. If loading, show nothing.
- `sellerTrust.rating` — only show if present. No fallback.
- `tasks[]` — from `sellerHubApi.fetchSellerHubOverview`. If empty, task section hidden.
- `importBatches` — errors surfaced as partial-state banner, not swallowed.

**formatMoney fix:** Replace custom k-compact with `Intl.NumberFormat('en-GB', { notation: 'compact', style: 'currency', currency: 'GBP' })`. Values ≥ 1M render as £1M, not £1000k.

---

### 3.2 Seller Analytics — Honest Metrics, Flat Hierarchy

**Current problem:** 2×2 executive card grid, synthetic daily data fabrication, rainbow funnel, hardcoded "0 offers", fake status/title fallbacks, radius budget blowout, touch targets <44pt.

**Target silhouette:**

```
┌─────────────────────────────┐
│  [7d] [30d] [90d]            │  ← period tabs (44pt hit target)
├─────────────────────────────┤
│  Net sales (30d)   £X,XXX    │  ← ONE dominant metric, flat
│  vs prev  +12.4%             │  ← delta as inline text, no pill
├─────────────────────────────┤
│  Views              5,820    │  ← flat metric row
│  Engagement rate    3.2%     │  ← flat metric row
│  Conversion rate    1.8%     │  ← flat metric row
│  Orders                12    │  ← flat metric row
├─────────────────────────────┤
│  ▆▆▅▃▂▁▆▅▃▂▁▆▅▃▂            │  ← chart (bar or line, Inter font)
│  Apr                    Jun  │  ← reduced-motion guarded
├─────────────────────────────┤
│  Top listings                │  ← section heading (one, not repeated)
│  ┌────┐ Listing title        │
│  │img │ £XX · 23 views       │  ← media-anchored row
│  └────┘                       │
│  ┌────┐ Listing title        │
│  │img │ £XX · 15 views       │
│  └────┘                       │
├─────────────────────────────┤
│  Needs attention             │
│  Listing with no views       │  ← flat row, actionable
│  Stale listing (30d)         │  ← flat row, actionable
└─────────────────────────────┘
```

**Key decisions:**
- **Remove 2×2 executive grid.** One dominant metric (net sales) + flat metric rows for secondary. Uses `FlagshipMetricLine` pattern already in CreatorAnalyticsDashboard.
- **Remove synthetic daily data.** If `dailyBreakdown` is empty, chart shows "No daily breakdown available" — not interpolated lines.
- **Remove rainbow funnel.** Replace with flat metric rows (Views → Engagement → Conversion → Orders). No decorative funnel bars.
- **Remove hardcoded "0 offers".** Use real `offerCount` or omit the field entirely.
- **Remove fake fallbacks.** Status: show actual status or "Unknown". Title: show actual title or "Untitled". Category: show actual category or "Uncategorized".
- **Remove hardcoded GBP.** Use `currencyCode` from user/store.
- **Chart fixes:** Inter font, reduced-motion guard, `accessibilitySummary` for seller charts.
- **Touch targets:** All period tabs, toggles, action links ≥ 44pt.
- **Radius budget:** Two non-avatar radii max per viewport (chart container + listing thumb).
- **Copy:** "Views" not "Discovery Impressions · Search & feed placements". "Orders" not "Qualified Detail Views · Product inspections".

**Data contract:**
- `dailyBreakdown` — if empty/missing, chart shows empty state, not synthetic data.
- `offerCount` — real field or omit.
- `listing.status` — real value or "Unknown".
- `listing.title` — real value or "Untitled".
- `listing.category` — real value or "Uncategorized".
- `currencyCode` — from user settings, not hardcoded.

---

### 3.3 Edit Profile — Honest Form, Correct Upload Semantics

**Current problem:** ARCHIVAL_SPECIALTIES fabricated and not persisted, upload commits before Save, revert doesn't cancel in-flight, SharePassportModal has fake QR + fabricated trust data, decorative passport chrome, touch targets <44pt, dead route param.

**Target silhouette:**

```
┌─────────────────────────────┐
│  [cover photo]               │  ← media area (focal-point crop)
│  ┌──┐                        │
│  │av│  Display Name          │  ← avatar + name
│  └──┘  @username             │
│         [Change photo]       │  ← transparent text link, 44pt hit
├─────────────────────────────┤
│  Name                        │  ← flat field
│  [____________________]      │
│  Username                    │
│  [____________________]      │
│  Bio                         │
│  [____________________]      │  ← multiline, char count
│  Location                    │
│  [____________________]      │
│  Website                     │
│  [____________________]      │
│  Pronouns                    │
│  [____________________]      │
├─────────────────────────────┤
│  [      Save changes      ]  │  ← primary button, 52pt
└─────────────────────────────┘
```

**Key decisions:**

**Remove ARCHIVAL_SPECIALTIES entirely.** It is fabricated, not persisted, and not backed by the backend. If a specialties taxonomy is desired in the future, it requires a backend field first. Remove the chips, the local state, and the bio-scanning initialization.

**Fix upload semantics:**
- Upload should NOT commit to the server immediately. Instead:
  1. User picks photo → local preview shown.
  2. On Save → upload to storage → patch profile with `avatarAssetId`/`coverAssetId`.
  3. If upload fails → show error, keep local preview, allow retry.
- This means `useProfileMediaUpload` needs refactoring: `performUpload` should NOT call `updateMyProfile`. It should upload to storage and return the asset ID/URL. The screen's `handleSave` calls `updateMyProfile` with all changes including media.
- `revertMedia` must cancel any in-flight upload via `AbortController` or `opIdRef` increment.
- Use `avatarAssetId`/`coverAssetId` instead of legacy `avatar`/`coverPhoto` URL strings.
- Use the persisted `localUri` for upload, not the temp picker URI.

**Remove SharePassportModal decorative chrome:**
- Remove: VAULT PASS badge, SS'26 season tag, VERIFIED VAULT ID, AUTHENTIC 100%, default 5.0★, ornamental QR brackets, hardcoded gradient.
- Replace fake QR with either a real QR code (requires `react-native-qrcode-svg` dependency) or remove the QR entirely and use a simple share sheet with the profile URL.
- If trust data (rating, verified, completed sales) is missing, omit those fields — don't fabricate.
- Replace hardcoded typography sizes with `TypographyV2` roles.
- Replace hardcoded colors with theme tokens.

**Fix touch targets:**
- Save button: 52pt (`Layout.primaryButtonHeight`), not 36pt.
- Tag chips: removed (ARCHIVAL_SPECIALTIES gone).
- Recovery button: 44pt min or `hitSlop`.
- Edit photo link: transparent 44pt hit target, not a circular chrome button.

**Fix dead route param:**
- Read `route.params.focus` and auto-open the avatar or cover picker when present.

**Remove dead code:**
- Unused `CachedImage` import.
- Unused `avatarCopy`, `photoTitle`, `photoHint` styles.

**Dark mode fixes:**
- Replace `#fff` on edit buttons with `colors.textInverse`.
- Replace hardcoded gradient with `Scrim.bottom` token.
- Replace hardcoded `rgba(...)` borders with `colors.border`/`colors.borderSubtle`.

**Copy:**
- Remove "Declare your curation focus across fashion, horology, and collectibles."
- Remove "Visible to people who can view your profile."
- Remove "Not shown on your public profile."
- Remove "Label your profile and modeled wardrobe when generated with AI models."
- Use terse labels: "Name", "Username", "Bio", "Location", "Website", "Pronouns".

---

### 3.4 Shared UI / Charts — Inter Font, Reduced Motion, Token Compliance

**Chart fixes (BarChart, LineChart, ChartTooltip):**
- Replace `useFont(null, 11)` with Inter font loaded via `useFont(interFont, 11)`.
- Add `useReducedMotion` guard: if true, set `animate: false` or duration 0.
- Replace hardcoded `roundedCorners` with `Radius.sm` token.
- Replace hardcoded `strokeWidth: 2` with `Stroke.emphasis`.
- Replace ChartTooltip inline shadows with `Elevation` tokens.

---

## 4. Non-Goals

To prevent uncontrolled refactoring:

- **No backend schema changes** unless a field is explicitly required (e.g., `specialties` — we are removing the UI, not adding the backend field).
- **No new navigation routes.** All routes exist and are registered.
- **No new dependencies** except `react-native-qrcode-svg` IF we keep the QR in SharePassportModal (otherwise remove QR).
- **No refactor of CreatorAnalyticsDashboard** — it scored higher and is not in scope.
- **No refactor of screens not listed in §3** (ChatScreen, GroupChatScreen, etc. are out of scope).
- **No decorative luxury accents** (champagne/gold/gradients) — Design.md keeps neutral palette canonical.
- **No "collector passport" / "vault pass" / "archival identity" terminology** unless the user explicitly establishes these as product concepts.

---

## 5. Implementation Workstreams

After approval, work will be dispatched in isolated workstreams. Files are partitioned so no two workstreams edit the same file.

### Workstream A — Analytics (SellerAnalyticsScreen + charts)
- `frontend/src/screens/SellerAnalyticsScreen.tsx`
- `frontend/src/components/charts/BarChart.tsx`
- `frontend/src/components/charts/LineChart.tsx`
- `frontend/src/components/charts/ChartTooltip.tsx`

### Workstream B — Seller Hub
- `frontend/src/screens/SellerHubScreen.tsx`
- `frontend/src/components/seller/SellerExecutiveHero.tsx`
- `frontend/src/components/seller/SellerFulfillmentRadar.tsx`
- `frontend/src/components/seller/SellerInventoryMatrix.tsx`
- `frontend/src/components/seller/SellerOperationsRail.tsx`

### Workstream C — Edit Profile + Upload
- `frontend/src/screens/EditProfileScreen.tsx`
- `frontend/src/components/profile/EditProfilePreview.tsx`
- `frontend/src/hooks/useProfileMediaUpload.ts`
- `frontend/src/components/profile/SharePassportModal.tsx`
- `frontend/src/components/profile/MyProfileIdentityHero.tsx` (only if touched by edit flow)

### Workstream D — Shared token/icon cleanup
- `frontend/src/components/common/AppIcon.tsx` (if new semantic mappings needed)
- `frontend/src/theme/iconTokens.ts` (if new sizes needed)
- Cross-cutting token replacements that don't conflict with A/B/C

**Execution order:** A, B, C can run in parallel (no shared files). D runs after A/B/C to avoid merge conflicts on shared token files.

---

## 6. Verification Gates

Before claiming completion:

1. **Typecheck:** `npx tsc --noEmit` passes with zero errors.
2. **Lint:** `npx eslint src/ --max-warnings 0` passes.
3. **Tests:** Existing tests pass; new tests for upload semantics and data honesty.
4. **Build:** Metro bundle compiles; Android APK builds.
5. **Runtime:** App launches on emulator-5554, seeded login works.
6. **Visual:** Navigate each upgraded screen in light + dark mode. Capture screenshots.
7. **State coverage:** Verify loading, empty, error, partial, offline states for each surface.
8. **Touch targets:** Verify all interactive controls ≥ 44pt.
9. **Adversarial re-audit:** Fresh read-only audit of all upgraded surfaces.
10. **Two consecutive clean re-audit waves** before declaring convergence.

---

## 7. Open Questions for User

1. **SharePassportModal:** Should we keep a QR code (requires adding `react-native-qrcode-svg` dependency) or remove it entirely and use a simple share sheet with the profile URL?

2. **"Collector Pass" / "Vault Pass" terminology:** The current SharePassportModal and MyProfileIdentityHero use "Collector Pass", "Vault Pass", "Archival Identity". Should these terms remain as established product language, or should they be replaced with plain language ("Share profile", "Profile")?

3. **Specialties/taxonomy:** Removing ARCHIVAL_SPECIALTIES entirely since it's not backed by backend. If you want a specialties feature, it requires a backend field first. Confirm removal is acceptable.

4. **Upload-before-Save semantics:** The current flow commits photos to the server immediately on pick. The fix changes this to upload-on-Save. This means if the user picks a photo and force-quits, the photo is not on the server. Confirm this is the desired behavior.

5. **Seller Hub "all caught up" state:** When there are no urgent tasks, should the task section be hidden entirely, or show a minimal "No items to ship" flat row?

---

## 8. Approval

**This spec is presented for your review. No implementation will begin until you approve it.**

Please review the surface designs, non-goals, and open questions. You can approve as-is, request changes, or answer the open questions to refine the design.
