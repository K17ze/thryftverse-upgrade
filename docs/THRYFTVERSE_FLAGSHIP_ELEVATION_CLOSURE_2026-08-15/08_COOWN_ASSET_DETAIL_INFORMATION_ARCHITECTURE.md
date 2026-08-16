# Co-Own Asset Detail V4
## Progressive sophistication instead of a data wall

# Problem

The current screen needs to serve:
- normal owners/buyers seeking confidence;
- advanced market users seeking microstructure.

Rendering both mental models in one long stream creates overload.

# User questions in order

1. What asset is this?
2. What does one unit cost?
3. Is it available / market open?
4. What do I own?
5. What can I do now?
6. Why trust the asset?
7. How is the market behaving?
8. What are advanced market details?
9. What rights do I own?
10. What are the risks?

# Viewport 1

```text
[media]

Rolex Daytona 116500LN
Collectible Watch

£104 / unit
220 available · Market open

You own 12 units · £1,248
+£84 (+7.2%)

[ Buy ]       [ Sell ]
```

Non-holder:
```text
£104 / unit
220 available
From £104

[ Buy units ]
```

No order book/NAV/diligence wall above this.

# Trust line

Maximum three facts:
```text
Authenticated · Insured custody · Rights defined    >
```
Tap enters canonical Diligence.

# Story

One editorial section:
```text
About this asset
...
Read full provenance >
```

# Market overview

```text
Market
[clean chart]

Last trade          £104
24h change          +1.2%
Bid / ask           £102 / £106
Allocated           78%

Advanced market data >
```

# Advanced market

Dedicated sheet/route:
- candle ranges;
- volume;
- order-book depth;
- spread;
- execution history;
- NAV premium/discount;
- freshness/reconciliation.

# Diligence

One canonical dossier:

### Asset
provenance, reference/serial, condition, authentication.

### Custody
custodian, location, insurance, inspection.

### Valuation
latest appraisal, date, methodology, next review.

### Rights
economic rights, governance, transfer, distributions, buyout.

### Risk
liquidity, valuation, custody, concentration, market, settlement.

### Audit
documents, event log, issuer updates.

Do not duplicate all these as main-screen rows and another due-diligence screen.

# Holder position

Tap position for:
- units;
- average entry;
- current value;
- unrealized/realized P&L;
- transaction history;
- tax documents.

# State handling

Reconciliation/closed/stale:
- one top state explanation;
- affected controls disable;
- deeper reason in Market.
Do not scatter several status banners.

# Visual

- subtle premium-commerce canvas allowed;
- no decorative gold requirement;
- numerical typography carries authority;
- media/provenance carries emotion;
- one transaction dock;
- one chart surface;
- one dossier entry.

# Acceptance

First screenshot communicates:
asset, price, availability, position and action.

Second viewport communicates:
trust/story + market trend.

Advanced microstructure remains one tap away.
