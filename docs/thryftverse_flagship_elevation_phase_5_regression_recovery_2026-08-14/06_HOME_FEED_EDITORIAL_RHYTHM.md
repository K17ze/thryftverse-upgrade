# Home Feed Editorial Rhythm V5

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Feed quality is not card quality alone

A flagship feed needs rhythm:
- scale contrast;
- media contrast;
- content-family interruptions;
- enough repetition to learn;
- enough variation to avoid machine-generated monotony.

## Feed display roles

```ts
type HomeDisplayRole =
  | 'commerce_standard'
  | 'commerce_tall'
  | 'look_feature'
  | 'poster_social'
  | 'live_auction'
  | 'editorial_collection';
```

Ranking decides order; visual role must not reorder relevance.

## Budget per ~12 content units

Typical:
- 8–10 commerce tiles;
- ≤1 Look/Poster interruption;
- ≤1 editorial/live interruption.

Avoid “every N items insert rail” if semantically unrelated.

## For You / Following

Keep one quiet scope control.

Following can support stronger seller/creator identity.
For You emphasizes product identity.

## Social pulse

If Poster/story content exists:
one lane or one integrated module.
Do not duplicate it as:
- story rail;
- Poster rail;
- recent creator rail.

## Video

One active playback.
No autoplay sound.
Use strong poster frame and instantaneous pause offscreen.

## Content-chrome ratio

Home should achieve roughly 70%+ media/content area in typical first viewport, but the remaining text must still carry commerce identity.

## Recommendation explanations

Only when useful:
- `Because you saved Prada`
- `Similar to your search`

Do not show an explanation label on every recommendation.

## Negative feedback

Long press:
- Hide
- Not interested
- Find similar
- Report

Do not put these actions permanently on every tile.

## Human art direction test

Capture 5 consecutive viewport screenshots.
Fail if:
- same card shape repeats mechanically;
- same text block repeats below every media;
- two editorial modules are adjacent;
- every second row has identical height;
- no recognizable visual “breathing” moments.
