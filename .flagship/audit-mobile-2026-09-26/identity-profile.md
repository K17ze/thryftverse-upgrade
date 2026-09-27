# Audit — IDENTITY/PROFILE/SOCIAL (mobile) — 2026-09-26

## Verdict
The department is architecturally strong — every screen is an orchestrator over domain hooks, state coverage (skeleton/error/empty/offline) is near-universal, review distribution, verification tiers, member-since, highlight rails and the moodboard editor's undo/batch/import/collab stack all meet flagship bar. The material gaps are web-parity: mobile's profile tab grammar diverges from the web's shop grammar (no Boards/Saved on profile, About instead of Items·Sold top tabs), neither profile nor closet carries the web's facet refinement, and collection membership resolves against the feed snapshot so items can silently vanish.

## Findings

### IDP-01 — Public profile lacks web's Items·Sold·Boards shop grammar [P1]
- Screens: screens/UserProfileScreen.tsx:264-269; screens/MyProfileScreen.tsx:227-235
- Evidence: Mobile public tabs are `Listings / Looks / About / Reviews` with a forsale/sold sub-segment inside Listings; MyProfile tabs are `Shop / Looks / About / Reviews`. No Boards tab exists on either profile — a visitor cannot see a member's moodboards/collections, and the owner cannot reach Saved from their own profile.
- Web parity: web/src/app/u/[username]/page.tsx:96-110 uses Items · Sold as top-level tabs plus Looks, Boards (when the member has them) and Reviews — no About. web/src/app/profile/page.tsx:55-61 adds Boards and Saved tabs for the owner.
- Competitor: Instagram/Depop profile tab grammar; Depop closet culture (boards/collections visible on profile).
- Root cause: mobile profile predates the boards/collections surfaces; About tab content (storefront, co-own, website) absorbed the slot where Boards belongs.
- Fix: restructure to shop grammar — Items · Sold as siblings (or keep the segment but add Boards), add a Boards tab merging moodboards + saved collections (lock for private, owner-only), add Saved on MyProfile, keep About content inside the About tab or fold into storefront section.
- Acceptance: public profile shows Items·Sold·Looks·Boards·Reviews tabs (conditional like web); owner profile shows Boards + Saved; a member's public collections are reachable from their profile.

### IDP-02 — Public-profile closet has zero refinement (no search, sort, facets) [P1]
- Screens: screens/UserProfileScreen.tsx:194-224 (renderItem), 370-387 (UserProfileList)
- Evidence: the Listings tab renders a bare grid + For sale/Sold segment. There is no search-this-closet, no sort, no brand/size/condition/category filters anywhere on the public profile or on MyProfile's Shop tab.
- Web parity: web ClosetListingsSection (web/src/components/closet/ClosetListingsSection.tsx:78-140+) is mounted on both /u/[username] and /profile with search, sort control, facet sheet (brands, sizes, conditions, categories with truthful counts via extractClosetFacets) and removable applied-filter chips.
- Competitor: brief's Vinted-weakness-exceeded bar — seller page must carry size/colour/condition refinement.
- Root cause: mobile UserProfileList has no toolbar slot; useUserProfileData has no filter pipeline.
- Fix: port the closet filter model into hooks/userprofile (facet extraction over the active segment, search box in the sticky rail, sort menu, removable chips).
- Acceptance: a 40-item closet can be searched, sorted and filtered by size/condition/brand with counts on the public profile.

### IDP-03 — Owner Closet facets are brand-only chips without counts [P1]
- Screens: screens/ClosetScreen.tsx:195-229; hooks/closet/useClosetData.ts:176-181; domain/closet.ts:168-175
- Evidence: `extractClosetBrands` returns ≤12 brand names (no counts); filter panel is a single-select brand row behind a toggle; no size/condition/category facets, no multi-select, no applied-filter chips. Search + sort + price-drop chip exist and are good.
- Web parity: web closetFilters.ts extracts brands/sizes/conditions/categories facets with per-value counts and a ClosetFilterSheet.
- Competitor: Vinted weakness to exceed (no filters); eBay facet-count grammar.
- Root cause: mobile facet model was only built for brand.
- Fix: extend domain/closet.ts with extractClosetFacets (sizes, conditions, categories, counts); add a facet sheet; show counts on brand chips; render applied-filter removable chips.
- Acceptance: Saved/Wishlist tabs expose multi-facet filtering with truthful counts; applied filters render as removable chips.

### IDP-04 — Collection membership resolves against feed snapshot — items silently invisible [P1]
- Screens: screens/CollectionDetailScreen.tsx:104-107 (listings.find intersection), 199-201; screens/ManageCollectionItemsScreen.tsx:49-62
- Evidence: `collectionItems = listings.filter(l => collection.itemIds.includes(l.id))`. The code itself comments the under-count ("resolved items under-count when a member listing isn't in the resident feed pages", :199-201) but still renders the incomplete grid — a board of 30 saved items may show 12. `availableToAdd` has the same defect: saved items not in feed pages can never be added. Saved/Wishlist tabs were fixed via fetchSavedList hydration (useClosetData.ts:61-73); collections were not.
- Web parity: web resolves `listingsForIds` against the full catalogue.
- Root cause: no per-id hydration path for collection members.
- Fix: hydrate collection item ids through the saved-list/detail query cache (or a /collections/:id/items endpoint), not the feed snapshot.
- Acceptance: every itemId renders regardless of feed pagination; manage-items lists all saved items.
- Also: CollectionDetailScreen.tsx:71 uses `useRoute<any>()` — untyped route, replace with RouteProp<RootStackParamList,'CollectionDetail'>.

