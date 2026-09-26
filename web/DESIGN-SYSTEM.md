# ThryftVerse Web — Design Contract

This file is the binding contract for every surface built in `web/`. It mirrors
the mobile app's design system 1:1 (`frontend/src/constants/colors.ts`,
`frontend/src/theme/designTokens.ts`, `frontend/src/theme/iconTokens.ts`).

## Product

ThryftVerse — flagship marketplace for pre-loved fashion. Reference quality bar:
Pinterest (masonry/media treatment), Vinted (commerce clarity), eBay (trust),
Instagram (social/stories/inbox). **Dark is the flagship theme**; light exists
via `[data-theme="light"]` CSS vars — never hardcode hex colors.

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
  chrome circles around icons. On media: `drop-scrim`/`glyph-scrim` for
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

Shadows: `shadow-subtle` `shadow-card` `shadow-floating` `shadow-modal` —
deliberate only, never routine.

Z-index: `z-elevated` `z-sticky` `z-dropdown` `z-modal` `z-toast` `z-overlay`.

Utilities: `pressable` (press feedback), `tnum`, `skeleton`, `clamp-1`,
`clamp-2`, `no-scrollbar`, `hairline`, `glyph-scrim`, `drop-scrim`, `img-fade`.

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
