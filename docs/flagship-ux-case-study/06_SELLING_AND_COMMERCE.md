# Sector 6 — Selling and Commerce

## Product Purpose

Selling, listing management, checkout, orders, and support must feel trustworthy and premium — users are handling money and goods.

## Current Strengths

- `SellScreenV2` with form validation and image picker
- `ListingPreview` before publish
- `ManageListing` with status controls
- `CheckoutScreen` with clear pricing breakdown
- `OrderDetailScreen` with tracking timeline
- `MyOrdersScreen` with filter tabs

## Current Weaknesses

1. Sell form could use stronger visual grouping
2. Listing cards in management grid are basic
3. Checkout footer could be more prominent
4. Order tracking timeline lacks visual polish
5. No order search/filter

## Root Causes

1. Form sections lack card separation
2. Listing management uses basic grid
3. Checkout footer is absolute positioned with basic styling

## Changes in This Phase

- No selling/commerce changes in UI-21P.2

## Priority Score

| Screen | Current /10 | Primary Problem | Root Cause | Upgrade Now | Future Upgrade |
| ------ | ----------- | --------------- | ---------- | ----------- | -------------- |
| SellScreenV2 | 6 | Form sections basic | No card grouping | — | Section cards |
| Checkout | 6 | Footer styling | Inline styles | Safe area fix | Shared footer |
| OrderDetail | 6 | Timeline basic | Inline styles | — | Timeline component |
| MyOrders | 6 | Grid basic | — | — | Filter chips |

## Runtime Verification

- No changes made in this phase
