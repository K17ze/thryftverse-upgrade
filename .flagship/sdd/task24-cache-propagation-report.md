# Task 24 — Focus/Cache Propagation Report (P1, medium)

**Status:** DONE_WITH_CONCERNS (minor — see §6)
**tsc:** `tsc --noEmit -p tsconfig.json` → **0 `error TS` results** (clean compile)

---

## 1. Architecture findings

The app runs **two parallel data layers**:

- **React Query** (`PersistQueryClientProvider` + MMKV persister) — `src/platform/server/queryClient.ts`. Defaults: `staleTime: 5min`, `gcTime: 30min`, `refetchOnMount: true`, `refetchOnWindowFocus: false` (focusManager is wired to **AppState**, not screen focus, via `useMobileQueryLifecycle`), `networkMode: 'offlineFirst'`.
- **Zustand + BackendDataContext** — the legacy in-memory listing feed (`refreshListings()`), conversations store, wishlist, savedProducts, collections.

**Key structural gap:** React Navigation keeps pushed screens and tabs **mounted**. `refetchOnMount` never refires on back-navigation, and `refetchOnWindowFocus` only tracks app foreground/background — so *no* React Query data refetches on screen focus unless a screen explicitly opts in. A `useRefetchOnFocus` helper already existed (`src/hooks/useRefetchOnFocus.ts`, 5s debounce, fire-and-forget `refetchQueries`) but was only consumed by co-own screens.

Additionally, many surfaces bypass React Query entirely and use mount-only `useEffect` fetches into local state — those needed explicit `useFocusEffect` refetches.

---

## 2. Mutation → surface map

| Mutation | Site | Surfaces affected | Before | After |
|---|---|---|---|---|
| Create listing | `SellScreen` → `ListingSuccessScreen` | feed (store), listing detail, own profile listings | `refreshListings()` + detail invalidate | + `user.listings(me)` invalidate |
| Edit listing | `EditListingScreen` | same | same | + `user.listings(me)` invalidate |
| Delete / mark-sold / pause / reactivate | `ManageListingScreen` | same | `refreshListings()` + detail invalidate ×4 | + `user.listings(me)` invalidate ×4 |
| Purchase (create order + pay) | `CheckoutScreen` | listing detail (sold state), seller profile listings, feed, orders list | **none** | `listing.detail(itemId)` + `user.listings(sellerId)` invalidate + `refreshListings()` on settlement (succeeded *and* pending — order exists server-side either way) |
| Place bid / buy-now / cancel / pay / accept / second-chance | `useAuctionDetail` | auction detail, auction home, MyBids | `fetchDetail()` refresh + 10s/45s polling | unchanged (correct); MyBids now refetches on focus |
| Create auction | `CreateAuctionScreen` | auction home, listing detail, feed | detail + `['auctions','home']` invalidate + `refreshListings()` | unchanged (correct) |
| Make / counter offer | `MakeOfferScreen`, `MakeOfferSheet` | listing detail (offer count), inbox (conversation created), chat | `upsertConversation` → store | + `listing.detail(itemId)` invalidate on create/counter/reconciled-ack; inbox refetches on focus (safety net alongside realtime) |
| Accept / decline offer | `useConversationCommerce` | listing detail (committed/offer count), seller listings, feed, orders | none — local message state only | accept: `listing.detail(itemId)` + `user.listingsAll(sellerId)` invalidate + `refreshListings()` before Checkout nav; decline: `listing.detail(itemId)` invalidate |
| Send message | `useConversationMessages` | chat thread, inbox row | optimistic `appendToConversationStore` + server patch | unchanged (correct) |
| Follow / unfollow (profile) | `useFollowMutation` | target profile, target's followers list, viewer's following list/feed | only `user.profile(id)` invalidate | + `user.followers(id)` + `['user','following']` prefix invalidate + `mutationKey: ['social','follow',id]` (see below) |
| Follow / unfollow (item detail) | `useSellerFollow` | seller trust row, seller profile, followers, following | only `setQueryData` on `['seller','trust']` | + `user.profile(sellerId)` + `user.followers(sellerId)` + `['user','following']` invalidate + `mutationKey: ['social','follow',id]` — `useFollowingFeed` (direct-fetch, no RQ query) subscribes to the mutation cache for `['social','follow',*]` successes and reloads |
| Block / unblock | `useBlockMutation` | target profile, listings, looks | profile + listings + looks invalidate | unchanged (correct); feed removes blocked items on next `refreshListings` (≤55s poll) |
| Save / unsave (wishlist) | `useToggleWishlist` (RQ) **and** `useStore.toggleWishlist` (local-only!) | wishlist surfaces, heart state on cards/detail | **split-brain**: RQ path hit server; store path never did → server truth overwrote local hearts on next `useWishlist` fetch | `toggleWishlist` now mirrors into RQ `['wishlist']` cache and POSTs to `/users/me/wishlist` when authenticated; guest/offline keeps local-first semantics |
| Submit review | `WriteReviewScreen` | seller reviews list, seller profile rating, seller trust | none | + `user.reviews(sellerId)` + `user.profile(sellerId)` + `['seller','trust',sellerId]` invalidate |
| Ship / deliver order | `useOrderDetail`, `SellerFulfilmentScreen` | order detail, orders list | `refreshOrder()` + status polling | orders list now refetches on focus (MyOrdersScreen); listing surfaces unchanged (still sold — no over-invalidation) |
| Cancel order | `useOrderDetail`, `CheckoutScreen.cancelStaleOrder` | order detail, orders list, **listing detail (hold released)**, seller listings, feed | `refreshOrder()` only — listing stayed stale-reserved | + `listing.detail(listingId)` + `user.listingsAll(sellerId)` invalidate + `refreshListings()` on both cancel paths |
| Edit profile | `EditProfileScreen` | profile aggregate | `user.profile(id)` invalidate | unchanged (correct) |
| Publish look/poster | `useCreatorPublishWorkflow` | looks, profile, discover feed | all invalidated | unchanged (correct) |
| Create syndicate (co-own) | `CreateSyndicateScreen` | listing detail (paused), feed, issuer's co-own holdings | `['coown','assets']` invalidate — **dead key**: live co-own queries are `['coOwn', …]` (camelCase), so this never matched | fixed → `coOwn.holdings(issuerId)` invalidate; assets catalogue is direct-fetch + focus refetch |
| Co-own trades / order cancel | `TradeConfirmScreen`, `AssetDetailScreen`, `SyndicateOrderHistoryScreen` | asset, order book, holdings | `useInvalidateCoOwnAsset` wired | unchanged (correct) |
| Chat preferences | `useChatPreferences` | per-conversation prefs | `setQueryData` + focus invalidate | unchanged (correct) |
| Support messages / handoff / resolve / feedback | `useSupportConversation` | support conversation + messages | `setQueryData` + invalidate + polling | unchanged (correct) |

