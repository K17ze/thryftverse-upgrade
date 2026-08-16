# Listing Shipping & Fulfilment V2

## Current problem

`SellScreen.tsx` stores:
```ts
shippingMethod: 'standard' | 'express' | null
shippingPayer: 'buyer' | 'seller' | null
```
and renders:
```text
Shipping method
[ Standard ] [ Express ]

Who pays
[ Buyer pays ] [ I pay (free) ]
```

This exposes abstract classifications without carrier, parcel size, price, tracking, ETA or seller workflow.

# Target simple state

Main listing form shows one row:
```text
Delivery
Small parcel · Buyer pays · 2–4 days       >
```

Opening it shows the configuration.

# Setup

## 1. Fulfilment mode
```text
How will the buyer get it?

● Ship it
○ Local pickup
```
Specialist categories can use brokered collection/transport.

## 2. Package profile
Infer a recommendation from category/item:
```text
Letter
Small parcel
Medium parcel
Large parcel
Custom
```
Ask exact weight/dimensions only if needed.

## 3. Real services
```text
Recommended
Evri Tracked
2–4 days · £3.49

InPost Locker
2–4 days · £3.29

Royal Mail Tracked 48
2–3 days · £4.25
```

## 4. Who funds delivery
```text
Shipping cost

● Buyer pays at checkout
○ Offer free shipping
```

If seller-funded:
```text
Estimated label £3.49
Your estimated proceeds decrease by £3.49
```
Do not call the economics “free”; only the buyer-facing shipping price is zero.

# Integrated vs custom

### Integrated
Platform handles:
- rate;
- label/QR;
- tracking;
- status events;
- compensation rules.

### Custom
Seller supplies:
- carrier/service;
- buyer shipping price;
- handling time;
- tracking.

Explain:
```text
You’ll arrange the label and tracking yourself.
```

# Reusable domain

```ts
interface FulfilmentPolicy {
  id: string;
  name: string;
  mode: 'integrated' | 'custom' | 'pickup';
  packageProfile?: {
    preset: 'letter' | 'small' | 'medium' | 'large' | 'custom';
    weightGrams?: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
  };
  enabledServices?: Array<{
    provider: string;
    serviceCode: string;
  }>;
  costPolicy: 'buyer_pays' | 'seller_subsidized';
  handlingDays: number;
  internationalEnabled: boolean;
}
```

Listing stores `fulfilmentPolicyId` plus optional per-listing override.

# Cross-product integration

### Product Detail
```text
Delivery from £3.49
2–4 working days · Tracked
```

### Checkout
Resolve buyer location/service and exact amount.

### Manage Listing
```text
Delivery
Small parcel · Buyer pays                   >
```

### Seller Hub
```text
Shipping policies >
Default: Small parcel / buyer pays
```

# High-value categories

Cars:
```text
Collection / specialist transport
Viewing location
Delivery available? optional quote
```

Yachts:
```text
Brokered location/viewing
Survey
Sea trial
Closing/transfer
```

# Acceptance

Pass only if:
- normal seller can configure shipping without carrier jargon;
- seller sees economic consequence;
- buyer sees cost/speed;
- integrated labels/tracking are real where promised;
- policies are reusable;
- Sell/Edit/Manage/ProductDetail/Checkout/Order/SellerHub share one fulfilment model.
