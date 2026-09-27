# Profile & Social — Research Cross-Reference Audit
**Department:** profile (self/public), follows, boards/collections, saved, moodboards, outfits, looks, stories/posters
**Codebase:** `web/src` (app + components) · Mobile reference: `frontend/src`
**Date:** 2026-09-26

---

## 1. Reference Grammar (live research distilled)

### Instagram
- **Hierarchy:** avatar + name → bio (+1 link) → Posts/Followers/Following stat row → action row (Follow / Message / …) → **Story Highlights rail** (circles, custom covers, titles) → icon tabs (grid / reels / tagged) → dense 3-col grid (now 4:5-tall crops since the 2025 grid update). Verified badge sits inline with the name. Followers/following counts are tappable into list surfaces.
- **Curation grammar:** pin up to 3 posts on the grid; rearrange grid order; highlights are permanent curated stories surfaced on the profile itself — not buried in an archive.
- **Share:** "Share profile" → QR code + copy link sheet.

### Pinterest
- **Hierarchy:** identity → Created | Saved tabs. Saved = board grid with collage covers, pin counts, lock glyph on secret boards.
- **Board grammar:** covers are **pickable**; boards are sortable (**A–Z / Custom drag / Last saved to**); boards have **sections**; privacy = "secret" toggle (editable post-create); group boards via invited collaborators; merge/archive/delete in board settings.
- **Save-to-board picker:** on save, a sheet opens with **recent boards pinned at top**, a search field, and a **"Create board" row inline** — filing never dead-ends.
- Inside a board: drag-reorder pins + sections, move pins between boards, "More ideas" recommendations (owner-only).

### Depop
- **Shop = profile.** Avatar/shop pic, @shop name, bio (style + policies + socials), followers + **items sold** + star rating inline.
- **Tabs:** Items (active) / **Sold (visible to everyone — sold history with real prices is a trust feature)** / Reviews. Reviews are front-and-center; "Top Seller" badge is the trust apex.
- Social: Follow + Message; followers see new listings first.

### Vinted
- **Items-first profile:** the closet grid IS the page. Name + review count + stars + followers + last-active under the avatar. Tabs: Items / Reviews. Minimal chrome — identity serves the inventory.

### TikTok
- Avatar → @handle → Following / Followers / **Likes** stat row → bio → Edit profile / Share → pinned videos row (up to 3) → tabs: posts / liked (owner-only private tab) / saved (owner-only).

### eBay storefront
- Store name + logo, **% positive feedback**, **items sold**, followers, **Save Seller** (= follow), Share.
- **Shop by category** rail/sidebar, featured categories, **featured items** + newly listed rows, About + Feedback tabs.

### Cross-platform invariants
- Identity → stats (as links) → content tabs is the universal profile skeleton.
- Social proof must be honest: real sold counts, real review distributions, verified tiers, joined/active dates.
- Boards/collections: derived covers are standard, but cover-picking and reorder affordances are the mark of a mature surface.
- Share = native share sheet with clipboard fallback everywhere, not per-surface divergence.
- Story highlights live ON the profile; the archive is the management surface.

---

## 2. Our Implementation

### Profile hero — `components/profile/ProfileHero.tsx`
Cover band w/ legibility scrims (L226–247), 96px seam avatar (L255), username + `verified` icon + verification-tier badge + user badges (L263–293), linkified 200-char-truncated bio (L80–124), location · Active · Joined meta (L297–312), website link (L314–326), flat stats strip — items/for-sale + sold + followers + following + rating — where seams with destinations are buttons/links (L330–366). Actions: self = Edit / Share shop / collections / settings (L370–394); public = **Message primary** + Follow secondary + share + ReportLauncher (L396–422). Message creates the DM and deep-links the thread (L176–186).

### Tabs — `components/profile/ProfileTabs.tsx`
Sticky underline rail, 2px brand underline, quiet tnum counts, horizontal scroll, roving-tabindex keyboard nav, dual grammar (buttons vs route links).

