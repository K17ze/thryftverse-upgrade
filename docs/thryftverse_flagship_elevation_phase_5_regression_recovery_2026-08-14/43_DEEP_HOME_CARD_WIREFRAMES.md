# Deep Home Card Wireframes & Variants

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Variant A — standard discovery commerce

```text
┌──────────────────┐
│                  │
│       PHOTO      │
│             ♡    │
│                  │
└──────────────────┘
Acne Studios scarf
£86
```

Use ~80% of Home commerce cells.

## Variant B — context-rich recommendation

```text
┌──────────────────┐
│       PHOTO      │
└──────────────────┘
Prada loafers
£210 · Your size
```

No additional card.

## Variant C — price drop

```text
┌──────────────────┐
│       PHOTO      │
└──────────────────┘
Miu Miu sunglasses
£120  £160
Price dropped
```

Use semantic accent only on drop.

## Variant D — followed seller

```text
┌──────────────────┐
│       PHOTO      │
└──────────────────┘
@maya
Vintage JPG dress
£95
```

Use seller identity because Following context justifies it.

## Variant E — live auction

```text
┌──────────────────┐
│       PHOTO      │
│ LIVE       04:12 │
└──────────────────┘
Prada 2005 bag
£420 current bid
```

Auction is a different role and can use overlay urgency.

## Variant F — Look/editorial

Large 4:5 composition.
Creator / title below.
No price unless shoppable tags opened.

## Spacing

2-column Home:
- horizontal gap 6–10pt range;
- vertical gap should include text block naturally;
- avoid giant 16–20pt blank gaps between image rows.

## Media radius

Small-moderate.
Do not use same large radius as sheets/cards.

## Text line policy

Identity:
1 line preferred.
2 max.

Price:
1.

No third line unless context fact earns it.

## Backend fallback

Brandless:
`Vintage leather shoulder bag`
not blank brand.

No size:
nothing.
Do not render `Size —`.

No seller avatar:
does not affect standard card.

## Screenshot test

Fixture and backend each render the six variants above.
Compare:
- media height;
- baseline rhythm;
- title wrapping;
- price;
- missing-data behavior.
