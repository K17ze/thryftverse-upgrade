# 07 — States, Motion, Accessibility

**Goal:** complete state coverage, restrained native motion, and full accessibility — the gates that separate flagship from prototype. Source §14 (state completeness), §17 (motion), §18 (accessibility), §17.5 (visual/interaction gate).

---

## 1. State coverage — every screen, every state

Source §14. Every Co-Own screen must account for: loading, populated, empty, filtered-empty, offline, error, retry, disabled, submitting, success, partial data, missing media, permission denied. Plus the exchange-specific states: **stale, halted, restricted, thin, auction-pending, reconciliation-break**.

### 1.1 State matrix

| Screen | Loading | Empty | Filtered-empty | Stale | Halted | Restricted | Error/Offline | Submitting | Reconciliation |
|---|---|---|---|---|---|---|---|---|---|
| Hub | `CoOwnHubSkeleton` | "No live instruments" | "Watchlist empty" | cached + badge | "Markets closed" banner | n/a | RetryState | n/a | n/a |
| AssetDetail | `CoOwnAssetDetailSkeleton` | n/a | n/a | "Last 3d ago" | status strip + dock disabled | "Not eligible in region" | per-section retry | n/a | n/a |
| Trade | quote skeleton | n/a | n/a | n/a | ticket disabled + reason | ticket disabled + reason | RetryState | "Submitting…" | n/a |
| TradeConfirm | receipt skeleton | n/a | n/a | n/a | n/a | n/a | RetryState | hold-to-submit progress | n/a |
| Portfolio | `CoOwnPortfolioSkeleton` | "No units yet" | n/a | data-quality note | per-row dock disabled | trade disabled | cached + staleness | n/a | "Reconciling" |
| Wallet | `CoOwnWalletBreakdownSkeleton` | "Add 1ZE" | n/a | n/a | n/a | n/a | cached + staleness | deposit/redeem progress | "Balance unavailable" |
| Ledger | `CoOwnActivitySkeleton` | "No activity" | filter empty | n/a | n/a | n/a | cached + staleness | n/a | n/a |

### 1.2 Skeleton rules (source §14, §17.5)

- Skeletons **resemble the final layout** — same geometry, same row heights, same column widths.
- No generic centred spinner over empty black space.
- Deterministic skeletons (no random shimmer positions).
- Skeletons must not move-shift real content when data arrives (reserve layout width).
- Existing `CoOwnSkeletons.tsx` needs: `CoOwnValueStripSkeleton`, `CoOwnOrderBookSkeleton`, `CoOwnWalletBreakdownSkeleton`, `CoOwnCandleChartSkeleton`.

### 1.3 Empty-state rules (source §14)

- Never fabricate data to avoid designing an empty state.
- Empty states are action-oriented ("Browse assets", "Add 1ZE"), not just "No data".
- Editorial empty-state copy fits the Galleria voice — restrained, not chirpy.
- No fake assets, no fake books, no fake viewers (source §6.9, §11).

### 1.4 Stale-state rules (source §6.6, §11.11)

- Last trade age visible beside every last price.
- Portfolio data-quality note when any position's mark is stale > 24h.
- Stale appraisal badge on dossier when valuation > 180d.
- Charts annotate gaps (sparse trades as discrete marks, not interpolated lines across gaps).

### 1.5 Halted / restricted / thin / auction-pending

- **Halted:** status strip `[Halted]` + reason; trade dock disabled with reason; chart frozen at last; order book frozen with overlay.
- **Restricted:** dock disabled with "Not eligible in your region" + link to eligibility/verification.
- **Thin (no opposite side):** "Protected instant" replaced by "Request quote" / "Join auction"; no one-tap Buy that would imply liquidity.
- **Auction-pending:** "Queued for 14:00 call auction" + countdown + indicative uncrossing price.

### 1.6 Reconciliation break (source §17.3, §11.8)

- Wallet/Portfolio show "Temporarily unavailable — we're reconciling" + contact.
- **Never show a possibly-wrong balance as if correct.**
- Reconciliation breaks stop affected money movement and alert operations.

---

## 2. Motion language (source §17, AGENTS §17)

### 2.1 Encouraged

| Motion | Spec |
|---|---|
| Press scale | 0.97–0.985 on buttons/cards |
| Press opacity | slight opacity response on press |
| Segment indicator | animated with spring physics (Buy/Sell, range chips) |
| Content crossfade | on mode change (chart line↔candle, book refresh) |
| Directional slide | on side change in ticket (buy↔sell) |
| Countdown colour interpolation | only at genuine threshold changes (e.g. last 60s of auction) |
| Haptic selection | on order acceptance (medium) / rejection (heavy) / segment change (light) |
| Reduced-motion fallback | instant change or simple fade for all of the above |

### 2.2 Prohibited

- bounce
- continuous pulsing
- floating cards
- decorative shimmer after loading
- large spring movement
- dramatic parallax
- excessive blur dependency
- animating the entire page
- confetti / casino flashes / urgency theatre

### 2.3 Duration

