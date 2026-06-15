# Sector 7 — Co-own Financial

## Product Purpose

TradeHub, AssetDetail, Portfolio, and co-ownership flows must feel serious, trustworthy, and data-rich — users are making financial decisions.

## Current Strengths

- `TradeHubScreen` with market overview, leaderboard
- `AssetDetailScreen` with price chart, unit breakdown
- `PortfolioScreen` with holdings, PnL
- `SyndicateScreen` with auction creation
- `AuctionsScreen` with live auction list
- UI-20: Financial truth labels, no mock data

## Current Weaknesses

1. Price charts are basic
2. Financial tables lack visual hierarchy
3. No portfolio performance graph
4. Auction cards could be more visually engaging

## Root Causes

1. Chart library not integrated
2. Financial data displayed as plain text
3. No shared financial card primitive

## Changes in This Phase

- No co-own changes in UI-21P.2

## Priority Score

| Screen | Current /10 | Primary Problem | Root Cause | Upgrade Now | Future Upgrade |
| ------ | ----------- | --------------- | ---------- | ----------- | -------------- |
| TradeHub | 7 | Good overview | — | — | Chart integration |
| AssetDetail | 7 | Basic chart | No chart lib | — | Price history graph |
| Portfolio | 6 | Text-heavy | No visualisation | — | Performance chart |
| Syndicate | 6 | Functional | — | — | Auction card polish |

## Runtime Verification

- No changes made in this phase
