# Fulfilment Data Contract V3

## Goal

The order must permanently remember what the buyer purchased and what the seller is obligated to execute.

## Immutable purchase snapshot

```ts
interface OrderFulfilmentSnapshotV3 {
  schemaVersion: 3;

  destination: {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    region?: string;
    postalCode: string;
    countryCode: string;
    collectionPointId?: string;
    collectionPointName?: string;
    privacyMode: 'label_only' | 'seller_visible';
  };

  selection: {
    quoteId: string;
    quoteHash?: string;
    selectedAt: string;

    carrierId: string;
    carrierName: string;

    serviceCode: string;
    serviceName: string;
    deliveryMode: 'home' | 'parcelshop' | 'locker' | 'pickup' | 'specialist';

    trackingIncluded: boolean;
    signatureRequired?: boolean;

    etaMinDays?: number;
    etaMaxDays?: number;

    buyerShippingPriceGbp: number;
    payer: 'buyer' | 'seller';
  };

  parcel: {
    profile: 'letter' | 'small' | 'medium' | 'large' | 'custom';
    weightGrams?: number;
    lengthMm?: number;
    widthMm?: number;
    heightMm?: number;
  };

  policy: {
    shipByAt: string;
    extensionAllowed: boolean;
    protectionPolicyVersion: string;
  };
}
```

## Mutable fulfilment execution

```ts
interface OrderFulfilmentExecutionV3 {
  fulfilmentId: string;
  status:
    | 'required'
    | 'label_generating'
    | 'label_ready'
    | 'handoff_pending'
    | 'carrier_accepted'
    | 'in_transit'
    | 'out_for_delivery'
    | 'delivered'
    | 'exception';

  label?: {
    providerLabelId: string;
    format: 'qr' | 'pdf' | 'png' | 'zpl';
    url?: string;
    qrToken?: string;
    expiresAt?: string;
    generatedAt: string;
  };

  tracking?: {
    number: string;
    url?: string;
    carrierStatus?: string;
    firstScanAt?: string;
    lastEventAt?: string;
  };

  handoff?: {
    locationId?: string;
    locationName?: string;
    acceptedAt?: string;
    proofUrl?: string;
  };

  deadline?: {
    originalShipByAt: string;
    currentShipByAt: string;
    extensionStatus?: 'requested' | 'accepted' | 'declined';
  };

  lastProviderError?: {
    code: string;
    retryable: boolean;
    occurredAt: string;
  };
}
```

## Money projection

```ts
interface OrderMoneyProjectionV3 {
  escrowStatus: 'none' | 'held' | 'releasable' | 'released' | 'refunding' | 'refunded';
  sellerProceedsGbp: number;
  estimatedReleaseAt?: string;
  releaseConditionLabel: string;
  payoutStatus?: 'not_ready' | 'queued' | 'paid' | 'failed';
}
```

## Contract requirements

- Persist destination **snapshot**, not merely mutable address ID.
- Persist exact purchased service name/code.
- Persist quote hash/version where provider contract needs proof.
- Never infer purchased service from current seller postage settings.
- Never regenerate a different service silently.
- Store provider label ID separately from transient signed label URL.
- Signed URLs may expire; regenerate access URL from label ID.
- Provider tracking URL should come from adapter/server where possible, not a client hard-coded carrier switch.
- Redact destination fields based on role and fulfilment mode.
- Return server-derived deadlines and capabilities.
- Validate all status-changing mutations against server state.