### IDP-05 — InviteFriends channel buttons are dishonest affordances [P0]
- Screens: screens/InviteFriendsScreen.tsx:273-286
- Evidence: four buttons labelled WhatsApp / Instagram / Email / More each carry the channel's brand icon and `accessibilityLabel="Share via WhatsApp"` etc., but every one calls the same generic `handleShare` (system Share sheet). The labelled channel is never invoked — an accessibility user is told "Share via WhatsApp" and gets a generic sheet.
- Web parity: web/src/app/invite/page.tsx — verify; even if identical, dishonest labelling stands on its own.
- Competitor: honesty contract (AGENTS.md §11 — a control must do what it says).
- Root cause: single share handler mapped over a channel list.
- Fix: either deep-link per channel (whatsapp://send, mailto:, share-to-IG-stories) or collapse to one honest "Share invite" button.
- Acceptance: each labelled control performs the labelled action or is removed.

### IDP-06 — MoodboardHome masonry uses fake index-assigned aspect ratios [P2]
- Screens: screens/MoodboardHomeScreen.tsx:76 (`MASONRY_ASPECT_RATIOS = [1.2,1.0,1.35,0.95]`), 411-412 (ratio by `index % 4`)
- Evidence: public moodboard card heights are assigned by position, not media — the same board changes height when its index changes. Contrast GalleriaCollectionDetailScreen.tsx:63 which uses real `item.aspectRatio` with a true shortest-column assignment.
- Competitor: Pinterest — "masonry with real ratios".
- Fix: carry a coverAspectRatio (or first-item ratio) on the Moodboard contract and size tiles from it.
- Acceptance: tile heights derive from actual cover media.

### IDP-07 — Public moodboards open the full editor, not a read surface [P2]
- Screens: screens/MoodboardHomeScreen.tsx:361-367 — `handleMoodboardPress` navigates every card (own and public) to `MoodboardEditor`.
- Evidence: opening someone else's moodboard mounts the authoring chrome — undo/redo/publish/collaborators header icons, theme rail, source picker — gated only by `isOwner` inside sub-components. There is no moodboard viewer route.
- Web parity: web/src/app/moodboard/[id]/page.tsx renders a read surface for non-owners (scrim title, owner row, masonry) with edit mode only for the owner.
- Fix: add a Moodboard detail/viewer route (or render editor in read-only mode when !isOwner: header without edit actions, no picker panel, comments read-enabled).
- Acceptance: non-owner sees a magazine-style board view with owner row; owner sees edit affordances.

### IDP-08 — Galleria article lacks magazine grammar (no masthead/TOC/reader end-matter) [P2]
- Screens: screens/GalleriaEditorialScreen.tsx:128-188
- Evidence: the article is hero + EDITORIAL eyebrow + title + standfirst + byline + flat paragraphs. No issue/masthead context, no pull-quotes or inline media between paragraphs, no shoppable piece links, no next-issue/related-pieces footer — the reader dead-ends at the last paragraph.
- Web parity: web/src/app/galleria/page.tsx has cover-story hero, "The edit" collections band, issue TOC, featured pieces, and a GalleriaArchive back-issue rail; editorial opens as a reader sheet.
- Competitor: editorial magazine grammar (masthead → TOC → article → end-matter).
- Fix: add "In this issue" TOC row on the article (sibling editorials), a next-article footer, and shop-the-story tiles when the piece references assets.
- Acceptance: article footer exposes ≥1 related piece; issue navigation exists.

### IDP-09 — Connections search is local-only, no server search or recovery [P2]
- Screens: screens/ConnectionListScreen.tsx:71-79
- Evidence: `filteredItems` filters only the already-fetched pages; on a large account, searching for an unfetched user returns "No matches" — a false negative presented as truth. No server-side follower search, no "did you mean" recovery.
- Web parity: web /u/[username]/followers — check for server search; brief cites "did you mean" tolerant search as a web advantage.
- Fix: wire a `q=` param on the followers/following endpoints (or a dedicated search endpoint) with debounced querying; keep client filter as instant subset.
- Acceptance: searching beyond loaded pages returns real server matches; zero-result copy distinguishes "not loaded" from "doesn't exist".

### IDP-10 — EditProfile preview fabricates member-since fallback [P3]
- Screens: screens/EditProfileScreen.tsx:417 — `memberSince={user?.createdAt ? … : '2026'}` renders a hardcoded year in the live preview when createdAt is missing.
- Fix: hide the member-since line in the preview when the value is unknown (truthful UI).

## Non-findings (verified good)
- MyProfileScreen / UserProfileScreen: full state machines (skeleton ProfileSkeleton, error, unavailable, blocked states), collapsed header + sticky tab rail, highlight rail, ShopRail, reorder/pin with save flow, share passport.
- ReviewSummaryBlock (components/profile/ProfileReviews.tsx:29-82): dominant average + 5→1 distribution bars using count/total — matches web ReviewSummary.
- VerificationBadge, SellerStandardsBadges, ProfileTrustSignals exist and are tier-driven.
- UserProfile forsale/sold segment with honest counts; member-since on both profiles.
- MoodboardEditorScreen: undo/redo op-log, multi-select batch, media import tray with offline queue, sync status overlay with conflict-compare sheet, collaborators/comments/version history — exceeds brief.
- ClosetScreen: search-per-tab, sort menu, price-drop chip, identity strip, save-to-collection long-press picker, sync-error banner that preserves saved items.
- LookDetailScreen: single FlashList scroll surface, hydrated tags (live price/sold), 3-col related masonry with template rhythm, comments sheet, fullscreen viewer.
- ConnectionListScreen: skeleton rows, per-state empty copy, follow-button optimistic state — only the local-search caveat (IDP-09).
- InviteFriends: honest server-derived code/stats with unavailable states, no fabricated tier.
- OfflineBanner + refresh + error recovery present on every audited screen.
