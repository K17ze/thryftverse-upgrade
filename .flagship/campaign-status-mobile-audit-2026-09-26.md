# Campaign Status — Mobile Department Audit + Upgrade (2026-09-26)

**Campaign:** `mobile-dept-audit-upgrade-2026-09-26`
**Branch:** `feat/product-detail-contract-media-device-closure`
**Trigger:** User directive — audit native mobile department-by-department, cross-reference
the webapp implementation, research against eBay / Vinted / Pinterest / Instagram / Depop,
find quality caveats in depth, keep upgrading to flagship production level.

## Context

The web replication (`web/`) completed 12 waves of competitor-grade upgrades
(see `campaign-status-web-frontend.md`). The native mobile app (~178 screens,
Expo/RN) predates several of those upgrades. This campaign audits every mobile
department against (a) the web implementation, (b) current competitor grammar,
(c) the anti-AI design policy, then upgrades.

## Live research (2026-09-26)

- eBay VI-signals (arxiv 2510.01198): Urgency placement over picture panel,
  Conversational below engagement buttons; item-specifics placement tests
  (valueaddedresource.net, Oct/Nov 2025); search redesign — larger images,
  Shopping View, consolidated delivery options, interactive price filters
  (innovation.ebayinc.com).
- Vinted weaknesses to exceed: seller page lacks size/colour/condition filters;
  bundle view has no filters; PDP over-saturated without progressive disclosure;
  truncated price display (multiple UX case studies, Medium 2024-2025).
- Pinterest: smart feed — best-first not newest-first, sources mixed at
  different rates (pinterest-engineering Medium); masonry grammar.
- Depop: bigger images in search results, photography spotlight
  (depop-design Medium); Instagram grid grammar.

## Execution model

12 parallel read-only audit agents (one per department), each cross-referencing
mobile screens vs web routes vs competitor grammar, writing findings to
`.flagship/audit-mobile-2026-09-26/<dept>.md`. Orchestrator synthesizes the gap
registry, then dispatches parallel implementers with disjoint file ownership,
verifies (tsc/eslint/vitest + design-token/icon gates), and runs a fresh
adversarial review.

| Agent | Department | Output | Status |
|-------|-----------|--------|--------|
| d79f1165 | Home/Feed/Pulse | home-feed.md | ✅ 0 P0 / 4 P1 / 4 P2 |
| af1d5556 | Explore/Search/Browse | explore-search.md | ✅ 2 P0 / 4 P1 / 4 P2 |
| 50b0e2be | Commerce PDP/Bag/Checkout | commerce-pdp.md | ✅ 1 P0 / 5 P1 / 3 P2 |
| 5e6a6af5 | Sell/SellerHub | sell-sellerhub.md | ✅ 1 P0 / 3 P1 / 4 P2 |
| 65cba9c3 | Identity/Profile/Social | identity-profile.md | ✅ 1 P0 / 5 P1 / 3 P2 |
| 0947fabd | Messaging | messaging.md | ✅ 2 P0 / 2 P1 / 2 P2 |
| 180e7810 | Auctions/Live/Posters | auctions-live.md | ✅ 0 P0 / 3 P1 / 4 P2 |
| 11525b70 | Co-Own/Trading | coown-trading.md | ✅ 0 P0 / 3 P1 / 4 P2 |
| 5049b5d7 | Wallet/Payments/KYC | wallet-payments.md | ✅ 0 P0 / 4 P1 / 4 P2 |
| 92cf8e1a | Settings/Utility/Support | settings-utility.md | ✅ 0 P0 / 4 P1 / 3 P2 |
| 7d7a17e6 | AI/Agents/Bots | ai-agents.md | ✅ 1 P0 / 3 P1 / 3 P2 |
| 5314c89f | Auth/Onboarding | auth-onboarding.md | ✅ 0 P0 / 4 P1 / 4 P2 |

**Audit totals: 8 P0 · 44 P1 · 42 P2 · 28 P3 (~122 findings).**
Gap registry: `gap-registry-mobile-2026-09-26.json`.

## Implementation wave (12 parallel workstreams, disjoint file ownership)

Shared foundation built by orchestrator: `frontend/src/hooks/useRecentlyViewed.ts`
(unified recently-viewed store, same key/shape as creator pickers).

| Workstream | Agent | Findings | Status |
|-----------|-------|----------|--------|
| WS-Explore | 42aaa759 | ESB-01..10 | running |
| WS-Commerce | e1b82590 | C-01..C-08, C-10 | running |
| WS-Sell | 87e6fc29 | SELL-01..05, 09, 10 | running |
| WS-Identity | 66fb4a25 | IDP-01..07, 10 | running |
| WS-Messaging | 244abd37 | MSG-01..06 | running |
| WS-Home | d3e691f2 | HF-01..06, 08 | running |
| WS-Auctions | b2b2163e | AL-01..08 | running |
| WS-CoOwn | 92434817 | CT-01..08 | running |
| WS-Wallet | db797467 | W-01..08 | running |
| WS-Settings | 40c99c37 | S1..S5, S7, S8 | running |
| WS-AI | 8b2b9491 | AIA-01..07 | running |
| WS-Auth | 22f5536c | AO-01..08 | running |

## Verification commands

- `npm --prefix frontend run typecheck` (tsc --noEmit)
- `npm --prefix frontend run lint` (eslint src/)
- `npm --prefix frontend test` (vitest run --dir src)
- `npm --prefix frontend run lint:design-tokens`
- `npm --prefix frontend run check:icons`
