# Mobile Department Audit Brief — 2026-09-26

You are auditing ONE department of the ThryftVerse native mobile app (Expo/React Native, `frontend/src/`) and cross-referencing it against the web replication (`web/src/`) and competitor quality bar. You are READ-ONLY. Write your findings to the file you were given; do not modify any code.

## Product

ThryftVerse — flagship marketplace for pre-loved fashion. Dark-first editorial luxury. Reference quality bar: Pinterest (masonry/media), Vinted (commerce clarity), eBay (trust/signals), Instagram (social grammar), Depop (closet culture).

## Audit criteria (apply ALL of these)

### 1. Anti-AI design policy (a finding is any of these present)
- Generic dashboard silhouette: repeated rounded rectangles of equal weight stacked vertically; at thumbnail scale it reads as a grid of grey cards, not a product.
- Symmetry-by-default: everything centred, identical section heights, identical gaps. Real surfaces have intentional asymmetry and dominant objects.
- Decorative chrome: shadows on every card, pills around every control, gradients on headers, glass on panels.
- Label-everything disease: eyebrow + title + subtitle + caption + badge on every row. Real apps show less; the object is the label.
- Duplicate/restated headings: screen header repeats section title repeats card title.
- Placeholder-grade media: grey rectangles, `#ccc`, `contentFit="cover"` with no focal logic, no art direction.
- Over-scaffolding: 3 layers of abstraction for one control; dead wrappers.
- Inconsistent primitives: mixed radii, mixed chip styles, mixed press feedback in one viewport.
- Stateless UI: only the happy path. Missing loading (skeleton, not spinner), empty, error, partial, offline states.
- Verbose explanatory copy ("Welcome back! Here you can manage...").
- Excessive motion: everything animates; motion without meaning.

### 2. Design-system contract (mobile tokens: `frontend/src/theme/designTokens.ts`, `typography.v2.ts`, `iconTokens.ts`; web contract: `web/DESIGN-SYSTEM.md`)
- One radius grammar, one stroke grammar (hairline separators, 1pt fields, 2pt focus/selection), one icon family + size bands (nav 20–24, metadata 14–18), one press feedback.
- 44pt minimum hit targets; hit area ≠ visible shape (no decorative 44pt grey circles around 20pt glyphs).
- Surface budget: above the fold at most one dominant non-media panel; flat canvas + hairlines is the default utility structure.
- Radius budget: ≤2 non-avatar radii per viewport (8–12 utility, 12–16 media/fields, 20+ dominant panel/sheet only).
- Tabular figures for money; text budget ~3 type sizes in first viewport.
- Density: list viewport exposes ~4–6 useful rows; discovery viewport ≥2 media objects.

### 3. Web cross-reference (the web app already passed 12 waves of competitor-grade upgrades)
Read the corresponding web routes for your department. Anything the web does better is a parity gap for mobile: e.g. eBay-style conversational signal line on PDP, item-specifics ledger, sticky capped buy column, facet counts on refinement, recently-viewed rail, order milestones, per-seller parcels in checkout, bundle upsell, saved-search replay, notification day-groups + deep links, inbox receipt ticks + date dividers, hover/press quick-actions on tiles, zero-result recovery, "did you mean" tolerant search.
Web routes live in `web/src/app/<route>/page.tsx` with components in `web/src/components/`.

### 4. Competitor grammar (current-date research)
- eBay: VI signals placements — Urgency over the picture panel, Conversational below engagement buttons (arxiv 2510.01198); item specifics high on page; trust adjacent to buy actions; search with larger images + consolidated delivery options.
- Vinted weaknesses to EXCEED: seller-page has no size/colour/condition filters; bundle view has no filters; PDP over-saturated without progressive disclosure; truncated price display.
- Pinterest: smart feed — best-first not newest-first, sources mixed at different rates; masonry with real ratios; hover/press quick-actions on tiles.
- Depop: bigger images in search results; photography spotlight; Instagram-style grid grammar.
- Instagram: stories rail, date-separated messaging, receipt ticks, tab structure on profile.

### 5. Full-stack correctness
- Trace the data path: screen → hooks → services → contracts. Flag fabricated types, `any` casts, mock-only paths presented as real, missing error/retry, N+1 patterns, race conditions.
- Check a11y: accessibilityLabel/Role/State on interactive elements, decorative icons hidden, focus order.

## Known prior fixes (verify still true; do NOT re-report as new unless broken)
Co-Own direction grammar (buy green/sell red across book/ticket/history/ledger/confirm), chart-type segmented control, order-book cumulative depth fan, group-chat media overlap composition, EditGroup scaffold removal.

## Output contract (write to your assigned file)

```markdown
# Audit — <Department> (mobile) — 2026-09-26

## Verdict
<2-3 sentences: overall quality vs web + competitors>

## Findings
### <ID> — <short title> [P0|P1|P2|P3]
- Screens: <files>
- Evidence: <file:line + what it renders>
- Web parity: <what web does / route>
- Competitor: <which reference grammar>
- Root cause: <why>
- Fix: <concrete implementation direction>
- Acceptance: <measurable>

## Non-findings (verified good)
<short list of surfaces checked and passed>
```

Severity: P0 = broken/dishonest/dead control; P1 = flagship-quality gap vs competitor grammar or web parity; P2 = polish; P3 = nit.
Aim for the 6–12 most material findings — depth over volume. Verify every claim with actual file reads (cite line numbers). Do not speculate.
