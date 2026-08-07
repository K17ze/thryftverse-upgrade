# ADR-002: Canonical money uses integer minor units

Status: accepted  
Registry: `iso4217-2026-07`  
Conversion boundary: `money-boundary-v1`

## Decision

Financial writes use a canonical `Money` value:

```text
currency + minorAmount + exponent + registryVersion
```

`minorAmount` is a positive base-10 integer string at API boundaries and a
`BIGINT` in PostgreSQL. Floating-point values and provider-native amount units
are not financial truth.

1ZE is separate from fiat money and uses:

```text
asset=1ZE + baseUnitAmount + baseUnit=mg + scale=3
```

## Provider boundary

| Provider | Outbound and inbound unit |
| --- | --- |
| Stripe | integer minor units |
| Razorpay | integer minor units |
| Mollie | fixed-scale major decimal string |
| Flutterwave | fixed-scale major decimal string |
| Tap | fixed-scale major decimal string |
| Wise | fixed-scale major decimal string |

Every conversion records the canonical amount, provider amount, source unit,
function version, registry version, and an equality proof. Webhook settlement
rejects a provider currency or minor amount that differs from the payment
intent.

Wise v3 declares quote `sourceAmount` as a JSON number. The implementation
therefore keeps exact decimal strings internally and converts to `Number` only
at that final provider transport boundary, while persisting the equality trace.

## Compatibility and rollout

Migration `079_canonical_money_units.sql` adds canonical columns beside legacy
decimal columns. New writes populate both during the compatibility window;
responses expose `money` while retaining legacy fields.

Legacy `amount_gbp` rows are backfilled only when their currency is GBP and the
decimal is exactly representable. A row labelled `amount_gbp` with a non-GBP
currency is not reinterpreted: it is marked `money_quarantined` and recorded in
`money_migration_quarantine`.

Versioned wallet payment creation requires `money.currency` and
`money.minorAmount`. The unversioned endpoint temporarily accepts
`amountGbp` only with GBP and rejects ambiguous mixed inputs.

Rollback is additive: application reads can return to legacy columns without
dropping canonical data or conversion evidence. Column removal requires a
separate migration after quarantines are resolved and shadow-read parity is
observed.
