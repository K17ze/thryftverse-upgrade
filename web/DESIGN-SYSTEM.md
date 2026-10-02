# ThryftVerse Web — Design Contract (v2.0)

**Benchmark date: 2026-10-02.** This file is the binding contract for every
surface built in `web/`. It mirrors the mobile app's design system — the
canonical mobile sources are `frontend/src/theme/typography.v2.ts`
(TypographyV2, canonical for type), `frontend/src/theme/ThemeContext.tsx`
(runtime colours), and `frontend/src/theme/designTokens.ts` (Space/Radius/
motion tokens; its `Type`/`TypeStyles` exports are deprecated compatibility
only — never implement new type code from them).

Calibration bar: **eBay Evo** (trust grammar, funnel-wide guarantee blocks),
**Depop** (seller identity, social storefront energy), **Pinterest Gestalt**
(chrome restraint, masonry, token roles), **Vinted** (transaction clarity),
**Vestiaire** (premium restraint), **Whatnot** (live/auction urgency).

## Product

ThryftVerse — flagship marketplace for pre-loved fashion. Reference quality bar:
Pinterest (masonry/media treatment), Vinted (commerce clarity), eBay (trust),
Instagram (social/stories/inbox). **Dark is the flagship theme**; light exists
via `[data-theme="light"]` CSS vars — never hardcode hex colors.

## Reference priority (conflict resolution order)

When documentation, references, and code disagree, resolve in this order:

1. User-provided reference images and explicit visual feedback
2. Current production ThryftVerse patterns that already pass device review
3. Current public reference-app patterns verified at the benchmark date
4. iOS HIG / Android Material / WCAG 2.2 guidance
5. Generic design trends

Runtime truth rule: when docs and code disagree, verify the active branch,
treat current code as runtime truth, treat this file as the design target, and
make a focused token-migration change before using missing tokens. Never
hardcode target values into screens.

## Canvas modes — choose before styling a screen

Every surface selects exactly one canvas mode. The mode decides surface
treatment, accent budget, and chrome weight.

| Mode | Canvas | Accent policy | Web surfaces |
|---|---|---|---|
| **Media** | Neutral white (light) / near-black `#0A0A0A` (dark) | Imagery carries colour; zero decorative accent by default | `/`, `/browse`, `/explore`, `/search`, `/item/[id]`, `/look/[id]`, `/collections`, `/moodboards`, `/saved`, `/galleria`, `/live`, `/pulse` |
| **Premium-commerce** | Warm off-white `#FBF9F6` (light) / warm near-black `#0C0A08` (dark) | Optional contextual champagne/bronze for authenticated value, verified status, curated distinction | `/auctions/[id]` featured lot, `/co-own/[id]` asset detail, authenticated resale, verified seller storefront, ownership certificate |
| **Utility** | Neutral white / near-black | No decorative accent; quality from geometry, typography, state clarity | `/settings/*`, `/profile/edit`, `/help`, `/privacy`, `/terms`, `/notifications` (preferences), account forms |

Rules:

1. **Imagery carries colour on media surfaces.** The UI never competes with
   user content.
2. **Canvas warmth is contextual, not global.** Premium surfaces are allowed
   only where materiality or authenticated value matters.
3. **One dominant accent family per visual cluster.** Semantic state colours
   are not decoration.
4. **No generic blue-purple web gradients.** Media scrims only.
5. **Editable fields must look editable** — `bg-input` or transparent with
   clear borders/focus; never flat mid-grey blocks that read as disabled.
6. **Gold is never a substitute for hierarchy.** A screen may be flagship
   with zero gold.
7. **Status colours are truthful and accessible.** Fills (`bg-danger`,
   `bg-success`, `bg-warning`) tint and accent icons; the readable word/number
   role is always the `*-text` foreground (`text-danger-text`,
   `text-success-text`, `text-warning-text`). Never render status copy in the
   fill colour.

## Non-negotiables (anti-AI design policy)

- **Media is the color.** Real imagery anchors every surface — no grey-box
  placeholders with labels on top.
- **Flat canvas + hairlines.** Sections are separated by spacing and
  `border-border-subtle` hairlines — do NOT wrap everything in rounded cards.
- **Restraint.** No gradients on surfaces (media scrims only), no glassmorphism
  panels, no shadows on cards, no decorative badges/pills everywhere.
