# Repair Report — Sep-21 Audit, Frontend Findings (P6)

**Scope:** S21-01, S21-02, S21-05, and the frontend (identity-binding) half of
S21-03 from `ThryftVerse-Validation-and-Upgrade-Report-2026-09-21.md`.

**Status: DONE** — all four findings fixed in source, typecheck clean, focused
suites green.

---

## S21-01 — Typography policy caps money/action accessibility (HIGH) — FIXED

- `frontend/src/theme/typography.v2.ts` — added a named `financial` tier at cap
  `2` to `MAX_FONT_SCALE` (alongside `utility` 1.3 / `heading` 1.5 / `content` 2).
  The tier is documented as the only valid cap for functional money and action
  content: checkout amounts, fee lines, totals, payment/action labels. The
  named-tier convention is preserved, so the P2-5 lint still passes.
- `frontend/src/components/checkout/CheckoutFooter.tsx` — all 16
  `maxFontSizeMultiplier` call sites migrated from `utility` (1.3) to
  `financial` (2.0): item/delivery/protection/verification/wallet rows, total,
  "View full breakdown" affordance, Apple/Google Pay labels, card-pay label.
  Adaptive layout instead of caps:
  - `walletBtn` fixed `height: 56` → `minHeight: 56` + vertical padding so the
    button grows with wrapped label text.
  - Summary rows get `gap` + `flexShrink`/`textAlign:'right'`; the total row
    wraps (`flexWrap`) so 200% text reflows instead of clipping.
  - New optional `onHeightChange` prop reports rendered footer height.
- `frontend/src/screens/CheckoutScreen.tsx` — scroll `paddingBottom` is now
  driven by the measured footer height (`footerHeight + Space.md`, legacy 300pt
  as pre-layout fallback) so the sticky column can never cover content when
  text scales.

## S21-02 — Editorial opens another teaser (MEDIUM) — FIXED

The data model already carries the full article (`GalleriaEditorial.content`,
sourced from the backend `body_content` column), so the preferred fix — a real
readable destination bound to the piece's ID — was implemented:

- **New** `frontend/src/screens/GalleriaEditorialScreen.tsx` — resolves
  `route.params.editorialId` against `fetchGalleriaEditorials()` (the only
  existing endpoint; a by-id resolver can be swapped in unchanged). Renders the
  hero, serif title, standfirst excerpt, byline (author/avatar/read time/date),
  and the real body paragraphs at `content`-tier scaling. States: skeleton
  loading frame, error+retry, and an honest "This story is no longer available"
  recovery that offers the Galleria as the next step.
- `frontend/src/navigation/types.ts` — `GalleriaEditorial: { editorialId }`
  added to `RootStackParamList` and `ROOT_STACK_ROUTES`.
- `frontend/src/navigation/AppNavigator.tsx` — route registered (root stack,
  lazy `getComponent`).
- `frontend/src/navigation/linking.ts` — deep link
  `galleria/editorials/:editorialId`.
- `frontend/src/screens/UnifiedDiscoveryScreen.tsx` — `handleEditorialPress`
  now receives the editorial and navigates with `{ editorialId }` instead of a
  generic Galleria push.
- `frontend/src/components/discovery/DiscoveryFeedView.tsx` — `onEditorialPress`
  signature now passes the `GalleriaEditorial`; a11y hint is "Read the full
  story" (no false article claim removed — it now is one).
- `frontend/src/components/galleria/GalleriaHeroEditorialCard.tsx` — optional
  `onPress`; renders a Pressable only when a reader destination is wired.
- `frontend/src/components/galleria/GalleriaEditorialListItem.tsx` — optional
  `onPress`; the truncated excerpt row is now a real reading action.
- `GalleriaListHeader` / `GalleriaListFooter` / `GalleriaScreen` — thread
  `onEditorialPress` → `navigate('GalleriaEditorial', { editorialId })`.
- `frontend/src/i18n/locales/en.json` — added `galleria.accessibility.editorialHint`
  ("Read the full story"); non-EN locales fall back to English per i18n config.

