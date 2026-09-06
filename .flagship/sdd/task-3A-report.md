# Task 3A Report — Re-author the listing media surface (de-bot the design language)

Date: 2026-02-15 · Branch: `feat/product-detail-contract-media-device-closure` · HEAD: `03153b23`

## Status: DONE_WITH_CONCERNS

## Scope delivered

- **`frontend/src/components/listing/ListingMediaStudio.tsx`** — 1196 → 855 lines (−341)
- **`frontend/src/components/SortablePhotoStrip.tsx`** — 291 → 257 lines (−34)
- Visual + composition re-author only. Props contract, crop-sheet integration, FocalImage
  usage, VideoPosterThumb poster logic, upload/queue code, drag/reorder logic, haptics and
  reduced-motion behavior all preserved. CreatorCropSheet / CreatorAssetPicker untouched.

## Chrome removed (exact list)

**Cover:**
- "COVER" badge pill (top-left) — deleted; the large edge-to-edge object above the rail *is* the cover statement
- "VIDEO" indicator pill + videocam glyph — deleted; cover video renders as media, thumbs carry the play glyph
- "n / 10" floating count badge — deleted; count moved inline into the action row ("Add more · 3/10")
- 32pt grey overlay circles on remove + edit → transparent 44pt targets (`Control.hit`) with 20pt glyphs, legible via `mediaOverlayShadow` text shadow (same grammar as `MediaStage.controlIcon`); remove top-right, edit bottom-right
- Full-surface pulsing upload overlay (`withRepeat` opacity pulse) — deleted; replaced by a 2pt full-width determinate bottom bar chasing real byte progress + one meta status label ("Preparing…" / "Uploading · 47%") bottom-left; no pulse in any motion mode
- Red failed pill with warning + "Upload failed" + duplicate inner Retry button → full-surface quiet scrim (mediaOverlayScrim) with warning glyph + "Retry"; whole cover is the retry target
- Cancelled pill → full-surface dim + "Cancelled" (shared with thumb grammar)

**Thumbs (renderThumbItem):**
- "COVER" pill — deleted (position is the label)
- Number badge (brand circle, bottom-left) — deleted
- "Cover" pill + star (set-cover affordance) — deleted; `onSetCover` prop retained in the interface for host compatibility, documented as positional
- 20pt red remove circle → transparent 44pt target, 16pt glyph + text shadow, hitSlop no longer needed
- "Tap to retry" + duplicate Retry pill → single whole-thumb retry target: warning glyph + "Retry"
- Videocam corner badge on the poster-fallback tile — deleted (duplicated the centered glyph)
- Hardcoded `borderWidth: 2` failed emphasis → `Stroke.emphasis`; base thumb border `Stroke.standard`

**SortablePhotoStrip internals (non-renderItem path):**
- "COVER" bottom bar + text — deleted
- Videocam rounded-square badge → compact play glyph in a `Radius.full` scrim circle (same grammar as the poster thumbs)
- 15pt drop shadow on every item (incl. the drag `shadowOpacity` animation) — deleted; drag feedback remains scale-only
- Explanatory hint "Drag to reorder. First media item is the cover." — deleted (explanatory copy; a11y labels on items already announce position/cover)
- Add-button hardcoded `borderWidth: 2` → `Stroke.standard`; radius aligned to `Radius.lg`; behavior untouched (dormant in this surface — `showAddButton={false}`)
- Dead "helper" comment removed; `Text`/`Typography`/`TypographyV2`/`SharedValue` imports dropped (no text remains in the strip)

**Empty state (re-authored, not deleted):**
- Dashed border scaffold, 72pt brand icon circle, and all three copy blocks ("Start with a photo" / "Tap to upload…" / duplicate "Well-lit photos…") — deleted
- New: full-bleed cover-height tap target in `colors.surfaceAlt`, `Radius.lg`, centered: camera glyph 24pt `textMuted` → "Add your first photo" (bodyStrong, textPrimary) → "Up to 10 photos" (meta, textMuted). Whole surface opens the library.
- Below: one quiet row — "Take photo" as a text button (44pt target, 16pt glyph, no pill, no border). Nothing else.

**Resulting grammar:** two radius sizes in the viewport (`Radius.lg` media/thumbs/empty surface + `Radius.full` play-glyph circle only), two strokes (`Stroke.standard` resting, `Stroke.emphasis` failed), three type sizes (bodyStrong / body / meta), zero decorative shadows, zero pills on media.

## Thumbnail test (25% zoom self-critique)