### Self profile — `app/profile/page.tsx`
Tabs: Shop | Looks | Boards | Saved | About | Reviews (L75–82). Boards merges moodboards+collections w/ section headers only when both kinds exist (L84–98); private boards get lock meta. Saved tiles carry file-to-board + unsave affordances (L158–173); SaveToBoardSheet wired (L202–207).

### Public profile — `app/u/[username]/page.tsx`
Tabs: For sale | Sold | Looks* | Boards* | About | Reviews (*conditional on content, L124–139). Stat seams land on tabs + scroll (L109–114). Closet banner ≥10 items → `/collection/closet-<id>` (L153–178). Boards show only public boards (L59–62). Own-view redirects to `/profile` (L50–52).

### Closet/listings — `components/closet/ClosetListingsSection.tsx`, `components/profile/ClosetGrid.tsx`
Search-in-closet + sort + filter sheet (brand/size/condition/category) + brand chip rail + removable filter chips + result count (L136–241); owner tiles editable → `/sell?edit=` (L253–257); sticky toolbar (L141–144). ClosetTile: 3:4 media, price+brand, sold-scrim, hover inspect overlay w/ likes+price (L23–74). SavedTile: file + unsave corner actions, hover-gated on pointer devices (L81–138).

### Boards/collections
- `components/profile/BoardGrid.tsx` — 2×2 collage card, count chip, title + count/Private meta (L25–88).
- `app/collections/page.tsx` — hub: "Your closet" pseudo-board first + user collections + CuratedRail; New collection CTA (L119–192).
- `components/collections/CreateCollectionSheet.tsx` — name + public/private radio (L17–149). No cover picker, no description.
- `app/collection/[id]/page.tsx` — mosaic hero w/ scrim title + owner row + private pill (L399–461); edit mode: drag reorder + move buttons + multi-select batch remove + undo toast + add-from-saved sheet (L502–575); options sheet (manage/share/delete w/ confirm, L586–660). Private boards wall non-owners incl. 'me' fixture boards for real accounts (L249–263); private boards hide share (correct dead-end avoidance, L368).
- `components/collections/UserCollectionCard.tsx` — square collage card, lock glyph meta, updatedAt (L25–91).
- `components/profile/boardMedia.ts` — `listingCoverThumbs` derives covers from item images, pads w/ board.coverUri only at ≤1 item (L11–22).
- `components/profile/useOwnerBoards.ts` — one derivation merging fixture boards + overlay edits, hydration-gated (L17–37).

### Saved — `app/saved/page.tsx`
Segments: Favourites | Saved items | Boards | Searches w/ honest counts (L57–62); unsave-in-place, file-to-board (L77–99); saved searches = rows w/ alert switches + delete (L110–153); boards grid + "All collections" seam (L173–197).

### Save-to-board filing — `components/saved/SaveToBoardSheet.tsx`
Multi-toggle board list: thumb + title + count + lock + "moodboard" kind tag, stays open for multi-board filing, writes to both overlay stores + query cache (L93–161). **No inline create-board** (empty state routes to /collections); no recents, no search.

### Follows — `components/profile/ConnectionsView.tsx`, `FollowButton.tsx`
`/u/[username]/followers` + `/following` routes; tab rail w/ counts, search field, rows (avatar + verified + bio + FollowButton); own following reads persisted store, other pools are deterministic fixtures (L31–43). FollowButton: persisted `useFollows` toggle, signup-wall gate, hydration-settled (L28–53).

### Moodboards — `app/moodboard/[id]/page.tsx`
Cover-media header w/ inline rename, owner row, **decorative** collaborator avatars (L321–339), masonry read surface, owner edit mode: drag reorder + move buttons + multi-select + remove-undo + import sheet (L342–415); options: rename/manage/share (L427–479). No create, no themes, no canvas placement.

