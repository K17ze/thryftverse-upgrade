# Shared Commerce Detail Art Direction Prompt

## Scope

Components under:

`frontend/src/components/commerce/detail/`

Especially:

- `CommerceDetailIdentity`
- `CommerceDetailTransactionSurface`
- `CommerceDetailSection`
- `CommerceDetailSellerRow`
- `CommerceDetailStateDock`
- `CommerceDetailHeader`
- `CommerceDetailMediaRail`
- `CommerceDetailDisclosureRow`
- `CommerceDetailMetricRow`
- `CommerceDetailUnavailableInline`

## Objective

Keep one shared system while removing the templated appearance.

The shared system should create consistency through:

- spacing;
- typography;
- header motion;
- interaction behaviour;
- accessibility;
- disclosure patterns;
- dock behaviour;

not by forcing every family into identical rounded cards.

## Mandatory changes

### 1. Add family-aware transaction variants

Add a typed prop:

```ts
type CommerceDetailFamily = 'direct' | 'auction' | 'co_own';
```

`CommerceDetailTransactionSurface` must support:

#### Direct

- near-flat;
- minimal radius;
- limited surface contrast;
- price often remains in identity;
- no unnecessary card when there is no complex transaction state.

#### Auction

- stronger numeric composition;
- current bid dominant;
- countdown integrated;
- reserve/viewer state secondary;
- controlled urgency.

#### Co-Own

- structured market grid;
- tabular bid/ask;
- precise status row;
- no crypto visual gimmicks.

Do not create three separate transaction components.

### 2. Add section rhythm variants

Add:

```ts
type CommerceDetailSectionVariant =
  | 'standard'
  | 'editorial'
  | 'compact'
  | 'continuation'
  | 'legal'
  | 'discovery';
```

Behaviour:

- `standard`: existing simple section.
- `editorial`: stronger heading, more breathing room, no divider.
- `compact`: disclosure row with minimal vertical spacing.
- `continuation`: no heading or divider.
- `legal`: subdued, collapsed-first.
- `discovery`: visual heading and rail spacing.

### 3. Make identity responsive and family-aware

Add family and density props:

```ts
family: 'direct' | 'auction' | 'co_own';
density?: 'compact' | 'standard';
```

Rules:

- Direct may show price.
- Auction must not show price.
- Co-Own must not show price.
- Compact width uses 26pt title.
- Standard uses 28–30pt.
- Long titles use tighter size/line height.
- Maximum two lines.

### 4. Rework dock geometry

Support:

```ts
layout?: 'inline' | 'stacked' | 'auto';
```

`auto` should:

- use inline on sufficient width;
- stack actions on compact widths;
- prevent button labels from truncating;
- keep visible controls from becoming giant pills;
- preserve 44–48pt hit targets.

Family tone:

- Direct primary: Buy now.
- Auction primary: Place bid / Bid again.
- Co-Own holder primary: Sell.
- Blocked states: one valid next action.

### 5. Reduce universal pill appearance

Do not use radius 24 for every action by default.

Use a restrained shape scale:

- primary commerce action: medium radius;
- secondary: quiet text or outlined control;
- icon hit target: invisible container;
- warning/blocked action: no giant red pill.

### 6. Typography consistency

Use design tokens rather than hardcoded font sizes and `fontWeight` where the project has family tokens.

All numeric amounts:

- tabular numerals;
- line-height controlled;
- no clipping under font scaling.

### 7. Motion

- one header transition;
- one media interaction transition;
- one dock entry transition;
- no stagger on every long-page section;
- respect reduced motion;
- no pulsing unless representing real, time-sensitive state.

## Required tests

Add tests for:

- family variants;
- identity price rules;
- section variants;
- compact dock stack;
- no hardcoded colour regressions;
- reduced motion;
- font scaling and long labels;
- 320-width button safety.

## Commit

`refactor(commerce-detail): add family art direction and responsive density`