## 3. Focus-based refetch added (mount-only fetchers)

| Screen | Data | Change |
|---|---|---|
| `InboxScreen` | conversations + bots (Zustand store) | `loadConversations` converted to stable `useCallback`; mount `useEffect` replaced by `useFocusEffect` — refetches on every focus. Skeleton only renders when the list is empty, so refocus is visually silent. |
| `MyOrdersScreen` | orders list (local state) | `useFocusEffect` + latest-`fetchOrders` ref; skips initial focus (mount effect covers it); `isFetchingRef` guards overlap; silent (no skeleton/spinner). |
| `MyBidsScreen` | bids/watchlist (local state) | same ref + skip-first-focus pattern; `fetchItems` doesn't toggle `loading`, so silent. |
| `SellerHubScreen` | hub overview + orders + listings + daily breakdown + import batches | same ref + skip-first-focus pattern; `load()` doesn't toggle `isLoading`, so silent. |
| `ItemDetailScreen` | `listing.detail(itemId)` (RQ) | `useRefetchOnFocus` — listing price/status/offer-count fresh on return. `keepPreviousData` prevents flicker. |
| `UserProfileScreen` | `user.profile(userId)` (RQ aggregate) | `useRefetchOnFocus` — follower counts, viewer relationship, away state fresh on return. |
| `WalletScreen` | 1ZE position + fiat snapshot + seller balances (local state) | `useFocusEffect` + skip-first-focus; `loadBalance(true)` silent mode added — never flashes the full-screen skeleton over rendered balances; the returned cleanup discards in-flight results if the screen blurs mid-fetch. |
| `SellerAuctionCentreScreen` | seller's auctions list (local state) | `useFocusEffect` + skip-first-focus + silent `fetchAuctions(true)` — auctions cancelled/settled/created on other surfaces now appear on return. |
| `useFollowingFeed` (Home "Following" tab) | composed following feed (local state, N+1 fetch) | (a) subscribes to the RQ mutation cache for successful `['social','follow',*]` mutations → reloads (follow/unfollow lands in-feed immediately); (b) `useFocusEffect` + skip-first-focus + 120s stale gate — the N+1 composition is too heavy to run on every focus. |