- **One grammar.** One radius grammar, one icon family (io5 via `Icon`), one
  chip style, one button grammar, one press feedback (`.pressable` scale 0.975).
- **No duplicate titles.** Screen header doesn't repeat the section title.
- **Hit area ≠ visible shape.** 44px targets, 20–24px glyphs, no decorative
  chrome circles around icons. On media: `drop-scrim` for
  legibility, no solid circles.
- **Full states.** Loading (skeleton, not spinner), empty (EmptyState),
  error, populated — all designed.
- **Tabular figures for money.** `tnum` class on every price/financial value.
- **No emojis.** Ever. Icons only via `Icon`.

## Tokens (Tailwind classes)

Colors: `bg-background`, `bg-surface`, `bg-surface-alt`, `bg-surface-raised`,
`bg-surface-elevated`, `bg-brand`, `bg-brand-pressed`, `bg-brand-subtle`,
`text-text-primary`, `text-text-secondary`, `text-text-muted`,
`text-text-inverse`, `border-border`, `border-border-subtle`,
`text-danger-text`, `bg-danger`, `bg-danger-subtle`, `border-danger-border`,
`text-success-text`, `bg-success`, `bg-success-subtle`,
`text-warning-text`, `bg-warning`, `bg-warning-subtle`,
`text-commerce-trust`, `bg-commerce-trust-subtle`,
`text-coown-up`, `text-coown-down`, `text-scrim-text-primary`,
`bg-overlay`, `bg-media-overlay-scrim`, `text-rating-star`, `text-antique-gold`,
`bg-input`, `text-input-text`, `bg-row`, `bg-row-pressed`, `bg-header`.

Spacing: `p-xs`(4) `p-sm`(8) `p-sm-md`(12) `p-md`(16) `p-lg`(24) `p-xl`(32)
`p-xxl`(48) — standard Tailwind spacing also fine (4px grid).

Radius: `rounded-sm`(4) `rounded-md`(8) `rounded-lg`(12) `rounded-xl`(16)
`rounded-chat`(20) `rounded-xxl`(24) `rounded-sheet`(20) `rounded-full`.
Media/fields use `rounded-lg`/`rounded-xl`. Nothing over `rounded-xl` except
sheets, rails, pills/avatars.

Type scale (each `text-*` class carries the mobile TypographyV2 role's
size, line-height, letter-spacing AND default weight — headings tighten,
microtype opens): `text-micro`(10/500/+0.2) `text-meta`(11/500/+0.15)
`text-label`(11/600/+0.5, auto-uppercase) `text-caption`(12/400/+0.1)
`text-caption-elevated`(13/500/0) `text-body`(14/400/−0.2)
`text-body-emphasis`(15) `text-body-large`(16)
`text-section-title`(17/600/−0.4) `text-item-title`(18/600/−0.3)
`text-price-list`(20/700/−0.3, tabular) `text-numeric-meta`(13/600, tabular)
`text-screen-title`(24/700/−0.6) `text-hero`(28/700/−0.5)
`text-price-hero`(28/700/−0.5, tabular) `text-display`(32/700/−0.5)
`text-display-large`(40/700/−0.6).
Editorial serif: `text-editorial-display`(28/700 Playfair) and
`text-editorial-title`(20/400 Playfair) — for page/section/editorial
headlines only, sparingly (mobile uses serif only for lot titles,
Discover headers, seller names). `font-serif` remains for one-off sizes
like the Galleria hero campaign statement.

Shadows: `shadow-subtle` `shadow-floating` `shadow-modal` —
deliberate only, never routine.

Z-index: `z-elevated` `z-sticky` `z-dropdown` `z-modal` `z-toast` `z-overlay`.

Utilities: `pressable` (press feedback), `tnum`, `skeleton`, `clamp-1`,
`clamp-2`, `no-scrollbar`, `drop-scrim`, `img-fade`.

## Primitives (`@/components/ui/`)

- `Icon` — `name` (semantic, e.g. 'home','heart','bookmark','share','cart',
  'wallet','verified','search','filter','options','back','forward','close',
  'check','plus','trash','edit','more','chevronDown','chevronUp','clock',
  'location','notifications','inbox','chat','send','offer','payout','bag',
  'play','images','image','camera','layers','scan','leaf','star','eye',
  'trending','auction','box','receipt','card','shield','shieldCheck','lock',
  'key','help','info','alert','warning','people','person','profile','settings',
  'follow','menu','sort','refresh','download','mail','globe','palette','moon',
  'language','fire','store','inventory','dashboard','feed','compass','link',
  'document','folder','ban','phone','desktop','chip','pin','flag','mic','stop',
  'notificationsOff','mailUnread','arrowUp','remove','videocam','pause',
  'eyeOff','lockOpen','accessibility','analytics','sparkles','explore','create',
  'pricetag','tag'), `filled` (selected state), `size`, `className`.