- 160–240ms for most transitions.
- Chart first-paint line draw: 240ms cubic-bezier (restrained, not 800ms theatre).
- Hold-to-submit progress ring: 600ms with haptic heavy on completion.
- Number ticks: **no slot-machine/odometer animation** — tabular numerals update in place; a 120ms fade is enough. (Robinhood's slot-machine tick is deliberately rejected here — it reads as gamified for an asset exchange.)

### 2.4 Price-tick animation (restrained)

- On last-price change: 120ms subtle background fade using `DIRECTION_COLORS.upFill`/`downFill` on the price cell, then clear.
- **No flash, no glow, no digit rotation.**
- Direction always paired with `▲`/`▼`/`−` glyph + sign (accessibility).
- Reduced motion: price updates in place with no background fade.

### 2.5 Haptic discipline (source §11.11)

- Light: segment change, tab change (optional — can be disabled).
- Medium: order acceptance, deposit/redeem submitted.
- Heavy: order rejection, reconciliation break, halt.
- Haptics respect system setting; never override.

---

## 3. Accessibility (source §18, AGENTS §18)

### 3.1 Touch targets

- Primary CTAs: minimum 48×48dp.
- Secondary buttons: minimum 44×44dp.
- Icon buttons: 48×48dp touch target (24×24dp icon + padding).
- Spacing: 8dp minimum between targets.
- Order-book levels: tap target full row height (`ExchangeLayout.bookRowHeight` = 32 + padding).

### 3.2 Labels (state-aware)

- Every icon-only control has `accessibilityLabel`.
- Accessibility labels are **state-aware**: "Buy 500 units at 12.40 1ZE, maximum 1,267 1ZE reserved" not just "Buy".
- Do **not** append "left" to states where countdown text already says "Ended"/"Starts tomorrow"/"Closed" (source §18).
- Charts have a textual summary (`accessibilityLabel` / `accessibilityHint`) — "1ZE last 12.40, down 0.8% over 1 week, 3 trades in range".
- Market-status strip announces mode + countdown via `accessibilityLiveRegion` when it changes.

### 3.3 State announcement

- Loading and failure exposed to screen reader.
- Selected states exposed (`accessibilityState={{ selected: true }}`).
- Unread state exposed (activity ledger new entries).
- Destructive actions clear ("Cancel order" / "Redeem 1ZE to bank").
- Halted/restricted announced.

### 3.4 Contrast

- Text on dark: `#FFFFFF` on `#0A0A0A` (>15:1).
- Text on light: `#0A0A0A` on `#FFFFFF` (>12:1).
- Direction up `#1A6B3A` (dark forest green) on `#0A0A0A` — verify ≥4.5:1; if not, lighten within the same hue family to `#2A7D4A`.
- Direction down `#8B2020` (dark cherry red) on `#0A0A0A` — verify ≥4.5:1; if not, lighten within the same hue family to `#A02828`.
- Market-state dots (navy `#1B2845`, taupe `#6B5D4F`, cherry red `#6B1A1A`, grey `#666666`, plum `#3D2B3D`): all dark — verify each against `#0A0A0A`; if any fails 3:1 for graphical objects, lighten within the same hue family. Never colour alone — always dot + label + shape.

### 3.5 Dynamic Type / large text

- Test every screen at 200% text zoom.
- Prices must not overlap at large font sizes.
- Header actions must remain reachable.
- Titles must remain understandable (don't rely only on `numberOfLines` — verify truncation is graceful).
- Tabular numerals: ensure `tabular-nums` + `lnum` doesn't break at large sizes.

### 3.6 Reduced motion

- Respect `useReducedMotion()` (already used in `SyndicateHubScreen`).
- Reduced motion: all animations become instant or simple fade.
- Hold-to-submit becomes tap-to-confirm with a confirm dialog.
- Chart first-paint: no line draw — appear in place.
- Price ticks: no background fade — update in place.

### 3.7 Screen-reader order

- Follow visual order.
- Value strip: Market → Fundamental → Cash (matches visual top-to-bottom).
- Order ticket: side → available → quantity → type → price → estimate → depth → duration → post-trade → review.
- TradeConfirm receipt: side → type → units → prices → total → reserved → plain language → warning → disclosure → submit.

### 3.8 No colour-alone

- Direction: colour + `▲`/`▼`/`−` + sign.
- Market mode: dot + label + (where relevant) shape.
- Halted: dot + "Halted" + reason.
- Eligibility: text + icon, not just a green/red border.

---

## 4. Performance targets (source §17.6)

- Input response < 100ms for local interaction.
- Order preview p95 < 500ms under normal conditions.
- Acknowledgement p95 < 750ms excluding explicit auction timing.
- Visible market-data staleness indicator before data can become misleading.
- Stable 60fps for core scroll and sheet transitions on supported devices.
- No cumulative layout shift around price, wallet or order controls.
- Graceful degradation on slow networks with no duplicate submission (idempotent order submit).

---

## 5. Acceptance gate (states + motion + a11y)

- [ ] Every screen has the full state matrix (§1.1) implemented.
- [ ] Skeletons match final geometry; no generic centred spinners.
- [ ] Empty states action-oriented; no fabricated data.
- [ ] Stale/halted/restricted/thin/auction-pending/reconciliation states all designed.
- [ ] Motion within 160–240ms; no prohibited motion (§2.2).
- [ ] Price ticks restrained (120ms fade, no flash/rotation).
- [ ] Haptics correct level per action; respect system setting.
- [ ] Reduced-motion fallback for every animation.
- [ ] Touch targets meet minimums.
- [ ] All icon-only controls have state-aware labels.
- [ ] Contrast verified for direction colours; adjust if needed.
- [ ] Screens tested at 200% text zoom — no overlap, no unreachable actions.
- [ ] No colour-alone anywhere.
- [ ] Performance budgets measured on device, not claimed.
