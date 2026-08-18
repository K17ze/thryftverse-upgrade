# 42 — Cart & Multi-Item Checkout: Flagship Research Report

> **Department:** Shopping cart, multi-item checkout, bundle checkout, cart abandonment, bundle discounts
> **Benchmark date:** 2026-08
> **Primary benchmarks:** eBay · Shopify · Amazon · Instagram Shopping
> **Sources:** production codebase audit · 2026 web research · AGENTS.md §4

---

## 1. 2026 Competitor Benchmark

### eBay (2026)
eBay's cart and checkout:
- **Cart** — add items from multiple sellers to a single cart
- **Grouped by seller** — cart items grouped by seller with per-seller shipping
- **Bundle discounts** — seller-defined discounts for multi-item purchases
- **Checkout** — single checkout flow for all cart items, with per-seller shipping breakdown
- **Abandoned cart recovery** — email + push reminders for items left in cart
- **Save for later** — move cart items to "saved for later" (not a purchase, but not removed)

### Shopify (2026)
Shopify's checkout is the gold standard for e-commerce:
- **Express checkout** — Apple Pay / Google Pay / Shop Pay one-tap checkout
- **Shipping + payment + review** — 3-step flow, each on one screen
- **Order summary** — sticky sidebar with itemized total
- **Trust signals** — security badges, return policy, shipping estimate
- **Error handling** — inline validation, no full-screen errors

### Amazon (2026)
Amazon's cart is the benchmark for cart UX:
- **Cart count badge** — on the cart icon in navigation
- **Quantity editing** — inline stepper in cart
- **"You might also need"** — complementary product recommendations in cart
- **1-Click checkout** — default payment + shipping, one tap to buy
- **Abandoned cart** — email reminders with "Your cart is waiting"

### Instagram Shopping (2026)
Instagram's in-app checkout:
- **Product tags** — tap product tag on post/story → product sheet
- **Add to bag** — from product sheet, adds to a universal bag
- **Bag icon** — in profile/settings, shows count
- **Checkout** — in-app, pre-filled payment + shipping

### Cross-cutting 2026 consensus
- **Cart with count badge** — visible in navigation
- **Multi-seller cart** — items grouped by seller
- **Bundle discounts** — seller-defined multi-item discounts
- **Express checkout** — Apple Pay / Google Pay one-tap
- **Abandoned cart recovery** — email + push reminders
- **Save for later** — move items out of cart without deleting
- **Inline quantity editing** — steppers in cart
- **Order summary** — itemized, sticky
- **Trust signals** — security, returns, shipping

---

## 2. Psychology & Principles

### The cart as commitment device
Adding an item to a cart is a medium-commitment action — stronger than saving (low commitment) but weaker than purchasing (high commitment). The cart creates a "I'm going to buy this" intention. The 2026 standard: make adding to cart frictionless (one tap), and make the cart visible (count badge in navigation).

### The bundle discount nudge
"Buy 2 for 10% off, 3 for 15% off" is a powerful upsell. The user was going to buy one item, but the bundle discount makes buying more feel like saving money. For a marketplace, bundle discounts increase average order value and clear seller inventory faster.

### Abandoned cart as recovery
70% of carts are abandoned. The 2026 standard: send a push notification 1 hour after abandonment ("Your cart is waiting") and an email 24 hours after. This recovers 10-15% of abandoned carts. The notification should include the item image and a direct deep link to the cart.

### The single checkout advantage
A single checkout for all cart items (across sellers) is the highest-converting pattern. The user enters payment + shipping once and buys everything. Per-seller shipping is shown as a breakdown. This is the Shopify/Amazon standard. The alternative (per-seller checkout) adds friction and reduces conversion.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Cart/checkout files

| File | Lines | Role | Quality |
|------|-------|------|---------|
| `screens/CheckoutScreen.tsx` | 550+ | Single-item checkout | ✅ Exists |
| `screens/BundleBagScreen.tsx` | — | Bundle bag (multi-item from one seller) | ✅ Exists |
| `components/product/BundleUpsellRow.tsx` | 121+ | Bundle upsell row | ✅ Exists |
| `components/icons/ThryftCartIcon.tsx` | — | Cart icon | ✅ Exists |
| `components/checkout/AddCardSheet.tsx` | 122+ | Add card sheet | ✅ Exists |
| `services/marketApi.ts` | — | Market API (has cart endpoint) | ✅ Exists |
| `services/galleriaApi.ts` | — | Galleria API (has cart endpoint) | ✅ Exists |