## S21-03 — delayed feedback writes lack account ownership (frontend half) — FIXED

- `frontend/src/services/recommendationFeedbackApi.ts`:
  - New `FeedbackActor` (`{ userId: string | null }`) optional param on
    `markItemNotInterested`, `showFewerLikeThis`, `undoItemNotInterested`.
    When supplied, writes run under the captured account only while the live
    session still belongs to it. On sign-out or account switch the write drops
    honestly: `{ persisted: false, failure: 'identity_changed' }` plus a
    `feed_feedback_dropped` metric via `trackRaw`. A guest-captured actor
    (`userId: null`) still resolves to `anonymous` — an anonymous choice is
    never retro-attributed to a newly signed-in account.
  - Note for the backend half: `undoItemNotInterested` documents that the
    `usual` direction will gain authoritative exclusion retraction server-side;
    today it remains best-effort compensation.
  - Token replay was deliberately rejected: `fetchJson`'s 401 path retries with
    the *live* session's refreshed token, which would silently re-attribute the
    write if a captured token had expired.
- `frontend/src/screens/UnifiedDiscoveryScreen.tsx`:
  - `FeedbackNotice` gains `actorUserId`, captured via `useStore.getState()` at
    hide/action time in `handleNotInterested` and `handleShowLess`.
  - `pendingHides` entries carry it implicitly (they store the notice); the
    4s timer job, the unmount flush, the retry path, and the raced undo
    compensation all pass `{ userId: notice.actorUserId }`.
  - `settleFeedbackNotice` clears the notice on `identity_changed` — account
    A's dropped-write outcome never renders on account B's screen.

## S21-05 — settings freshness (MEDIUM) — FIXED

- `frontend/src/hooks/settings/useSettingsScreenData.ts`:
  - Snapshot state is identity-tagged (`{ userId, balance, failed }`); the
    returned `walletBalance`/`walletBalanceFailed` are render-time scoped to
    `currentUser?.id` — account A's amount can never render as B's, even for
    the render between an identity change and effect cleanup.
  - A fetch epoch ref prevents an older account's late response from
    overwriting a newer account's snapshot.
  - `useFocusEffect` refetches on screen focus (5s debounce, matching the
    project's `useRefetchOnFocus` convention) — returning from a withdrawal or
    top-up refreshes in place without blanking the card.
  - Malformed-response validation preserved (non-finite/missing `availableGbp`
    → `failed`, never £0).

---

## Verification

- `cd frontend && npx tsc --noEmit` — clean.
- `s21FrontendRepairs.test.tsx` (new) — **17 tests**, all pass:
  financial tier ≥2 + checkout source assertions; actor binding
  (submit-under-captured / drop-on-switch / drop-on-sign-out / guest-honest /
  retry binding / no-actor fallback); identity-scoped settings snapshot,
  late-response guard, focus refetch, malformed validation; editorial screen
  body render, missing-piece recovery, error+retry.
- `discoveryFailureAttribution.test.tsx` — **16 tests** pass incl. 3 new:
  delayed write binds `{ userId: 'u1' }` after an in-window switch; unmount
  flush under captured identity; hero navigates with `editorialId`.
- Regression suites: `stateTruthfulnessRepairs` (23), `checkoutJourney` (2),
  `settingsPreferences`, `vq09cSettingsUnit`, `settings01InformationArchitecture`,
  `discoverySurfaces`, `i18n`, `structuralArchitecture`, `recommendationTypes`,
  `pkg09CommerceSurfaces`, `accessibilityAcceptance`, `visualRegressionPlan`,
  `e2eSmokePlan` — **398 tests pass** (2 pre-existing skips).

## Notes for follow-up

- Backend S21-03 half (other agent): exclusion retraction for `usual` in
  `backend/api/src/routes/recommendations.ts`; the client contract needs no
  change when it lands.
- `DiscoverScene` calls the feedback API without `actor` — correct as-is
  (immediate writes where the live session IS the actor).
- The editorial screen resolves via the list endpoint; a dedicated
  `GET /galleria/editorials/:id` would remove the fan-out cost on cold
  deep-links.
