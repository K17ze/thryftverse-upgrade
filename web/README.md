# ThryftVerse Web

The web frontend for ThryftVerse — the flagship marketplace for pre-loved
fashion. Replicates the mobile app's departments, surfaces, and design system
1:1 for the desktop + mobile web.

- **Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
  TanStack Query · Zustand · Zod
- **Design:** `DESIGN-SYSTEM.md` is the binding contract — dark-first luxury,
  editorial typography (Inter + Playfair), media-first surfaces.
- **References:** Pinterest (masonry/media), Vinted (commerce), eBay (trust),
  Instagram (social/inbox).

## Run

```bash
cd web
npm install
npm run dev        # http://localhost:3000
```

Data modes (`.env`):

```env
NEXT_PUBLIC_DATA_MODE=fixture            # default — bundled design dataset
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000  # backend/api base for live mode
```

### Live mode

Set `NEXT_PUBLIC_DATA_MODE=live` and `NEXT_PUBLIC_API_BASE_URL` to the shared
backend (`backend/api`, Fastify). All hooks then call the same
`/api/v1/*` endpoints as the mobile app — auth (`/auth/*`), listings, feed,
chat, notifications, orders, auctions, co-own, collections, seller-hub,
support, streaming, wallet, saved lists, visual search, uploads.

Auth session persists in `localStorage` (Bearer tokens, refresh-on-401). In
live mode sign-in/sign-up/sign-out on `/auth/*` are real — no demo identity.
Fixture mode keeps the bundled design dataset and session-local mutations.

Surfaces with no backend contract (syndicates, agents ledger, some seller-hub
sub-reports) stay fixture-mode even under `live` — the honest empty/error
state is shown where a route exists but returns nothing.

## Map

```
src/
  app/            routes — home, explore, search, item/[id], sell, inbox,
                  notifications, profile, u/[username], saved, orders,
                  checkout, bag, wallet, offers, settings, live, galleria,
                  categories, look/poster/moodboard viewers, static pages
  components/
    ui/           primitives — Icon (semantic Ionicons), Button, IconButton,
                  AppImage (CachedImage), Avatar, Chip, Badge, Sheet, Toast,
                  Skeleton, EmptyState
    layout/       AppShell, Header, MobileTabBar, Footer
    cards/        ProductTile (canonical listing tile)
    feed/         MasonryGrid (balanced-column Pinterest feed), FeedUnits,
                  StoryRail, SegmentedControl
    <dept>/       department components (pdp, inbox, profile, sell, …)
  lib/
    contracts/    domain types — mirrors frontend/src/domain + contracts
    api/          data client — fixture | live (backend/api routes)
    data/         fixture dataset (design mode source of truth)
    hooks/        TanStack Query hooks — the only data path for screens
    store/        zustand — wishlist, saved, bag, liked looks
    session/      session provider — user / guest states
    utils/        price/time formatting, media geometry & focal points
  theme/          tokens.ts — port of mobile designTokens + colors
```

## Design rules (short)

- Media is the color; flat canvas + hairlines; restraint over decoration.
- One icon family (`Icon`, io5), one chip, one button grammar, one radius grammar.
- 44px hit targets, 20–24px glyphs, `drop-scrim` on media — no chrome circles.
- `tnum` on all money. `pressable` on all interactive elements. No emojis.
- Every surface: loading skeleton + empty state + populated state.

See `DESIGN-SYSTEM.md` for the full contract.