The surface now reads as **one dominant media object** (full-bleed 4:5 cover, zero chrome except corner glyphs and a 2pt progress hairline) + **a quiet rail** (uniform 80pt thumbs, hairline stroke, no badges) + **a quiet action row** (one text line with the count inline). The old render failed the test: at 25% it was a grey cover card wearing four pills (COVER / VIDEO / n÷10 / failed-pill) above a rail of numbered, badged, shadowed tiles above a pill-button row. Remaining deliberate asymmetry: the cover is the only full-height object; the rail and action row recede to meta/body scale. No further chrome removal candidates identified — every surviving element is either the media, a state, or a 44pt control.

## Verification

1. `npm run typecheck` — my two files introduce **0 errors**. The run reports 2 pre-existing
   errors in `src/screens/SellerHubScreen.tsx` (`fetchSellerHubOverview` / `SellerHubTask`) —
   **proven pre-existing**: with my two files stash-reverted to HEAD the identical errors
   appear; that screen does not import either of my files. (Likely belongs to the parallel
   seller-hub workstream visible in the shared working tree.)
2. Scoped eslint on both touched files — **0 errors, 33 warnings**, all pre-existing classes
   (i18next literal-string on copy/prop literals, `has-accessibility-hint` on Pressables,
   unused drag-callback args in the strip). The former `max-lines` monolith warning is gone —
   the file now fits the budget.
3. `npm test` (vitest) — **7 failed | 1730 passed | 2 skipped**, exactly the stated baseline
   (`groupChatInfoParity` ×6, `pricingDisplayModes` snapshot ×1). No test touches either file.

## Concerns

1. **Shared working tree with a live parallel agent.** During verification, a `git stash
   push/pop` (used only to prove the typecheck baseline) collided with concurrent edits from
   another agent (stash entries for seller-hub WIP exist; my pop aborted cleanly and the tree
   was left untouched — my changes are intact and uncommitted). No further git state commands
   were run. The orchestrator should be aware two agents are mutating this checkout
   simultaneously; the SellerHubScreen typecheck errors are theirs, not this task's.
2. **`onSetCover` is now a dormant prop.** Per the brief, the per-thumb "Cover" pill + star is
   deleted (position is the label). The prop remains in the interface so hosts compile
   unchanged, but it is no longer called. If audit 04 P0's "explicit set-as-cover affordance"
   is re-required, it should return as a long-press/accessibility action, not a pill.
3. **Untested on device.** Pure visual/composition change verified by typecheck/lint/suite
   only; first render on device should confirm the transparent 44pt glyph targets read well
   over bright imagery (text shadow tuned to `mediaOverlayShadow`, same values as
   MediaStage/CommerceMediaStage).
4. **Camera action stays visible at maxCount.** The brief specifies only "the Add-more action
   disappears" at max, so "Take photo" remains in the row; hosts already guard the picker.
   Flagging in case the reviewer wants it hidden too.

---

# Fix Round 2 — Final adversarial-review blockers

Date: 2026-02-15 · Same branch/HEAD baseline · All changes uncommitted

## BLOCKER 1 (HIGH) — focal-only transforms no longer reset upload state

**`frontend/src/hooks/sell/useSellScreenActions.ts`** — `handleTransformItem` previously
always spread `{ uri, publicUrl: undefined, status: 'draft' }`, so SellScreen's
`handleTransformItemWithFocal` wrapper calling it with the *same* URI for a focal-only edit
re-queued an already-uploaded cover and destroyed its canonical `publicUrl`. Now mirrors
EditListingScreen's `handleTransformItem`: `uriChanged = transformedUri !== m.uri`; only a
real URI replacement clears `publicUrl` / sets `status: 'draft'`. Focal-only edits keep
uploaded state; the `photos` sync is preserved (same in-updater pattern as `handleReorderIds`).

## BLOCKER 2 (HIGH) — AppIcon migration (icon hygiene)

Every raw `<Ionicons>` in both media components replaced with the repo's `AppIcon`
(`components/common/AppIcon.tsx`); `@expo/vector-icons` imports removed from both files.

