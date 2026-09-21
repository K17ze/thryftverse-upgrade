# PKG-09 — Commerce surfaces: live cached refresh, checkout tenders, portfolio status, profile stat, reorder grid, condition media, Q&A gate

Repo root: C:/Users/User/Desktop/thryftverse-upgrade (HEAD 76c0733). Audit: ThryftVerse-Post-Upgrade-Audit-2026-09-20.md Appendix B (FRESH-01,04,05,06,07,09; S20-06).

## Findings to close

### FRESH-01 (High) — live home blank body on refresh failure
`screens/LiveShoppingHomeScreen.tsx:350-352`: error requires no summary; content requires no error — existing summary + failed refresh matches neither → blank. Fix: keep last-good summary visible with an inline retry/freshness indicator; error replaces content ONLY when nothing was ever loaded.

### FRESH-04 (High) — branded tender buttons ignore device support
`screens/CheckoutScreen.tsx:644` computes actual device support, but :967-968 derive showApplePay/showGooglePay from platform + merchant capability + submission state only; footer uses those booleans with the same generic onPay as card. Fix: each branded button renders only when device-supported AND must invoke the tender-specific action (Apple/Google Pay sheet vs card flow) — find the existing payment intent API and map exactly. Unsupported devices see no misleading button; a named tender must never silently run the card path.

### FRESH-05 (Med) — paused portfolio status unreadable in sheet
`screens/PortfolioScreen.tsx:212` maps isOpen → Active/Closed; the correct row formatter exists but the sheet can't show Paused. Fix: use the authoritative status/formatter in the sheet too — one source of truth for status across row, sheet, detail.

### FRESH-06 (Med) — "For sale" stat is a no-op
`screens/MyProfileScreen.tsx:269` vibrates without selecting/scrolling the listings tab. Fix: make it navigate/select the listing tab and scroll to it (find the tab state the screen already owns). If the stat cannot be wired to a real destination, render it as a static fact — a haptic-only control is a defect either way.

### FRESH-07 (Med) — unbounded reorder grid mounts entire catalog
`components/myprofile/ClosetGrid.tsx:56,132` mounts all items in reorder mode inside non-scrolling FlashList/outer ScrollView. Fix: reorder mode must virtualize (or move reorder to a dedicated virtualized surface); 1000-item reorder must not mount 1000 media views. Keep the preview cap behavior for the normal grid; the reorder path is the defect.

### FRESH-09 (Med) — last photo mislabeled as condition evidence
`components/itemdetail/ItemDetailItemDetails.tsx:80-95` labels the last arbitrary photo as condition evidence whenever multiple images exist. Fix: use semantically tagged condition media if the listing model has it (search for conditionPhoto/tag in listing types); otherwise present photos generically — never fabricate a "condition" claim from position.

### S20-06 (Med) — blocked seller keeps public-Q&A submission
PDP gate hides purchase/message affordances (CommerceActionDock.tsx:175, ItemDetailSellerSection.tsx:69-70) but `screens/ItemDetailScreen.tsx:574-581` keeps the Q&A archive entry; `ItemDetailSheets.tsx:298-302` passes only listingId/currentUserName/isSeller into `components/product/ListingQA.tsx`, which renders an ask composer (:211-230) with no blocked-relationship capability. Fix: thread the blocked/capability state into ListingQA; blocked users keep READ access to existing public Q&A but the ask composer is hidden/disabled with an honest reason; check offer sheet + deep-link entry paths for the same gap while you're in there.

## File ownership
- EXCLUSIVE: `frontend/src/screens/LiveShoppingHomeScreen.tsx`, `frontend/src/screens/CheckoutScreen.tsx`, `frontend/src/screens/PortfolioScreen.tsx`, `frontend/src/screens/MyProfileScreen.tsx`, `frontend/src/components/myprofile/ClosetGrid.tsx`, `frontend/src/components/itemdetail/ItemDetailItemDetails.tsx`, `frontend/src/screens/ItemDetailScreen.tsx`, `frontend/src/components/itemdetail/ItemDetailSheets.tsx`, `frontend/src/components/product/ListingQA.tsx`, NEW test files.
- Read-only: CommerceActionDock.tsx, ItemDetailSellerSection.tsx (already-correct references).

## Constraints
- RN/Expo; match existing screen/component patterns. One shared blocked-capability source — don't recompute per component if a hook/context already exposes it (check useAuctionDetail/commerce hooks).
- AGENTS.md anti-AI policy: honest capability gating, no fabricated states.
- Tests that FAIL on old code: summary+failed-refresh still renders content; unsupported device hides Apple/Google button; tender button maps to tender-specific action; sheet shows Paused; reorder doesn't mount all items; blocked user sees no ask composer but can read Q&A.
- `npm run typecheck` clean; run only your tests. No commit.

## Report
`.flagship/reports/pkg-09-report.md`. Return: status, files changed, one-line test summary.
