# Portfolio parity pass after the intervening upgrade

Workspace: C:/Users/User/Desktop/thryftverse-upgrade
Starting and final branch: feat/product-detail-contract-media-device-closure
Starting and final HEAD: f0c992ee8c969779bd8623ce1ad742b8bcae3868
Charter: AGENTS.md. Single agent. No commit/push. Existing user changes preserved.

## Reassessment

The latest commit already decomposed the portfolio screen into domain components. This pass works with that implementation, not the earlier monolithic screen.

Source-observed gaps: unknown total supply displayed as a zero denominator; per-unit entry mislabelled cost basis; genuine zero daily change hidden; missing percentage defaulted to zero; duplicate Positions heading; overlapping link hit areas; excessive gaps between summary and first holding; repeated filled Buy controls; sheet lacked explicit Close/reduced-motion parity; manually refreshed data could outlive focus or viewer changes.

## Changes

- PortfolioPositionRow supplies stable asset identity, resetting recycled disclosures even for identical titles/images.
- CoOwnPositionCard omits unknown ownership percentages, denominators and ownership bars. Average entry is labelled per unit. Trade controls retain handlers with restrained treatment, press feedback and disabled accessibility state.
- PortfolioSummaryCard displays measured zero change, omits missing percentages, uses directional semantic colors, and allows change metadata to wrap.
- PortfolioTabBar, PortfolioHeader, PortfolioPositionsHeader and portfolioScreenStyles provide actual 44–48pt targets, non-overlapping links and less space before useful holdings. Duplicate section heading removed; Distributions and Market overview retained.
- CoOwnPositionActionSheet adds explicit Close, accessibility escape/modal scope, reduced-motion handling, 48pt action targets and less secondary containment. Unknown ownership is omitted in the sheet too.
- usePortfolioData rejects stale completions, invalidates manual refresh on focus cleanup, clears account-specific state and guards the returned result by viewer identity.

## Reference evidence

Accessed 13 September 2026. Primary documentation, not direct competitor screenshot comparison.

- [Robinhood — viewing stock details](https://robinhood.com/us/en/support/articles/viewing-stock-detail-pages/): position/return information and ownership diversity have distinct meanings. Applied to truthful position labels and inspectable detail.
- [Robinhood — using charts](https://robinhood.com/us/en/support/articles/using-charts/): account value and return interpretation require explicit context. Applied to daily-change completeness; no fabricated historical chart added.
- [Whatnot — manage product listings](https://help.whatnot.com/hc/en-us/articles/48441579309837-Manage-your-product-listings): researched seller context, but no additional auction work claimed in this focused portfolio pass.

Transferable design inference: an identifiable holding and its value should dominate the list; secondary operations and breakdowns should not compete with it. Changes preserve the native app's neutral design language.

## Validation

- Frontend TypeScript passed after product changes.
- 41 tests passed across portfolioPresentation, portfolioDataLifecycle and coownAssetDetailRuntime. Five new behavior tests cover zero/missing return values, unknown supply, recycled disclosure identity and stale previous-account responses.
- Scoped whitespace check passed.
- Native development build bundled (5897 modules) and opened to authentication on emulator-5554. No API listens at the configured local host port 4000; dev-login screen reports unavailable backend/seed data. Populated portfolio rendering, before/after geometry, large text, TalkBack, sheet transitions and live holdings remain unverified.
- No control capability removed; only repeated labels and unsupported ratios were omitted. No backend/schema edits, destructive operations, commit or push.

Status: IMPLEMENTED — NATIVE DEVICE AND LIVE ENDPOINT VALIDATION PENDING. This is not proof of overall reference parity or completion of every requested department.

Next acceptance: restore the existing local API/seed environment, load actual holdings, compare both themes at normal/large text, verify first useful content and row density, then iterate from captured native evidence. Separate source-level gaps still exist in the portfolio projection's optional financial fields; this pass does not certify that endpoint as production complete.