- **`ListingMediaStudio.tsx`** — 13 instances migrated: empty-state camera (`name="camera"`),
  cover remove (`close`), cover edit (`edit`), uploaded check (`checkmark-circle`,
  `color="success"`), failed warning + cancelled ban (cover + thumb, `variant="filled"` to
  preserve the filled glyphs the semantic registry would otherwise map to outline), thumb
  remove (`close`), poster-fallback videocam + play glyphs (`variant="filled"`), action-row
  `images`/`camera`. Colors are token names (`textMuted`, `scrimTextPrimary`, `success`) —
  all three are `ThemeColors` keys, so **zero instances needed to stay on Ionicons**.
  `aria-hidden` → `accessible={false}` (AppIcon's decorative idiom, same as SellScreen).
  `UploadedCheckBadge` dropped its now-unused `colors` prop; `VideoPosterThumb` dropped its
  `useAppTheme()` call. Text-shadow legibility styles (`mediaGlyph`, `emptyGlyph`) pass
  through AppIcon's `style` (inherited to the glyph).
- **`SortablePhotoStrip.tsx`** — 2 instances: add-button glyph (`name="add"`, passes through
  the registry unchanged) and the play glyph (`variant="filled"` → `play`, with AppIcon's
  optical-centre compensation for the play triangle as a bonus).
- Note: AppIcon's semantic registry maps `warning`/`ban`/`play`/`videocam` to their
  `-outline` variants under the default outline variant; `variant="filled"` was used on
  those four so the rendered glyphs are byte-identical to the previous Ionicons render.
  No instance required a color AppIcon cannot express — no Ionicons remain in either file.

## BLOCKER 3 (MEDIUM) — dead set-cover API removed

- `ListingMediaStudioProps.onSetCover` — removed from the interface (was already dormant).
- `SellScreen.tsx` — `handleSetCover` removed from the actions destructure and
  `onSetCover={...}` removed from the studio usage.
- `EditListingScreen.tsx` — local `handleSetCover` definition and `onSetCover` prop removed.
- `useSellScreenActions.ts` — `handleSetCover` implementation, return entry, and
  `SellScreenActionsResult` type entry removed.
- `SortablePhotoStrip` cover-pill/number-badge internals: verified **zero remaining
  references** — they were already fully deleted in round 1 (nothing left to remove; the
  component's only remaining internals are `container`/`itemWrap`/`image`/`addBtn`/`playBadge`,
  all live).

## MEDIUM fixes

- **`SellScreen.tsx:46`** — `useRef<any>(null)` → `useRef<View>(null)` (View already imported;
  `useA11yAudit` accepts `RefObject<any>`).
- **`SellScreen.tsx:358`** — `prompt.icon as any` → `prompt.icon`. AppIcon's `name` accepts
  `SemanticIconName | IoniconsGlyphName` where `IoniconsGlyphName = string`, so the
  `ContextualPhotoPrompt.icon: string` field is directly assignable — no cast, and no change
  needed to `utils/sellScreenLogic.ts` (outside my file ownership).
- **`EditListingScreen.tsx` coverUri** — removed the final `|| coverItem.uri` fallback; when
  no canonical remote URL exists for the cover the save now throws into the existing
  `catch` (`failed_recoverable` + `updateFailed` error/toast) instead of PATCHing a local
  `file://` URI to the API. `patchListingOnApi` accepts `imageUrl?: string`, so the
  post-guard `string | undefined` typechecks.
- **`EditListingScreen.tsx:572`** — `await queue.addAssets(assets)` before `await queue.run()`
  (`addAssets` is `async` — without the await, `run()` could race the queue's storage
  hydration). `useSellScreenData.ts` checked: it does **not** call `addAssets` (it only owns
  the queue ref/subscription), so no change was applicable there.

## Verification (fix round 2)

1. `npm run typecheck` — **0 errors** (whole project; the SellerHubScreen errors from round 1
   were fixed by the other workstream mid-round, and a transient `SellerExecutiveHero` error
   in their file cleared by the final run).
2. Scoped eslint on all five touched files — **0 errors** (warnings are the pre-existing
   i18next literal-string / a11y-hint / max-lines classes; AppIcon token-name props like
   `color="scrimTextPrimary"` land in the same literal-string class as SellScreen's existing
   `color="brand"` usages).
3. `npm test` — **7 failed | 1730 passed | 2 skipped**, exactly the baseline
   (`groupChatInfoParity` ×6 + `pricingDisplayModes` snapshot ×1; the
   `sellerAnalyticsAndHubUpgrade` failure from round 1 now passes — other workstream's fix).
4. Repo-wide grep: zero remaining `Ionicons` / `onSetCover` / `handleSetCover` / `as any` /
   `useRef<any>` in the five owned files (remaining matches are in other agents' files:
   CreatorAssetPicker, MyProfileScreen, etc.).

## Fix-round concerns

1. **Concurrent workstream observed again**: `SellerExecutiveHero.tsx` transiently failed
   typecheck (`Control` not found) during this round and was fixed by the other agent before
   my final run — final typecheck is clean, but the tree is still shared.
2. `handleTransformItem` keeps the pre-existing pattern of calling `setPhotos` inside the
   `setMediaDraftItems` updater (same as `handleReorderIds`); a follow-up could lift the
   photos sync into a derived value, but that is beyond this fix round's scope.
3. The EditListingScreen cover guard reuses `listing.edit.mediaFailedRetry` as the thrown
   message; the user-visible copy comes from the existing catch path
   (`listing.edit.updateFailed`). If a distinct "cover upload missing" message is wanted, it
   is a one-line i18n addition.

