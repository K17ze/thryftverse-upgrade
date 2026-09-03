# Page Composition Guide

Department-specific page shells that compose `FlagshipScreen` with a deliberate
composition grammar. Each shell encodes the dominant object, supporting layer,
and anti-patterns for its department per Design.md §9.4.

## When to use each page shell

| Shell | Department | Density | Dominant object |
|---|---|---|---|
| MediaStageScreen | PDP, discovery detail | editorial | Media |
| DenseListScreen | Inbox, inventory, analytics | compact | People/items |
| SettingsCanvasScreen | Settings, account | regular | Information architecture |
| TaskQueueScreen | Seller Hub | regular | Urgent task |
| CommitmentScreen | Checkout | regular | Order total |

## Shell contracts

### MediaStageScreen
- `mediaZone` — full-bleed, no gutter. Media is the dominant object and the
  primary colour of the screen.
- `children` — content sheet that slides up over the media. Item truth
  (title, price, trust, specifics, seller, shipping, policy) lives here.
- `actionBar` — sticky primary action + trust anchor.
- Avoid: promo modules hidden above item truth; decorative gradient headers.

### DenseListScreen
- `header` — compact title + optional right action.
- `segments` — optional segmented control (Primary / Requests for inbox).
- `filterRail` — optional horizontal filter strip.
- `children` — compact rows (56pt), hairline-separated.
- Avoid: oversized cards; excessive empty margins; card-on-card.

### SettingsCanvasScreen
- `header` — title + optional back.
- `searchPlaceholder` / `onSearch` — searchable IA. When the placeholder is
  omitted, no search field renders.
- `children` — sectioned list with current-value display.
- Avoid: dashboard metric tiles; decorative cards; label-everything disease.

### TaskQueueScreen
- `urgentTask` — one urgent task hero, top of viewport. The dominant object.
- `children` — compressed secondary facts (pulse, inventory, tools) as flat
  rows.
- Avoid: equal KPI tile grid; dashboard silhouette.

### CommitmentScreen
- `header` — back + minimal title.
- `orderSummary` — order truth + total, pinned to top of content.
- `children` — supporting layers: delivery, payment, protection.
- `commitBar` — single primary action (Place order).
- Avoid: brand decoration competing with commitment; promo modules.

## Density modes

Each shell accepts a `density` prop (`compact` | `regular` | `editorial`)
overriding its default. See `src/theme/density.ts` for the geometry configs
(row height, gutter, section gap, card radius, media aspect ratio).

## Anti-AI design rules
- One dominant object per screen.
- No card-on-card composition.
- No decorative chrome (shadows, gradients, pills on every element).
- No label-everything disease.
- No duplicate headings.
- Full state coverage (loading, empty, error, offline) — the consumer owns
  state surfaces; these shells stay neutral so state reads clearly against
  them.