Already correct (verified, unchanged): `HomeScreen` feed (55s polling + AppState-resume + focus refetch of posters/looks), `NotificationsScreen`, `AuctionHomeScreen`/`useAuctionHomeData`, `useOrderDetail` (focus + status-driven polling), `CheckoutScreen` (focus hydration), `MyListingsScreen`, `MyProfileScreen` looks rail, `useChatPreferences`, `PortfolioScreen`/`AssetDetailScreen` (co-own focus refetches).

## 4. Cache-consistency fixes

- **`src/platform/server/queryKeys.ts`** — added `wishlist.items` (`['wishlist']`) so the wishlist key is single-sourced.
- **`src/hooks/useWishlist.ts`** — `WISHLIST_QUERY_KEY` now references `queryKeys.wishlist.items`.
- **`src/store/useStore.ts`** — `toggleWishlist` now (a) updates the Zustand list synchronously (unchanged UI behaviour), (b) mirrors the result into the RQ `['wishlist']` cache so `useWishlist`/`useIsWishlisted` can't diverge, and (c) POSTs to `/users/me/wishlist` when `isAuthenticated`, replacing both caches with the server's authoritative `itemIds` on success. Guests/offline keep the pre-existing local-only semantics — a failed sync never reverts the heart.
- **`src/platform/server/clearUserCache.ts`** — `['wishlist']` now cancelled+removed on logout so a previous user's wishlist can't leak into the next session's RQ cache (the store's persisted wishlist was already user-agnostic legacy behaviour; RQ side now at least can't serve another user's server state).

## 5. Deliberate non-changes (avoided over-invalidation)