### What exists
1. **CheckoutScreen** — 550+ line single-item checkout screen. Handles payment, shipping, order summary.
2. **BundleBagScreen** — multi-item bundle from a single seller. Has bundle tier discounts: 2 items = 10% off, 3 items = 15% off, 5+ items = 20% off. This is a **genuinely well-built** bundle system.
3. **BundleUpsellRow** — 121-line upsell row showing bundle discount tiers.
4. **ThryftCartIcon** — cart icon component.
5. **AddCardSheet** — 122-line add card sheet for checkout.
6. **marketApi** — has cart-related endpoints.
7. **galleriaApi** — has cart-related endpoints.

### What's missing

| # | Defect | Severity |
|---|--------|----------|
| 1 | **No universal cart** — only BundleBag (single seller), no multi-seller cart | High |
| 2 | **No cart count badge in navigation** — cart icon exists but no count | High |
| 3 | **No "Add to cart" on PDP** — only "Buy now" and "Add to bundle" | High |
| 4 | **No cart screen** — no dedicated cart screen showing all items | High |
| 5 | **No abandoned cart recovery** — no push or email reminders | High |
| 6 | **No save for later** — can't move items from cart to saved | Medium |
| 7 | **No express checkout** — no Apple Pay / Google Pay one-tap | High |
| 8 | **No inline quantity editing in cart** — no steppers in cart | Medium |
| 9 | **No "You might also need" recommendations in cart** — no complementary items | Low |
| 10 | **No per-seller grouping in cart** — no seller-grouped view | Medium |
| 11 | **BundleBag is single-seller only** — can't add items from different sellers | High |
| 12 | **No order summary sidebar** — no sticky summary during checkout | Medium |

---

## 4. Micro Improvements

