# 03 — CO-OWN ASSET DETAIL RECONSTRUCTION

## Target silhouette

The Co-Own page must feel like:

- a premium luxury product page;
- with a disciplined market layer;
- not a retail banking dashboard;
- not a crypto exchange;
- not a legal form.

## Required mobile order

### 1. Media stage

Use the shared media stage with:

- Back;
- Share;
- Saved/Watch—choose one primary persistence action for the hero;
- Co-Own + Open/Paused/Closed as one compact family-state treatment;
- media count.

Move lower-frequency actions to overflow.

### 2. Identity and issuer confidence

One compact section:

- `Co-Own` or category/brand line;
- title;
- issuer avatar/name/verification/rating in a slim row;
- a small Watch toggle only if Watch remains semantically separate from Saved.

Do not render a second large issuer card when the slim row is present.

### 3. Market snapshot

Replace the phone three-column `CoOwnValueStrip`.

#### Phone layout

Primary row:

- label: Last trade;
- `85.00 1ZE`;
- age/source when available;
- movement only when derived from valid executions.

Secondary top-of-book row:

- Bid `84.00 × 8`;
- Ask `86.00 × 5`;
- Spread `2.00`.

Market state footer:

- Continuous · Open;
- stale indicator when applicable;
- Rights version entry.

Fundamental and cash are compact secondary rows below:

- NAV/unit — Not available;
- Next distribution — Not scheduled;
- Next report — Not scheduled.

Do not give unavailable secondary values equal visual weight to the live market.

#### Tablet layout

The three-domain model may become columns only when each column has sufficient width and values cannot collide.

### 4. Viewer position before generic supply

When viewer owns units, render:

- `Your position`;
- `5 units`;
- `5% ownership`;
- current value only when calculable;
- average entry/P&L only when real;
- pending/reserved states when present.

Use a compact personalised surface.

### 5. Availability and supply

Default view:

- `35 units available`;
- `65% allocated`;
- allocation bar;
- holder count if real.

Move authorised/issued/public float/sponsor locked/treasury into:

- `View supply structure`;
- bottom sheet or disclosure section.

Do not keep the full five-row accounting ledger expanded by default.

Do not infer sponsor locked as a meaningful zero when the backend simply does not expose it. Missing and zero are different.

### 6. Price history

When execution data exists:

- one integrated chart surface;
- compact range selector;
- line/candle mode in overflow or one two-state toggle;
- volume only when present;
- high/low/trade count in a compact footer.

When execution data is empty:

- hide period/mode/volume controls;
- show a compact inline state:
  - `No settled trade history yet`;
  - `The last price will update after a settled execution.`

When the request fails:

- show:
  - `Price history unavailable`;
  - Retry;
- do not show `+0.0%`;
- do not reserve a large blank chart.

### 7. Order book

- Keep collapsed by default on phone.
- Summary is already shown in Market snapshot.
- Expanded state shows executable levels.
- Do not display “0 bids” as if it were a valid market.
- A level tap may prefill trade only when the existing compliance and rights rules allow it.

### 8. Asset evidence

Combine category evidence, authenticity, condition, storage, insurance and appraisal into one `Asset dossier` section.

Default:

- 3–5 highest-value facts;
- one `View full dossier` disclosure.

No empty dossier cards.

### 9. Rights and risk

Default summary:

- `Rights & risks`;
- completion state;
- one critical plain-language statement:
  - `You own units in the asset, not the physical item.`
- `Review 13 terms`.

Full sheet keeps all canonical rows.

Risk disclosure should be collapsed by default:

- `5 key risks`;
- first two risks;
- `View all risks`.

Move `Report an issue` to:

- overflow;
- rights sheet footer;
- or a quiet support row near the end.

### 10. Exit language

Do not show `Buyout options` when the only available route is not full-asset buyout.

Use the real capability:

- Sell units;
- Transfer restrictions;
- Secondary-market exit;
- Buyout unavailable.

### 11. Sticky dock

#### Tradable, non-holder

- price;
- Buy units.

#### Tradable holder

- compact price;
- Sell;
- Buy more.

#### Rights incomplete

Do not render a large passive warning card.

Render:

- title: `Trading unavailable`;
- subtitle: `Complete rights disclosure`;
- action: `Review rights`.

The dock must open `CoOwnRightsSheet`.

#### Paused/closed

- short state;
- one valid action such as `View orders`, `View market`, or none.

## Existing files to reconstruct

- `frontend/src/screens/AssetDetailScreen.tsx`
- `frontend/src/components/coown/CoOwnValueStrip.tsx`
- `frontend/src/components/coown/CoOwnOwnershipPanel.tsx`
- `frontend/src/components/coown/CoOwnIssuerCard.tsx`
- `frontend/src/components/coown/CoOwnPriceChart.tsx`
- `frontend/src/components/coown/CoOwnRiskDisclosure.tsx`
- `frontend/src/components/coown/CoOwnStickyActionDock.tsx`
- `frontend/src/components/coown/CoOwnMarketStatusStrip.tsx`
- `frontend/src/components/coown/CoOwnAssetDossier.tsx`
- `frontend/src/components/coown/CoOwnTrustPanel.tsx`

Keep the public exports stable unless a controlled migration is made in the same commit.