- **`useForYouFeed`** — mount-only by design; a focus refetch would reshuffle the ranked feed mid-browse. Left unchanged.
- **Auction RQ keys (`queryKeys.auction.*`)** — verified to have **zero consumers**; all auction surfaces are direct-fetch + focus refetch (`useAuctionHomeData`, `MyBidsScreen`, `SellerAuctionCentreScreen`, `useAuctionDetail`'s post-mutation `fetchDetail()`). No invalidation added — it would target dead keys.
- **`queryKeys.chat.*` / `closetQueryOptions` / `user.collections`** — verified to have no live consumers (chat is Zustand + realtime; collections are Zustand-backed). No invalidation added against dead keys.
- **Search / category / recommendations caches** — not invalidated on listing mutations: those queries are stale-while-revalidate by key and a sold listing disappearing from a 5-min-old search page is acceptable; invalidating every cached search would be the over-invalidation this task warns against.
- **`listingQueryOptions`/other factories in `useQueryOptions.ts` and `useServerData.ts`** — defined but have **no consumers**; no invalidation needed against those key shapes (`['listing', id]`, `['order', id]`).
- **`fetchJson`-level offer/bid reconciliation paths** — unchanged (idempotency + `reconcile()` already handle unknown outcomes).
- No visual/layout changes; no new features; no `components/coown/` files touched.

## 6. Concerns / residual gaps

1. **Wishlist toggle fires a fire-and-forget POST from the store.** For authenticated users this now reaches the server (previously it never did from most call sites — `ProductCard`, `HomeDiscoveryCard`, `BrowseScreen`, `useItemDetailActions`, `ClosetMediaMosaic` all used the local-only `toggleWishlist`). On failure the local toggle is kept rather than rolled back — intentional to preserve guest/offline behaviour, but it means the server may diverge until the next successful `useWishlist` fetch. A fuller fix (route every heart through `useToggleWishlist` with auth wall) is a larger refactor; flagged for the parent agent.
2. **`useFollowingFeed` staleness — largely closed.** The feed now reloads on any successful `['social','follow',*]` mutation (subscription to the RQ mutation cache — works because both `useFollowMutation` and `useSellerFollow` carry that `mutationKey`) and refetches on focus past a 120s stale gate. Residual: follows made on *another device* still need pull-to-refresh or the focus gate; realtime follow events don't exist. A true fix would be a `/feed/following` endpoint or an RQ-backed infinite query — out of scope.
3. **Block → feed propagation** relies on the 55s `refreshListings` poll (blocked sellers' items may persist in the visible feed up to ~55s). Backend filtering assumed; not changed.
4. **`useFocusEffect` in `InboxScreen`** refetches conversations+bots on every focus — matches the pattern already used by `NotificationsScreen`/`useAuctionHomeData`. If bot fetches prove wasteful, the bots call could be split into a mount-only effect later.
5. `queryKeys.user.listings` invalidations are exact-key (`user.listings(userId)` matches both `active`/`sold` variants via prefix `['user','listings',userId]` — verified: `queryKeys.user.listings(id)` returns `['user','listings',id,'all']`, a prefix of both status-filtered keys).
6. `platformRuntime.test.ts` key-shape assertions unaffected; `clearUserScopedQueryCache` test doesn't pin wishlist — no test changes needed.

## 7. Files changed

- `frontend/src/platform/server/queryKeys.ts` — added `wishlist.items` key
- `frontend/src/platform/server/useProfileSocialQueries.ts` — follow mutation invalidates followers + following
- `frontend/src/platform/server/clearUserCache.ts` — wishlist cleared on logout
- `frontend/src/platform/product/useListingQueries.ts` — `useSellerFollow` invalidates profile/followers/following
- `frontend/src/hooks/useWishlist.ts` — shared query key
- `frontend/src/store/useStore.ts` — `toggleWishlist` RQ mirror + authenticated server sync
- `frontend/src/screens/ManageListingScreen.tsx` — `user.listings` invalidation on delete/sold/pause/reactivate
- `frontend/src/screens/EditListingScreen.tsx` — `user.listings` invalidation on save
- `frontend/src/screens/ListingSuccessScreen.tsx` — `user.listings` invalidation on publish
- `frontend/src/screens/CheckoutScreen.tsx` — listing detail + seller listings invalidation + feed refresh on settlement
- `frontend/src/screens/MyOrdersScreen.tsx` — focus refetch
- `frontend/src/screens/MyBidsScreen.tsx` — focus refetch
- `frontend/src/screens/SellerHubScreen.tsx` — focus refetch
- `frontend/src/screens/InboxScreen.tsx` — focus refetch (mount effect → `useFocusEffect`)
- `frontend/src/screens/ItemDetailScreen.tsx` — `useRefetchOnFocus(listing.detail)`
- `frontend/src/screens/UserProfileScreen.tsx` — `useRefetchOnFocus(user.profile)`
- `frontend/src/screens/WriteReviewScreen.tsx` — reviews/profile/trust invalidation on submit
- `frontend/src/screens/MakeOfferScreen.tsx` — `listing.detail` invalidate on offer/counter create + reconciled-ack path
- `frontend/src/components/commerce/detail/MakeOfferSheet.tsx` — `listing.detail` invalidate on offer create (sheet doesn't unmount the detail surface)
- `frontend/src/hooks/chat/useConversationCommerce.ts` — accept-offer propagates like checkout settlement (`listing.detail` + `user.listingsAll(sellerId)` + `refreshListings()`); decline invalidates `listing.detail`
- `frontend/src/screens/CreateSyndicateScreen.tsx` — dead `['coown','assets']` key → `coOwn.holdings(issuerId)`
- `frontend/src/hooks/useOrderDetail.ts` — order cancel releases the listing: `listing.detail` + `user.listingsAll` + `refreshListings()`
- `frontend/src/screens/CheckoutScreen.tsx` — `cancelStaleOrder` releases the listing hold: same propagation
- `frontend/src/screens/WalletScreen.tsx` — silent focus refetch of balances
- `frontend/src/screens/SellerAuctionCentreScreen.tsx` — focus refetch of the seller's auctions
- `frontend/src/hooks/useFollowingFeed.ts` — mutation-cache subscription for `['social','follow',*]` + age-gated (120s) focus refetch
- `frontend/src/platform/server/useProfileSocialQueries.ts` — `mutationKey: ['social','follow',userId]`
- `frontend/src/platform/product/useListingQueries.ts` — `mutationKey: ['social','follow',sellerId]`
