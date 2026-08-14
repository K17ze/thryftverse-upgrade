# Anti-AI / Anti-Bot Human Art Direction V3

> Phase 3 audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `315a0760267354be46fec8a5f83ad8746badd392`

## Objective

Remove the behavioral and optical signature of code assembled by an AI coding agent without removing useful intelligence.

## Signature 1 — every concept becomes a component

Symptoms:
hero card, status badge, info card, chip row, disclosure row, illustrated empty state, success celebration.

Flagship alternative:
many states are typography + spacing + media + one action.

## Signature 2 — explanatory copy used as quality

If hierarchy already explains the interaction, remove copy that narrates the feature.

## Signature 3 — named “premium” treatment

Premium is not:
glass + gradient + gold + oversized radius.

Premium is:
- exact crop;
- typographic rhythm;
- fast response;
- stable async state;
- truthful unavailable state;
- confident direct manipulation.

## Signature 4 — repeated pills

Pills are for compact selection/state/tags. They are not the default shape for every control or metric.

## Signature 5 — decorative AI identity

Outside Agents:
- no robot/sparkle/circuit language;
- avoid “AI-powered” labels;
- prefer Suggested, Improve, Draft, Try layout, Find similar.

## Signature 6 — design-by-reference source comments

Remove comments like:
- Instagram pattern
- Snapchat pattern
- flagship 2026
- premium glassmorphism
- psychology
- per spec / per audit

Keep comments for real invariants, security, platform bugs, state contracts and performance.

## Production residue gate

Add `scripts/check-production-residue.mjs`.

Fail production code on unallowlisted:
- `DEMO_MODE = true`
- mock service dependencies
- `mockData` in domain contracts
- fake provider connection
- production-visible demo data
- deterministic fake AI reply catalogues
- persisted IDs using `Math.random()`
- AsyncStorage secret patterns.

Warn on design-by-reference comments.

## First-viewport budget

- one dominant media OR numeric region;
- one primary CTA;
- max three utility actions;
- no nested cards;
- no more than one smart/agent prompt competing with the user’s main task.

## Review question

If every word “AI”, “flagship”, “premium” and “smart” were removed, would the screen still feel intentional?

If not, composition is relying on branding rather than design.