### Outfits — `app/outfits/**`, `components/outfits/**`
Grid of collage cards + New outfit CTA + delete confirm (outfits/page.tsx). Builder (`OutfitBuilder.tsx`): 5 fixed slots on a 4:5 flat-lay canvas (`OutfitCanvas.tsx` L31–47), tray = saved∪favourites w/ slot-filter chips (`OutfitTray.tsx` L33–36), undo/redo history (L58–85), confirmed clear (L247–270), name field, ≥2-item save gate. Detail (`outfits/[id]/page.tsx`): view canvas w/ PDP links + items grid + rename + share + delete. Slot inference by keyword rules (`outfitItems.ts` L42–96).

### Looks — `app/look/[id]/page.tsx`, `components/profile/LooksGrid.tsx`
Portrait grid tiles (title + like count). Detail: hero media (focal-point aware), creator row + follow, caption, like/save/share, "Shop the look" product grid (L238–251). Fixture-backed w/ live-mode hook (`useLook` L32–41).

### Posters/stories/highlights — `app/poster/**`, `components/poster/**`
Viewer (`poster/[id]`): stage + progress segments + tap zones (⅓/⅔) + hold-pause + arrow/Esc keys + shoppable hotspots + caption/lifecycle scrim + owner options (copy link / archive / delete) (L270–455). Archive: 9:16 grid, status/view/frame pills, segment filters, caption search, delete confirm, New highlight CTA. Create-highlight sheet: frame picker + name + **cover picker** (`CreateHighlightSheet.tsx` L154–193). Highlight viewer: same stage grammar minus author row.

---

## 3. Gap Table