- `Button` — `variant`: primary|secondary|quiet|outline|danger;
  `size`: sm|md|lg; `icon`, `fullWidth`.
- `IconButton` — `name`, `filled`, `size`, `onMedia`, `contained`; 44px hit.
- `AppImage` — `src`, `alt`, `aspectRatio` (w/h), `focalPoint`, `blurDataURL`,
  `fill`, `sizes`, `priority`, `fallbackIcon`. NEVER raw `<img>`/`next/image`.
- `Avatar` — `src`, `name`, `size`, `ring`.
- `Chip` — `selected`, `icon`.
- `Badge` — `variant`: neutral|success|warning|danger|trust|brand; `icon`.
  `SustainabilityChip` — `grade` A|B|C|D, `onMedia`.
- `Sheet` — `open`, `onClose`, `title`, `maxWidth`; bottom sheet on mobile,
  dialog on desktop. Focus trap + Escape included.
- `useToast().show(msg, 'success'|'info'|'error')`.
- `Skeleton`, `MasonrySkeleton`, `EmptyState` (icon,title,subtitle,actionLabel,
  onAction,compact).

## Shared components (`@/components/`)

- `cards/ProductTile` — `item: DiscoveryListingSummary`, `aspectRatio?`,
  `visualOnly?`, `priority?`. The canonical listing tile.
- `feed/MasonryGrid` — `units: DiscoveryFeedUnit[]`, `columns` (from
  `useMasonryColumns()`), `isLoading`, `emptyTitle`, `emptySubtitle`.
- `feed/FeedUnits` — LookTile, PosterTile, MoodboardTile, EditorialTile,
  RecommendationBreak.