### M1 — Create universal Cart
Create a cart that supports items from multiple sellers:
- **Add to cart** on PDP (alongside "Buy now")
- **Cart screen** — all items, grouped by seller, with per-seller shipping
- **Cart count badge** — on cart icon in navigation
- **Remove from cart** — swipe to remove
- **Save for later** — move to saved items (integrates with Report #38)

### M2 — Add cart count badge
Small count badge on the cart icon in navigation. Shows total item count. Updates in real-time. Uses CountBadge component (per Report #43).

### M3 — Add "Add to cart" on PDP
On ItemDetailScreen, add "Add to cart" button alongside "Buy now". "Add to cart" is secondary (outline), "Buy now" is primary (filled). Both add the item to the cart, but "Buy now" goes directly to checkout.

### M4 — Add express checkout (Apple Pay / Google Pay)
On checkout screen, add Apple Pay / Google Pay button at the top. One-tap checkout using stored payment + shipping. Falls back to manual checkout if not available.

### M5 — Add abandoned cart recovery
- **1 hour after abandonment** — push notification: "Your cart is waiting"
- **24 hours after abandonment** — email: "You left items in your cart"
- **72 hours after abandonment** — push: "Price drop on [item]" (if price dropped)
- Deep links to cart screen

### M6 — Add inline quantity editing in cart
Stepper component (per Report #43) in each cart row. Change quantity without leaving cart. Updates total in real-time.

### M7 — Add per-seller grouping in cart
Group cart items by seller. Each seller group has: seller name, seller avatar, items in the group, per-seller shipping cost, per-seller subtotal. Bundle discounts applied within seller group.

### M8 — Add "You might also need" in cart
Below cart items, show "You might also need" rail with complementary products (accessories, care products, matching items). Based on cart item categories.

---

## 5. Macro Improvements

### A1 — Cart & checkout architecture
Create a unified cart system:
- `Cart` — store with items, quantities, seller grouping
- `CartScreen` — cart UI with grouping, steppers, save for later
- `CartIcon` — navigation icon with count badge
- `CheckoutFlow` — multi-step checkout (shipping → payment → review)
- `ExpressCheckout` — Apple Pay / Google Pay one-tap
- `useCart` — hook for cart operations (add, remove, update quantity)
- `useAbandonedCart` — hook for abandoned cart recovery

### A2 — Bundle discount system
Extend the existing BundleBag tier system to the universal cart:
- **Per-seller bundles** — 2 items from same seller = 10% off, 3 = 15%, 5+ = 20%
- **Cross-seller bundles** — optional platform-wide promotions
- **Bundle progress indicator** — "Add 1 more for 15% off" nudge
- **Bundle savings display** — "You saved £X with bundle discounts"

---

## 6. Flagship Acceptance Criteria

- **Universal cart** — items from multiple sellers
- **Cart count badge** in navigation
- **"Add to cart" on PDP** — alongside "Buy now"
- **Cart screen** — grouped by seller, with steppers, save for later
- **Express checkout** — Apple Pay / Google Pay
- **Abandoned cart recovery** — push + email reminders
- **Bundle discounts** — per-seller tier discounts
- **Order summary** — sticky, itemized
- **Trust signals** — security badges, return policy, shipping estimate
- **Inline quantity editing** — steppers in cart

### Thumbnail test
At 25% scale, the cart screen must show: seller-grouped items with thumbnails, quantities, and prices. The checkout must show: a clear order summary with total, and a prominent "Pay" button.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — Universal cart | High | Multi-seller purchase |
| P0 | M2 — Cart count badge | Low | Cart visibility |
| P0 | M3 — "Add to cart" on PDP | Low | Cart entry point |
| P1 | M4 — Express checkout | Medium | One-tap purchase |
| P1 | M5 — Abandoned cart recovery | Medium | Conversion recovery |
| P1 | M7 — Per-seller grouping | Medium | Cart organization |
| P2 | M6 — Inline quantity editing | Low | Cart UX |
| P2 | M8 — "You might also need" | Medium | Upsell |
| P3 | A1 — Full cart system | High | All cart surfaces |
| P3 | A2 — Bundle discount system | High | AOV increase |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `cartIcon.size` | 24pt | Navigation icon |
| `cartIcon.badge.size` | 16pt | Count badge |
| `cartIcon.badge.background` | colors.brand | |
| `cartIcon.badge.text` | colors.textInverse | |
| `cartRow.height` | 88pt | Thumbnail + details + stepper |
| `cartRow.thumbnail.size` | 64pt | |
| `cartRow.thumbnail.radius` | Radius.md | |
| `cartRow.stepper` | Stepper component | Per Report #43 |
| `cartSellerGroup.headerHeight` | 44pt | Seller name + avatar |
| `cartSellerGroup.header.background` | colors.surfaceAlt | |
| `cartSummary.sticky` | true | Bottom of checkout |
| `cartSummary.background` | colors.surface | |
| `cartSummary.borderColor` | colors.hairline | Top border |
| `cartTotal.font` | Type.price-list | 20pt |
| `cartTotal.savings.font` | Type.caption | "You saved £X" |
| `cartTotal.savings.color` | colors.success | |
| `expressCheckout.height` | 52pt | Apple Pay / Google Pay |
| `expressCheckout.radius` | Radius.full | |
| `bundleTier.indicator.height` | 4pt | Progress bar |
| `bundleTier.indicator.color` | colors.brand | |
| `bundleTier.label.font` | Type.caption | "Add 1 more for 15% off" |
| `abandonedCart.pushDelay` | 1 hour | First reminder |
| `abandonedCart.emailDelay` | 24 hours | Second reminder |

---

*Generated 2026-08-18. Verified sources: ebay.co.uk/help/buying/paying-items/shopping-basket (Add to basket, multi-seller checkout, Pay only this seller, Save for later, Request total), ebay.com.au/help/buying/shipping-delivery/saving-combined-shipping (combined postage via cart, combined invoice), ebay.co.uk/help/selling/posting-items/postage-rates/offering-combined-postage (combined invoices, shipping discount rules, Simple Delivery auto-combine), retailtantra.com (Immediate Payment conflict with multi-item cart, shipping policy IDs must match), outfy.com/blog/how-to-combine-shipping-on-ebay-complete-seller-guide-2026 (automatic shipping rules, manual combined invoices), help.shopify.com/en/manual/payments/accelerated-checkouts (accelerated checkouts: Shop Pay, Apple Pay, Google Pay, Amazon Pay, PayPal, Venmo, express checkout section), shopify.com/checkout (one-click checkout, 100M+ Shop Pay users, 12% US ecommerce), help.shopify.com/en/manual/online-store/dynamic-checkout/dynamic-checkout (accelerated buttons on PDP, skip cart, branded vs unbranded), help.shopify.com/en/manual/payments/accelerated-checkouts/apple-pay (Apple Pay activation, Safari only, Face ID/Touch ID), bogos.io/shopify-one-click-checkout (Shop Pay 50% higher conversion, 1.72x checkout-to-order, 1.91x on mobile). Production codebase audit: CheckoutScreen, BundleBagScreen, BundleUpsellRow, ThryftCartIcon, AddCardSheet, marketApi.*