| Reference grammar | Status | Evidence / notes |
|---|---|---|
| Identity → stats → content tabs hierarchy | **MATCHED** | `ProfileHero.tsx:224–431`; tabs `ProfileTabs.tsx` |
| Follower/following counts as linked stats | **MATCHED** | `ProfileHero.tsx:347–358` → `u/[username]/followers|following` |
| Message CTA on public profile | **MATCHED (DIVERGENT emphasis)** | `ProfileHero.tsx:400–409` — Message is primary, Follow secondary (IG inverts). Intentional commerce grammar per comment. |
| Verified badge + trust tiers | **MATCHED+** | `ProfileHero.tsx:267–292`; `profileViewModel.ts:32–47` (email/id/seller tiers + Top Seller badge) |
| Bio w/ links, truncation | **MATCHED** | `ProfileHero.tsx:53–124` (@mentions link, URLs external, 200-char more) |
| Sold history publicly visible (Depop/Vinted trust) | **MATCHED** | `u/[username]/page.tsx:116–118,126` — Sold tab + sold stat seam |
| Reviews front-and-center w/ distribution | **MATCHED** | `ReviewList.tsx:22–57` (avg + 5→1 bars), per-profile tab |
| Followers/following lists w/ search + follow buttons | **MATCHED** | `ConnectionsView.tsx:136–223` (fixture pools — demo caveat) |
| Board collage covers | **MATCHED** | `BoardGrid.tsx:33–65`, `UserCollectionCard.tsx:40–72` |
| Board privacy (lock, owner-only) | **MATCHED** | create `CreateCollectionSheet.tsx:17–37`; enforced `collection/[id]/page.tsx:249–263` |
| **Board cover picking** | **MISSING (collections) / PARTIAL** | Covers derive from item thumbs (`boardMedia.ts`); moodboards have fixture coverUri; highlights DO pick covers (`CreateHighlightSheet.tsx:154–193`). No collection cover picker. |
| **Board sort / reorder of boards grid** | **MISSING** | No A–Z / custom / last-saved sort on profile Boards tab or /saved Boards or /collections hub |
| **Board sections** (Pinterest) | **MISSING** | No section model in `COLLECTIONS`/`UserCollection` |
| **Collaboration on boards** | **MISSING (collections) / DECORATIVE (moodboards)** | `fixtures.ts:21–24` collaborator ids render a "Shared with" row (`moodboard/[id]/page.tsx:321–339`) but no invite/permission mechanics; mobile has `MoodboardCollaboratorSheet` |
| **Create board inside the save picker** | **MISSING** | `SaveToBoardSheet.tsx` has no create row; mobile `SaveToCollectionModal.tsx:299` has "Create New Collection" inline; Pinterest pins recents + create |
| **Recent boards in save picker** | **MISSING** | `SaveToBoardSheet.tsx:108–160` — flat list only |
| Item reorder inside board (drag + accessible) | **MATCHED** | `EditableMoodboardGrid.tsx:147–168` (move buttons) + HTML5 drag (L256–276); undo on remove |
| Add-to-board picker from saved | **MATCHED** | `CollectionImportSheet.tsx` / `MoodboardImportSheet` |
| **Privacy toggle on existing board** | **MISSING** | Privacy chosen at create only; options sheet has manage/share/delete, no visibility switch (Pinterest: "make secret" toggle) |
| **Archive/merge board** | **MISSING** | Delete only (`collection/[id]/page.tsx:281–291`) |
| Saved organization (faves/saved/searches) | **MATCHED+** | `saved/page.tsx` — searches w/ alert toggles exceed reference |
| **Highlights rail ON the profile** | **MISSING (DIVERGENT vs mobile)** | Mobile renders `PosterHighlightsRail` on `MyProfileScreen.tsx:317` and `UserProfileHeader.tsx:213`; web profile has no highlights surface — only `/poster/archive` |
| Highlight create (frames + cover + title) | **MATCHED** | `CreateHighlightSheet.tsx` + `/poster/archive` |
| Story viewer grammar (segments, tap, hold, keys) | **MATCHED+** | `poster/[id]/page.tsx:285–390` incl. hotspots + lifecycle meta |
| **Story viewer list / activity** | **MISSING** | Mobile `PosterStoryActivityScreen`; `viewCount` pills exist (`ArchiveCards.tsx:57`) but no viewer sheet |
| **Story reply / non-owner overflow** | **MISSING** | Non-owner gets share + close only (`poster/[id]/page.tsx:381–390`); no report on others' posters, no reply field (IG grammar) |
| Look detail (hero, creator, shop-the-look) | **MATCHED** | `look/[id]/page.tsx:146–251` |
| **Look comments / media carousel / hotspots / composer** | **MISSING** | Mobile has `LookCommentsSheet`, `LookMediaCarousel`, `LookHotspots`; web look is single-image, no comments, no creation flow |
| Outfit slot builder w/ undo/redo + tray | **MATCHED** | `OutfitBuilder.tsx` — faithful to mobile slot grammar |
| **Outfit score badge / suggestions** | **MISSING** | Mobile `OutfitBuilderScoreBadge`, `OutfitBuilderSuggestionCard` absent |
| **Freeform outfit canvas / publish-as-look / share-as-image** | **MISSING** | Canvas is fixed slots; outfits can't be published to Looks or exported |
| **Moodboard freeform canvas (pan/pinch/rotate, themes)** | **DIVERGENT** | Mobile `MoodboardCanvasItem` = positioned spatial canvas w/ `MoodboardThemeChip`; web is masonry + linear reorder only |
| **Moodboard comments / version history / sync** | **MISSING** | Mobile `MoodboardCommentsSheet`, `MoodboardVersionHistorySheet`, `MoodboardSyncOverlay` absent |
| **Moodboard creation** | **MISSING** | No create path — `useMoodboardEdits` has rename/setItems only; moodboards are fixture-seeded |
| Pinned/featured items on profile (TikTok pins, eBay featured, mobile shopRail) | **MISSING** | Mobile `shopRailItems` featured shop window (`UserProfileScreen.tsx:288`); web has none |
| Shop announcement / away mode / trader disclosure | **MISSING** | Mobile `UserProfileHeader` carries storefrontSummary + awayState + traderDisclosure; web has none |
| Share-sheet grammar (native share → clipboard) | **PARTIAL (inconsistent)** | `navigator.share` on profile + look (`ProfileHero.tsx:190`, `look/[id]:130`); **clipboard-only** on collection, moodboard, outfit, poster |
| Shop-by-category rail (eBay) | **PARTIAL** | `ClosetBrandRail` approximates; no category facet rail on the profile level |
| Block user in profile options | **PARTIAL** | `ReportLauncher` is report-only (`ProfileHero.tsx:417`); block exists in `settingsPrefs.ts:143` but isn't surfaced |
| Edit profile (cover, avatar, bio, links) | **MATCHED** | `profile/edit/page.tsx` — image pickers, username validation, overlay persist; no social links / display-name split / shop-policy editing |
| Self-profile sold seam → orders | **MISSING** | Mobile `onPressSold → MyOrders` (`MyProfileScreen.tsx`); web self hero has no sold stat |
| **Saved→board filing depth** | **PARTIAL** | Multi-toggle + thumbs + locks MATCHED; recents, search, inline-create MISSING |
| Public boards on profile (Pinterest-style) | **DIVERGENT (addition)** | Web shows Boards tab on `/u/[username]`; mobile public profile has none — deliberate discoverability win |