- `feed/StoryRail`, `feed/SegmentedControl` (`options`,`value`,`onChange`).
- `layout/` — Header, MobileTabBar, Footer (already wired; don't duplicate).

## Data (`@/lib/`)

- Types: `@/lib/contracts/domain` — Listing, DiscoveryListingSummary, User,
  Conversation, Message, AppNotification, Order, Transaction, Review, Address,
  PaymentMethod, Look, Poster, Moodboard, Category, DiscoveryFeedUnit union.
- Queries: `@/lib/hooks/queries` — useListings(category?,query?), useFeed,
  useListing(id), useSellerListings(sellerId), useUser(id),
  useUserByUsername(username), useReviews(userId), useConversations,
  useConversation(id), useSendMessage(id), useNotifications, useOrders,
  useMyListings.
- Client: `@/lib/api/client` `data.*` — same surface as hooks. Fixture mode
  is default (`NEXT_PUBLIC_DATA_MODE=fixture`); add new fixture data in a NEW
  file `src/lib/data/fixtures-<dept>.ts` and re-export — do NOT edit
  `fixtures.ts` (other agents own it).
- Store: `@/lib/store/useStore` — wishlist, saved, bag (addToBag/removeFromBag/
  clearBag/isInBag), likedLooks. Zustand + localStorage persist.
- Session: `@/lib/session/SessionProvider` → `useSession()` returns
  `{ user, isGuest, signIn, signOut }`. Guest → route to `/auth`.
- Utils: `@/lib/utils/format` — formatPrice, formatCount, timeAgo, formatDate.
  `@/lib/utils/media` — aspect ratio/focal point/video helpers.
- Fixtures: `@/lib/data/fixtures` — LISTINGS, MY_LISTINGS, USERS, CURRENT_USER,
  CATEGORIES, HOME_CATEGORY_PILLS, STORY_RAIL, LOOKS, POSTERS, MOODBOARDS,
  CONVERSATIONS, NOTIFICATIONS, ORDERS, TRANSACTIONS, WALLET_BALANCE,
  ADDRESSES, PAYMENT_METHODS, REVIEWS; helpers listingById, userById,
  listingsBySeller.

## Conventions

- App Router under `src/app/`; interactive components need `'use client'`.
- `next/link` for navigation, `useRouter` for imperative.
- 44px minimum hit targets; `aria-label` on icon-only controls; semantic
  HTML (`article`, `nav`, `main`, `h1-h3`, `button`, `form`).
- Run `cd web && npx tsc --noEmit` — must pass clean.

## Platform systems — how screens adopt them

Wave-13 infrastructure lives in `components/flagship/` + `lib/{state-copy,
density,offline,i18n,accent,motion}`. Screens consume it; they don't
re-implement it.

### StateGate (`@/components/flagship/StateGate`)

The canonical loading → error → empty → content wiring. One gate per
query-owned list zone:

```tsx
<StateGate
  domain="orders"                 // registry copy domain
  isLoading={query.isLoading}
  isError={query.isError}
  stale={refreshFailed}           // populated-but-maybe-old → quiet pill
  skeleton={<OrdersSkeleton />}   // layout-matched, never a spinner
  onRetry={() => void refetch()}
>
  {content}
</StateGate>
```

- Copy resolves from `lib/state-copy/registry.ts` → `stateCopy.<domain>.*`
  i18n keys. Pass `skeleton` whenever the layout is predictable; the
  default skeleton is a fallback, not the target.
- `isError` while offline resolves to the domain's `offline` copy
  ("You're offline…"), not a generic failure — pass the raw query flags,
  the gate handles the grammar.
- `filtered` selects `emptyFiltered` copy; `emptyAction` adds the CTA
  (label defaults to `stateCopy.actions.browseListings`).
- `compact` tightens the centered states for sub-screen panes (inbox
  column, drawers).
- Keep bespoke states where they carry context the registry can't:
  per-tab empties, sign-in gates, crafted recovery surfaces. Adopt for
  the generic fetch states; don't downgrade a designed empty for
  consistency.
- New domains: add the key to `StateCopyDomain` + `DOMAIN_ICONS`, and
  author en copy in `STATE_COPY_WEB_EN` inside `scripts/sync-locales.mjs`
  (en only, mirroring mobile's coverage — non-en falls back). Never
  hand-edit `lib/i18n/locales/*.ts`.

### Density (`var(--density-*)`)

`useDensity()` persists the preference; `PlatformRuntime` mirrors it to
`<html data-density>`; `globals.css` holds the vars
(`--density-row-height`, `--density-row-py`, `--density-row-gap`,
`--density-gutter`, `--density-section-gap`).

- Prefer CSS var consumption (`py-[var(--density-row-py)]`) over the JS
  hook — geometry survives SSR/hydration.
- List rows consume `--density-row-py`/`--density-row-height`; grid gaps
  consume `--density-row-gap` with a floor (`max(4px, …)`) so compact
  never welds media; band/section rhythm consumes
  `--density-section-gap`.
- Density adjusts geometry only — never shadows, cards, or chrome.

### i18n chrome (`useLocale().t`)

`const { t, locale, setLocale, dir, locales } = useLocale()`. Chrome
strings (nav, tab bar, header utilities, footer, account menu, search
suggestions) resolve from `chrome.*` keys; shared actions from
`common.*`; state copy from `stateCopy.*`; sync/offline from `sync.*` /
`offline.*`.

- Data tables carry `labelKey` fields (`chrome.nav.*`, `chrome.links.*`,
  `chrome.groups.*`); components resolve `t(...)` at render.
- Missing chrome strings go in the `CHROME`/`CHROME_EXTRA` tables of
  `scripts/sync-locales.mjs` (authored translations, all 13 locales),
  then regenerate — the locale modules are generated files.
- Screen-level copy outside those namespaces is en-only until a surface
  adopts `t()` for it (see `lib/i18n/README.md`).

## Geometry budgets (machine-checkable)

| Token | Value | Rule |
|---|---|---|
| Minimum hit target | 44×44px | The whole row/control owns the target, not just the glyph. |
| Standard visible icon | 20–24px | Navigation/action glyphs. |
| Metadata icon | 14–18px | Inline metadata; the parent action keeps the 44px target. |
| Compact contained control | 32px visible chrome | Inside a 44px hit target — only when containment communicates selection, priority, or media contrast. |
| Standard contained control | 36px visible chrome | Inside a 44px hit target. |
| Separator stroke | platform hairline | `border-border-subtle` (1px). |
| Field stroke | 1px | `border-border`. |
| Focus stroke | 2px | `:focus-visible` brand ring — focus/selection only. |
| Search field height | 44–48px | The field may dominate a search header but never becomes a second page title. |
| Filter chip height | 32–36px visible | Inside a 44px interaction band. |
| Flat data row height | 52–64px | Price/status baselines stay stable across rows. |
| Bottom navigation height | 49–56px visible + safe-area inset | Never consumes a second toolbar row. |
| Viewport surface budget | ≤1 dominant non-media panel above the fold | Flat canvas, spacing, and hairlines are the default utility structure. |
| Viewport radius budget | ≤2 non-avatar radius sizes per viewport | Sheets/modals may add one. |
| Horizontal screen gutter | 16px compact default | 20–24px only when the composition earns it and density still passes. |
| Numeric alignment | Right-align comparable values | `tnum` on every price/financial value. |
| Discovery density | ≥2 meaningful media objects above the fold | Or the clear beginning of the next module. |
| Utility density | 4–6 useful rows in a standard viewport | Empty space supports focus, never compensates for chrome. |
| First-viewport type budget | ≤3 type sizes + ≤1 eyebrow | In normal use. |
| Default icon containment | transparent | Persistent fill only for selection, primary action, status, input grouping, or media contrast. |

Rejection tests (fail conditions, not aspirations):

- **Thumbnail test** — at 25% scale, the primary object and reading order
  must remain clear.
- **Squint test** — content and media dominate while chrome recedes.
- If rounded rectangles, empty grey placeholders, or header controls dominate
  either test, the screen is not flagship.

## Interaction physics

| Interaction | Contract |
|---|---|
| Press-in | 90–120ms to scale 0.975 (`.pressable`); never bounce. |
| Press-out | 140–180ms to rest; interruptible. |
| Direct drag | 1:1 finger/pointer tracking with no easing while the gesture is active; easing begins only after release. |
| Snap / settle | Position plus predicted end velocity; settle once, no overshoot for utility UI. |
| Sheet settle | 180–260ms, interruptible, velocity-aware; parent context stays visible. |
| Navigation push | Platform hierarchy transition with shared content continuity; never animate the whole destination as a floating card. |
| Selection change | State fill/icon change immediate or 120–180ms; haptic on committed selection, not touch-down. |
| Reduced motion | No spatial travel beyond platform minimum; instant state or 120–180ms opacity change. |
| Repeated actions | Frequent navigation/list selection/tool use never replays decorative entrance animation. |

## Trust grammar (how consequence is presented)

1. **Buyer protection is a repeated system block, not a footer disclaimer.**
   Icon + one-line promise + learn-more, placed **before** the irreversible
   step: PDP buy column, checkout review, receipt. One protection window
   copy canon — every surface states the same window (see
   `lib/commerce` policy constants); contradictions are defects.
2. **Verification badges are named precisely.** A badge communicates only
   what the backend evidences ("verified seller" = account info confirmed —
   not a performance guarantee). Never render a client-owned flag as
   compliance, eligibility, verification, or financial authorization.
3. **Honest scarcity only.** Legit signals: real inventory counts, real
   auction countdowns, evidenced like/watch activity, and the strongest
   resale signal — "1 of 1 — unique item". Forbidden: fabricated urgency,
   resetting timers, unsubstantiated low-stock, confirm-shaming. Every
   urgency string must trace to a real data field.
4. **Sold/unavailable keeps the listing referenceable but disables commerce
   truthfully** — `SoldOverlay`, no ghost CTAs, no dead affordances.
5. **Money is right-aligned, tabular, and never shrinks to fit.** When space
   runs out, supporting context reflows to its own line; the number stays
   exact and full-size.
6. **Errors are user-safe.** No status codes, no backend exceptions, no raw
   network messages. Forms focus a linked error summary; each error is
   associated to its field.

## Search & discovery architecture

**Mode transition:** Explore defaults to visual discovery; search becomes a
committed mode. One owner per viewport — the header owns lg+ search on
`/explore`; `/search` keeps its hero field at all sizes (it IS the page's
job). Never render two primary inputs in one viewport.

**Focused-empty state:** account-scoped recent searches as flat ≥44px rows;
Clear history reachable without becoming a filled button; saved searches as
flat rows; category shortcuts as restrained utility rows — never a wall of
equal rounded cards or nested icon circles. Hydration uses row-shaped
skeletons so the surface never flashes an incorrect empty prompt.

**Typing state:** at two characters, discovery modules collapse into a single
flat suggestion list directly below the field. First row: the broad, truthful
`Search for "query"`. Then ≤5 production-ranked suggestions; entity type only
when it disambiguates. Stale rows clear immediately; out-of-order responses
are ignored. Autocomplete failure never blocks keyboard Search.

**Results:** shoppable inventory uses uniform grids (2/3/4 columns by
breakpoint) so price/size alignment scans; masonry is reserved for inspiration
surfaces (Explore, Looks, Moodboards, similar-looks). Applied filters render
as dismissible chips above the grid, each individually removable, plus Clear
all. Target 4–6 items per screenful on mobile.

**Zero-result recovery (required anatomy):** echo the query + active filters;
per-filter remove affordances (distinguish filter-caused from catalog
empties); did-you-mean correction; broadened alternatives + popular
categories; **save-search/alert CTA** — the retention loop that matters most
on resale inventory. Never silently reset all criteria.

**Filter placement:** Back/Close leading → search/query central when
search-led → one Refine action trailing → one horizontal intent band →
content immediately below. If filters need more than one compact row,
secondary facets move into a sheet. Never wrap chips into 2–3 irregular rows
above the first result; never place the same category in header, chip,
section title, and card badge.

## Media pipeline contract

The contract seam is where `listing_images` rows project into API responses —
the source of truth for all media surfaces.

```typescript
interface ListingMediaRecord {
  uri: string;
  kind: 'image' | 'video';
  width?: number;                  // post-orientation
  height?: number;
  focalPoint?: { x: number; y: number };
  poster?: string;                 // video poster URI
  blurhash?: string;               // real BlurHash (Base83/DCT), not SHA-256 hex
  lqip?: string;                   // low-quality placeholder (base64)
  derivatives?: Array<{ width: number; height: number; url: string;
    format: 'jpeg' | 'webp' | 'avif' }>;   // ascending by width
  fit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
}
```

Rules:

1. Never download full-resolution originals for thumbnails — use
   `derivatives[]` (backend generates 200–2000w).
2. Placeholder geometry matches final image geometry — same `contentFit` and
   `contentPosition` as the final image.
3. Reset recycled image identity (`recyclingKey` + reset effect) so an old
   listing's photo never flashes on a new listing.
4. Missing media is honest — restrained placeholder with the correct aspect
   ratio, never a grey rectangle or broken-image icon.
5. EXIF orientation is preserved (`.rotate()` before re-encode).
6. Focal points are respected — `contentPosition` from `focalPoint` prevents
   centre-crop → focal-crop shift on crossfade.
7. **LQIP seam:** every `AppImage` consumer should pass `blurDataURL` from the
   projected `lqip` when available. Flat grey placeholders during remote load
   are a data-quality defect, not a style choice.
8. Media quality claims (width/height/focal/dominant colour) come from live
   projections and fail closed — the UI never fabricates media metadata.

## Cache propagation (React Query mutation-to-surface map)

Mutations invalidate only the queries that surface the mutated data. Canonical
query keys (from `lib/hooks/queries.ts`):

| Mutation | Invalidates |
|---|---|
| `createListing` / `updateListing` / `deleteListing` | `['my-listings']`, `['listings', …]`, `['listing', id]` |
| offer create / counter / accept / decline | `['listing', id]`, `['offers']` |
| order cancel / checkout settlement | `['orders']`, `['order', id, …]`, `['listing', id]` |
| review submit | `['reviews', userId]`, `['order', id, 'review']` |
| return case update | `['order', id, 'return-case']`, `['orders']` |
| `sendMessage` | `['conversation', id, userKey]`, `['conversations', userKey]` |
| `markRead` | `['conversations', userKey]`, `['notifications', 'unread-count']` |
| follow / unfollow | `['user', id]` / `['user-by-username', slug]` follow projections |
| save / unsave (wishlist) | Zustand `wishlist` + `['listing', id]` |

Rules: invalidate only what changed; focus refetches are silent (no skeleton
flash); skip-first-focus is the default; always use the canonical key — dead
keys are defects.

## Perceived performance & visual completion

Network success is not visual completion. Every surface defines its
**Visually Complete** condition:

| Surface | Visually Complete when |
|---|---|
| Home / Explore | header/search interactive; above-fold media decoded or matching skeletons; text/meta final geometry; video playing or stable poster; no masonry card jumps. |
| Search results | filter surface + applied chips stable; first result row decoded or parity-skeleton; result count final. |
| Product detail | hero media or exact-size skeleton visible; price/title/action dock stable; seller/trust area visible or parity-skeleton. |
| Profile | cover/avatar/identity stable; tabs interactive; first media row decoded or parity-skeleton. |
| Chat | recent messages visible; composer interactive; keyboard transition geometry stable. |
| Auction / co-own | countdown legible at a glance from a server timestamp; bid/trade dock stable with safe-area clearance. |

Report: time to first meaningful media, time to interactive ready, time to
visually complete, layout-shift count, image decode/failure rate. A screen
with fast API response but unstable visual completion is not flagship.

## Accessibility contract (WCAG 2.2 AA)

| SC | Operational rule |
|---|---|
| 2.4.11 Focus Not Obscured | Sticky header/tab bar never fully hides a focused element — `scroll-padding` is sized to real chrome. |
| 2.4.7 Focus Visible | 2px brand ring, ≥3:1 contrast, keyboard-only. |
| 2.5.7 Dragging Movements | Carousels/reorder expose button/keyboard alternatives. |
| 2.5.8 Target Size | ≥24×24px minimum; 44px for primary CTAs; dense chip rows keep spacing. |
| 3.2.6 Consistent Help | Help/chat entry in the same relative order across pages. |
| 3.3.1/3.3.3 Error Identification | Inline errors + focusable error summary linked to fields; `aria-invalid` + `aria-describedby` set. |
| 3.3.7 Redundant Entry | Never re-ask address/payment already given. |
| 3.3.8 Accessible Authentication | No CAPTCHA puzzles as sole auth; paste allowed in credential fields. |
| 4.1.3 Status Messages | Dynamic updates (outbid, result count, bag change) inside `aria-live="polite"` / `role="status"`. |
| 1.4.10 Reflow | Usable at 400% zoom; no horizontal document overflow at 390px. |

Plus the standing rules: every icon-only control has `aria-label`; state is
never colour-only; countdowns pair text with any colour treatment; semantic
HTML (`article`, `nav`, `main`, `h1-h3`, `button`, `form`); screen-reader
order follows visual order.

## Responsive contract

- Target frames: desktop 1440×900, mobile 390×844. Validate at 320px too.
- Fluid grids: 4→3→2 columns by breakpoint; two-column masonry stays two
  columns on phones.
- **No horizontal document overflow** — `documentElement.scrollWidth` must
  equal viewport width at 390px on every key surface. Full-bleed rails use
  `overflow-x` containment; fixed bars measure against the containing block.
- Prefer hiding or moving low-priority header actions over compressing them.
- Text scaling must not force price/title overlap; dominant values never
  shrink to fit.
- SSR/hydration: server-render countdown end-times and live-region containers
  so client mount causes no text mismatch or layout shift.

## Prototype smells (fix before claiming completion)

duplicate entrypoints for the same task · giant low-value hero · first
viewport with no useful action/content · grey disabled-looking inputs ·
clipped buttons · footer covering content · keyboard covering input · raw
localhost/network errors · repeated titles · too many uppercase labels ·
cards inside cards · random icon chips · "Coming soon" action rows · visual
clutter hiding user media · generic empty states · pill-soup shortcut rails ·
duplicated status copy · text-glyph icons (`▲▼↑↓★`) · decorative icon wells ·
glass panels on non-modal surfaces.

## Visual defect severity

- **P0 — ship blocker:** clipped CTA · keyboard covers input · duplicate
  entrypoint · fake/unsupported action exposed as working · raw backend error
  · broken media with no failure state · unreadable text (below WCAG AA or
  <11px without legal justification) · dock/tab bar overlaps scroll content ·
  crash on load or standard interaction · navigation dead-end.
- **P1 — flagship blocker:** prototype-looking layout · weak first viewport ·
  cards inside cards without justification · flat hierarchy · generic empty
  state · bad density · inconsistent tab/action grammar · missing loading or
  error state · trust placed after payment intent · seller profile that feels
  like a settings page · discovery grid with forced square crops.
- **P2 — polish gap:** minor spacing imbalance · weak motion · plain icon
  treatment · missing haptics · skeleton geometry mismatch · missing
  accessibility label · trimmable copy · ungated reduced-motion fallback.

Report format: `P0|P1|P2: <defect> — <file:line>`.

## Acceptance scorecard (score every edited screen, 0–4)

**Composition** — 0 broken/clipped · 1 assembled/generic · 2 functional but
plain · 3 polished and coherent · 4 authored flagship.
**Hierarchy** — 0 no focus · 1 same weight · 2 visible but cluttered · 3
clear first/second/third · 4 instantly understandable at thumbnail size.
**Density** — 0 unusable · 1 empty/cramped · 2 readable but inefficient · 3
compact and useful · 4 high-density without clutter.
**Interaction** — 0 broken · 1 unreliable · 2 works but basic · 3 native and
polished · 4 delightful but restrained.
**Truthfulness** — 0 fake · 1 misleading · 2 weak blockers · 3 truthful
states · 4 trust designed into the flow.
**State coverage** — 0 missing · 1 spinner-only · 2 basic · 3 screen-specific
· 4 states as designed as the populated view.

A screen is not flagship unless it scores ≥3 in every category and 4 in at
least two.

## Reference quality gates (fail conditions)

- **Pinterest gate** (discovery/boards/saved): fails on fabricated
  proportions, chrome competing with media, no search-mode transition, dead
  ends without save/similar continuation, skeleton/final geometry mismatch,
  layout shift on decode, fixed-interval module insertion, accent
  overwhelming photography.
- **eBay gate** (trust/checkout): fails when the guarantee block is missing
  at any funnel stage, totals aren't visible before payment, review step
  introduces new fees, or badge copy implies unevidenced guarantees.
- **Depop gate** (seller profile/closet): fails when the profile feels like a
  settings page, seller actions are inconsistent, listings are a flat dump
  with no curation, or cover/avatar editing leaks into Edit Profile.
- **Vinted/Vestiaire gate** (PDP/trust): fails when protection appears after
  payment intent, shipping/returns are buried, seller verification is missing
  from the first viewport, or sold/unavailable states are undesigned.
- **Whatnot gate** (auction/live): fails when the countdown isn't legible,
  bid/trade actions lack confirmation, docks overlap content or the home
  indicator, financial values aren't tabular, or empty order books have no
  next step.
- **Performance gate**: fails with no defined Visually Complete condition,
  above-fold layout shift, skeleton mismatch, or decorative animation
  blocking primary interaction.

## Human visual audit shot list

Capture before/after for user audit; never self-judge renders. Allowed
status: `Visual QA: pending user review`.

- **PDP:** first viewport (media+price+title+seller+trust) · swiped gallery ·
  sticky dock · protection section · sold state · image failure ·
  more-like-this rail.
- **Search:** landing · typing suggestions · results grid · applied chips ·
  zero-result recovery · skeleton parity.
- **Bag/checkout:** seller-grouped parcels · step rail · review totals
  (diffed against bag) · failure recovery.
- **Profile/storefront:** own + other-user first viewports · listings grid ·
  looks masonry · empty state.
- **Auction/co-own:** live card countdown · detail dock · ended state ·
  portfolio tabular values · empty order book.

## Agent workflow

Mandatory preflight before editing:

```bash
pwd && git rev-parse --show-toplevel && git remote -v
git branch --show-current && git rev-parse HEAD && git status --short
```

Screen research route: `route → page → container → state/hooks → services →
API → store → tests`. Answer before editing: what is the user trying to do;
what is the first viewport; what is duplicated; what feels generic; what is
the primary action; what backend capability is real; what should be removed,
moved, merged, or elevated.

Every UI pass names the reference logic applied (eBay/Depop/Pinterest/Vinted/
Vestiaire/Whatnot) and states the ThryftVerse differentiator the surface must
express functionally — social identity connected to commerce, visual
discovery continuing into Looks/collections, seller storefront control,
trustworthy transaction state, auction urgency, co-own market truth, or
messaging as a transaction surface. The differentiator must be data-backed;
never fake uniqueness with ornament.

## Final report standard

```text
Code-level completion:
Canvas mode:
Runtime token status:
Visually Complete condition:
Performance evidence:
Visual QA: pending user review | passed (user-confirmed)
Self-scorecard: Composition /4 · Hierarchy /4 · Density /4 ·
                Interaction /4 · Truthfulness /4 · State coverage /4
Defects: P0 · P1 · P2
Final status: COMPLETE — TARGET MET | IMPLEMENTED — USER VISUAL QA PENDING |
              PARTIAL — VISUAL TARGET NOT MET |
              PARTIAL — INTERACTION FAILURES REMAIN |
              PARTIAL — BACKEND CAPABILITY BLOCKER
```