---

## 4. Top caveats

1. **Collection cover derivation is honest but not controllable.** `listingCoverThumbs` (`boardMedia.ts:11`) always derives from real item covers — good honesty — but a 2–3-item board renders a 2×2 grid with grey `bg-surface-raised` filler cells (`BoardGrid.tsx:46–48`), and there's no cover picker (Pinterest parity gap). Highlight covers are pickable; collection covers should be too.

2. **Board-level organization grammar is shallow.** Item reorder is strong (drag + accessible move + undo), but the board *set* can't be sorted or reordered (no A–Z/custom/last-saved — Pinterest's core profile-board grammar), no sections, no archive/merge, and privacy is create-time-only with no toggle on the options sheet.

3. **Saved→board picker lacks Pinterest's depth.** `SaveToBoardSheet` toggles membership well (stays open, live checks, private locks shown) but has no recent-boards pinning, no search, and — unlike mobile's `SaveToCollectionModal` — no inline "Create board" row; the empty state bounces the user to `/collections` instead of creating in place.

4. **Moodboards diverge fundamentally from the mobile product.** Web moodboard = cover + masonry + linear reorder. Mobile = freeform spatial canvas (drag/pinch/rotate, `MoodboardCanvasItem`), themes, real collaborators, comments, version history, sync. Web's collaborator row is decorative (`MOODBOARD_COLLABORATOR_IDS` fixtures) — a "Shared with @x" claim with no mechanics behind it. Also no moodboard creation path anywhere on web.

5. **Highlights exist but aren't on the profile.** The full pipeline (archive → create-highlight w/ cover pick → viewer) is built, yet neither `/profile` nor `/u/[username]` renders the rail — mobile puts `PosterHighlightsRail` on both. This is the single largest IG-grammar miss.

6. **Fixture-truth seams to watch:** followers/following lists are deterministic pseudo-pools (`ConnectionsView.tsx:31–43`); saved/board listings silently drop non-fixture ids (`listingsForIds`); col-* boards have no API surface (`collection/[id]/page.tsx:8` comment); review distribution computes over loaded reviews only; moodboards/collections edits are localStorage overlays — all honest-in-demo but need contracts before live data.

7. **Share grammar is inconsistent.** navigator.share → clipboard on profile/look; clipboard-only on collection/moodboard/outfit/poster. One share helper would unify it; QR-code share (IG grammar) is absent everywhere.

8. **Trust-signal gaps vs mobile/reference:** no featured/pinned shop rail (mobile `shopRailItems`, eBay featured), no shop announcement, no away/holiday banner, no trader disclosure, no response-time metric (Vinted), no sold seam on the self hero (mobile → MyOrders), no viewer list for stories, no look comments/carousel/hotspots, no block in the profile menu.
