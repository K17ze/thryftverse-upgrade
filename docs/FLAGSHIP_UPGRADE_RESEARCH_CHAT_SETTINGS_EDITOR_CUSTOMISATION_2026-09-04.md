# ThryftVerse Flagship Upgrade Research — Group Chat Management, Settings, Editor/Upload & Total Customisability

**Date:** 2026-09-04
**Type:** Cross-department research report (AGENTS.md §25 protocol, stages 1–4: codebase → reference → online → synthesis)
**External benchmarks:** WhatsApp (Aug 2026 group-chat upgrade drop + Jan 2026 member tags drop + baseline), Snapchat (Quick Cut, Director Mode Timeline Editor, Lens ecosystem), Instagram (2026 DMs, 3-mode Collage, Restyle AI), iOS 26 Settings conventions, Material 3 Expressive settings guidance
**Internal evidence base:** live code inspection of `backend/api/src/routes/chat.ts`, `frontend/src/screens/*Group*`, `frontend/src/screens/settings/`, `frontend/src/creator/*`, plus `frontend/CAPABILITY_REGISTRY.md`, `docs/flagship-research/06_CHAT_MESSAGING.md`, `docs/flagship-research/07_CREATOR_STUDIO_TOOLS.md`, `docs/flagship-research/10_SETTINGS_ACCOUNT.md`, `docs/FLAGSHIP_WEAKNESS_AUDIT_vs_COMPETITORS_2026-09-02.md`

---

## 0. Executive summary

1. **Group chat: the backend is deeper than expected — the missing layer is the WhatsApp 2026 interaction vocabulary, plus one truthfulness defect.** Roles, transfer-ownership, three server-enforced group-settings scopes, invite links, bots-in-groups all exist. What does not exist: polls, @all mentions, pinned *messages* (conversation pin exists), in-chat message search, star/save, disappearing messages, forwarding, scheduled messages, events, subgroup spin-offs, and member-approval join mode. Attachments are SURFACE-level (picker UI exists, handlers TODO). One fail-closed violation: `GroupPermissionsScreen` ships `FALLBACK_SETTINGS` client defaults — a §37.5 trust-signal lie that must render skeleton-until-server instead.

2. **Settings: breadth is genuinely good (11 sections, 30 destinations, search, theme picker); depth and truthfulness are the gap.** Doc-10's audit records live §11 violations (fabricated posture score in PrivacySettings, fabricated fallback "current" session in ActiveSessions, dev-only demo banner in DataPrivacy, `AccountSettingsScreen` redirect stub still navigator-registered) and an over-carded visual system across six sub-screens. Missing settings vs WhatsApp/iOS: chat defaults (wallpaper, auto-download, default disappearing timer), read-receipts and last-seen controls, cache/storage management, in-app language override, accent customisation.

3. **Editor/upload: the pipeline is flagship (resumable multipart uploads, stall detection, idempotent publication); the canvas and the export path are the gap.** Every authored-output capability is `export: 'hidden'` in the capability registry — users cannot export an edited render at all. The look canvas is grid/auto-layout only: no freeform pan/pinch/rotate (gesture-handler v2 old API, handlers exist but no gesture wiring), no snap guides, no floating z-order. Layout alternatives are already scored by `scoreLayout()` but never surfaced to the user. Snapchat's Quick Cut "select media → instant beat-synced render" has no equivalent here despite speed curves and transitions already being built.

4. **Customisability: exactly one lever ships (system/light/dark theme).** The 2026 standard is opinionated presets, not unbounded theming: accent themes, app-icon variants, per-chat identity, density control, reorderable home. ThryftVerse's token architecture (`colors.brand` single seam, MMKV persistence, ThemeContext) makes accent presets and density cheap; app-icon variants are a config-level task. Charter guardrail applies: customisation must ship as curated presets with live previews and automatic light/dark parity — never a free-colour theme engine (§4).

---

## 1. Department A — Group chat management & settings (vs WhatsApp)

### 1.1 What exists today (verified in code, not assumed)

**Backend — `backend/api/src/routes/chat.ts` (34+ endpoints):**

| Domain | Endpoints | Status |
|---|---|---|
| Core threads | DM, groups, conversations, messages CRUD, reactions, receipts, typing, read | PRODUCTION |
| Member governance | add member, remove member, `PATCH /members/:id/role` (promote/demote), `POST /transfer-ownership`, delete/leave | PRODUCTION |
| Group settings | `GET/PATCH /group-settings` — `edit_group_info_scope`, `send_messages_scope`, `add_members_scope` (each `admins`\|`everyone`), migration 234 with CHECK constraints | PRODUCTION |
| Growth | invite-links create/list/revoke, `POST /groups/join` | PRODUCTION |
| Thread utility | mute, archive, pin/unpin (conversation-level), mark-unread, accept/decline, quick-replies CRUD | PRODUCTION |
| Bots | list/deploy/undeploy/command per conversation | PRODUCTION |

**Frontend:** `GroupChatScreen`, `GroupChatInfoScreen` (members/media/settings tabs), `GroupMembersScreen`, `GroupPermissionsScreen`, `GroupBotManagementScreen`, `EditGroupScreen`, `CreateGroupChatScreen`. Realtime events (e.g. `chat.group.ownership_transferred`, identity changes) merge into the local store so headers/info stay current. Reply threading exists (`replyToMessageId` in `ApiMessagePayload`).

### 1.2 WhatsApp's 2026 group inventory (the benchmark)

Baseline (long-standing): owner/admin/member roles; group description + icon; invite links with admin approval mode; "only admins can send"; disappearing-messages timer; new-member history-visibility setting; polls; events; pinned messages *inside* the thread; starred messages; in-chat search; per-group wallpaper/theme.

2026 drops (Meta Newsroom, verified Aug 2026):
- **Jan 2026:** member tags (role labels visible in-thread), text stickers, event reminders.
- **Aug 2026:** polls upgraded (voting end-time lock, hide voter names, edit question after posting), **@all mentions**, **create new group chats from existing groups** (spin-off sub-chats "to dive deeper into a topic without cluttering the main chat"), group message history for new joiners.

### 1.3 Gap table — WhatsApp → ThryftVerse

| WhatsApp capability | ThryftVerse status | Evidence | Priority |
|---|---|---|---|
| Roles (owner/admin/member) | ✅ PRODUCTION | `PATCH /members/:id/role`, transfer-ownership | — |
| Only-admins-can-send | ✅ PRODUCTION | `send_messages_scope` (migration 234) | — |
| Who-can-edit-info / add-members | ✅ PRODUCTION | `edit_group_info_scope`, `add_members_scope` | — |
| Invite links + revoke | ✅ | invite-link routes | — |
| Member-approval join mode | ⚠️ PARTIAL — accept/decline exists for message requests; not a group join-approval setting | `requestStatus` on conversation | P2 |
| Pinned messages (in-thread) | ❌ MISSING — conversation pin ≠ message pin | `PATCH /pin` pins the conversation | **P1** |
| In-chat message search | ❌ MISSING | doc-06 MA5; no route | **P1** |
| Polls | ❌ MISSING | no poll table/route | **P1** (marketplace decisioning: group buys, drop votes) |
| @all mentions | ❌ MISSING | no mention parsing in composer | P2 |
| Events + reminders | ❌ MISSING | none | P2 |
| Star / saved messages | ❌ PLANNED | CAPABILITY_REGISTRY §2 | P2 |
| Disappearing messages | ❌ PLANNED | CAPABILITY_REGISTRY §2 | P2 |
| Forwarding | ❌ PLANNED | CAPABILITY_REGISTRY §2 | P2 |
| Document/location/contact attachments | ⚠️ SURFACE — picker UI exists, handlers TODO (P2-02) | CAPABILITY_REGISTRY §2 | P2 |
| Scheduled messages | ❌ PLANNED | CAPABILITY_REGISTRY §2 | P3 |
| New-member history visibility setting | ⚠️ PARTIAL — media tab exists; text-history scope not a setting | GroupChatInfoScreen | P2 |
| Sub-group spin-offs | ❌ MISSING | none | P3 (differentiate: spin-off inherits marketplace context) |
| Group wallpaper/theme | ⚠️ PARTIAL — group identity (name/avatar/cover) exists; no per-group colour/wallpaper | EditGroupScreen | P3 |
| Voice transcription | ❌ — voice is BETA | CAPABILITY_REGISTRY | P3 |

**What ThryftVerse already exceeds WhatsApp at** — preserve this while closing gaps: deployable AI agents/bots *inside* groups, marketplace context bar and offer-state messages in threads, server-side scam detection with warning cards, and money-adjacent coordination (co-own, syndicates). The upgrade thesis for this department is **"WhatsApp's interaction vocabulary + marketplace-native governance"**, not clone-parity.

### 1.4 Frontend quality gaps in group management

- `GroupChatScreen` is BETA (~800 lines) vs `ChatScreen` PRODUCTION (2,056) — doc-06's MA5 (shared hooks, reactions/replies/search parity, duplicate-modal removal) still stands.
- **Truthfulness (P0):** `GroupPermissionsScreen` renders `FALLBACK_SETTINGS` client defaults (`sendMessages: 'everyone', addMembers: 'admins'`). Under §37.5 fail-closed, a governance scope must render only from the server row — skeleton until loaded, no optimistic defaults that can contradict the server.
- Missing surfaces: per-member action sheet (message / promote / demote / remove with confirmation), join-request queue screen for approval mode, media grid jump-off, role badges in member list.

### 1.5 Recommended build order (Department A)

1. **P0 — Truthfulness:** remove `FALLBACK_SETTINGS`; skeleton-then-server for all group-settings renders; confirm every governance control is enforced server-side (route checks exist today — keep it that way for new features).
2. **P1 — High-value primitives:** pinned messages (column + endpoint + in-thread rail), in-chat search (pg_trgm/LIKE + composer-adjacent UI), polls (table + route + message-type + vote UI with lock/hide-voters from day one).
3. **P2 — Vocabulary:** @all (permission-aware, rate-limited), events, member-approval join mode, member action sheets, finish P2-02 attachment handlers (staged multi-select composition — the 2026 messaging pattern).
4. **P3 — Differentiators:** sub-group spin-offs inheriting marketplace context, group identity colour/wallpaper (feeds Department D), voice transcription.

---

## 2. Department B — Settings sub-screens: features, quality & missing settings

### 2.1 What exists today (verified)

`SettingsScreen` hub (989 lines, PRODUCTION): 11 ordered sections, 30 destinations in `settingsRouteMetadata.ts`, settings search with section-grouped results, theme picker (System/Light/Dark persisted via MMKV `theme.preference`). Sections: Profile · Account & security · Privacy · Selling · Notifications · Appearance · Data & storage · Support · About · Connected services · Developer.

### 2.2 Known defects (doc-10 audit — re-verify per screen before work)

These are §11 violations and rank P0 above any new feature:
- Fabricated "posture score" in `PrivacySettingsScreen` (`:29-30` also hydrates visibility from local state)
- Fabricated fallback "current" session in `ActiveSessionsScreen` (`:201-213`)
- Dev-only demo banner in `DataPrivacyScreen` (`:43`, `:62-64`) — toggles not persisted in production
- `effectiveKycVerified` frontend-computed in `VerificationScreen` (`:130`) / `VerificationStatusScreen` (`:90`) — must be backend-authoritative
- `AccountSettingsScreen` redirect stub still registered in the navigator (duplicate entrypoint)
- Over-carded visual system (hero cards on 6 sub-screens, `SettingsCard` `glass` variant) violating the §4 surface budget
- Delete path exists in both `AccountControlScreen` and `DeleteAccountScreen` (two destructive rituals)

### 2.3 Missing settings vs 2026 benchmarks (WhatsApp / iOS 26 / Instagram)

| Missing setting | Benchmark source | Priority |
|---|---|---|
| Chat defaults: default disappearing timer, chat wallpaper, media auto-download (Wi-Fi/cellular) | WhatsApp | P2 (after Department A primitives land) |
| Read-receipts toggle, last-seen/online visibility | WhatsApp | P2 |
| "Who can see my closet / activity" beyond current visibility posture | Instagram privacy | P2 |
| Cache-size management, network-usage view, "reset media cache" | WhatsApp storage | P2 |
| In-app language override row (i18n exists; no explicit setting) | iOS/Android convention | P3 |
| Accent/theme presets, app-icon variants (see Department D) | 2026 customisation norm | P1 for Department D |
| Per-conversation notification override surfaced from settings | WhatsApp custom notifications | P3 |
| Chat export (beyond GDPR data export) | WhatsApp | P3 |

### 2.4 Visual quality upgrade plan (per doc-10 §7, restated as the canonical sequence)

1. **Phase 1 — Truthfulness:** the six fixes above.
2. **Phase 2 — Destructive separation:** one delete ritual (`DeleteAccountScreen`), `SettingsDestructiveSection` at the hub bottom.
3. **Phase 3 — Grouped-list system:** introduce `SettingsGroup` (iOS grouped-list container: contiguous rounded surface, hairlines *between* rows only, first/last row exposed) and migrate hub + all sub-screens; flatten hero cards; remove glass variant. State-first rows: dynamic value subtitles showing the current state (iOS 26 "show current state before controls" — e.g. "Payout account · ••42").
4. **Phase 4 — Polish:** mechanism-explanation 2FA copy, "Reset to system defaults" in Accessibility, search grouping verification, Sign-in-with-Apple token revocation in the delete flow (App Store 5.1.1(v)).

---

## 3. Department C — Editor & upload (vs Snapchat / Instagram 2026)

### 3.1 What exists today (verified)

- **Look composer:** 11 deterministic auto-layouts (grid, editorial, hero, pair, scatter, stack, magazine, minimal, split-screen, polaroid, vertical-strip, mosaic), multi-select, layers sheet, Skia GPU effects, cutout, product tags, drafts with crash recovery.
- **Poster composer:** timeline, multi-page, transitions, keyframes, **speed curves (0.25x–4x, Aug 2026 Instagram-Edits parity)**, sticker browser with search + categories (polls/countdowns gated by capability registry), text, GIFs, full-bleed edit-surface geometry.
- **Camera:** capture-to-edit continuity (240ms crossfade with reduced-motion fallback), multi-snap staging tray with "Done (N)", 7-idle-action chrome discipline, gallery thumb → direct editor entry, single-capture direct-to-editor.
- **Upload pipeline (flagship-grade):** `MultipartUploader` — resumable S3 transport, real byte progress, MIME detection, stall detection with 'stalled' transition, process-kill rehydration to 'queued'; `mediaUploadQueue` + resize presets; publication gate with stable-document-id idempotency; moderation wiring on upload.
- **Icon grammar:** already migrated to `IconGrammar` bands (§38.6) — this department's icon discipline is done; do not regress it.

### 3.2 Snapchat 2026 benchmark (verified via Snap Newsroom)

- **Quick Cut (Dec 2025):** select multiple photos/clips from Memories, Camera Roll, *or someone else's shared Quick Cut* → instant rendered, **beat-synced** video preview — no timeline work. Auto-applies a track from the Sounds library synced to the selected clips; Lens carousel + Sounds pill for customisation. Thesis: *choose your media and go* — zero-timeline path for the casual majority.
- **Timeline Editor (Director Mode):** precision clip editing for the advanced path — the two-tier model (instant for everyone, timeline for creators) is the 2026 shape.
- **Lens ecosystem:** AI Clips (closed-prompt photo→5s video), Lens prefetch/warm-up APIs eliminating blank-spinner gaps.

### 3.3 Gaps (code-verified via FLAGSHIP_WEAKNESS_AUDIT 2026-09-02)

1. **Export is the single largest functional gap.** `photoCapture`, `imageFilter`, `videoEffect` are all `export: 'hidden'` in `frontend/src/creator/capabilities/registry.ts` — no authored render export exists (Skia frame → PNG/JPEG/MP4). Effects, cutouts and compositions cannot leave the app as rendered.
2. **No freeform manipulation.** No pan/pinch/rotate on layers (gesture-handler v2 imperative API; `useLookMultiSelect` has alignment handlers but no gesture wiring); no snap guides; no floating z-order menu (z-order hidden in a sheet). Instagram ships 3 modes (grid / freeform Photo-Sticker / AI Collage Cutout); ThryftVerse ships grid only.
3. **No instant-render path.** Speed curves, transitions and layouts all exist — but there is no Quick Cut equivalent (multi-select → auto-layout + track → instant preview → share).
4. **Scored-but-hidden layout intelligence.** `scoreLayout()` computes aspect/overlap/negative-space scores; alternatives are sorted but never presented. A horizontal "layouts" carousel with live thumbnails is one presentation layer away.
5. **Motion/haptics lack semantic intensity mapping** (§27.9 grammar not applied across creator interactions).
6. **AI features** need the real-model-or-honest-label gate in production (§11).

### 3.4 Recommended build order (Department C)

1. **P0 — Export pipeline:** unhide + implement authored export (Skia snapshot → existing `MultipartUploader` path → download/share). All state paths: progress, failure, retry, unknown-outcome (idempotency key).
2. **P1 — Freeform canvas:** gesture-handler v3 hook API + SharedValue transforms (translate/scale/rotate), snap guides (hairline + haptic at 16pt proximity), floating z-order menu.
3. **P1 — "Instant cut":** multi-select → auto-layout + synced track → instant preview → publish/share. Two-tier model mirroring Snapchat (instant default, timeline advanced).
4. **P2 — Layout alternatives carousel** (reuse `scoreLayout()`), haptic semantics map, drafts TTL alignment (Instagram's 7-day convention) — verify current draft retention policy first.

---

## 4. Department D — Total customisability

### 4.1 What exists today (verified)

Theme preference (System/Light/Dark) persisted via MMKV `theme.preference`, applied through a single `ThemeContext` seam over `colors.ts` (dual-source already consolidated in Phase 4); accessibility supplements (text size, reduced motion, contrast) that honestly represent their own state; Moodboard theme picker with live swatches; poster/look background customisation; `YourAlgorithmScreen` feed-signal control (genuinely rare and flagship-worthy); content preferences; notification categories.

### 4.2 The 2026 customisation landscape

Material You dynamic colour (Android 16); iOS 26 tinted icons; app-icon variants (Telegram/Snapchat/Steam-class apps ship icon switchers); per-chat wallpapers (WhatsApp); accent themes; density/compactness options; user-authored home layouts. The consensus across benchmark apps: **customisation ships as curated, brand-coherent presets with live previews — not as an unbounded theme engine.** Unbounded theming is how surfaces end up broken, unreviewable, and AI-slop-adjacent (§4).

### 4.3 ThryftVerse opportunities (opinionated preset model)

| Customisation | Mechanism | Cost | Priority |
|---|---|---|---|
| **Accent theme presets** (3–5 brand-coherent options) | Presets drive `colors.brand` + one accent token through ThemeContext — one seam, automatic light/dark parity, MMKV persistence exists | Low | **P1** |
| **Feed density** (comfortable/compact) | Maps onto the existing `screenRoleMatrix` composition system (DenseList vs regular) | Low–Medium | P2 |
| **App-icon variants** (3–4) | iOS alternate icons API + Android activity-alias, config-level | Low | P2 |
| **Per-conversation identity colour/wallpaper** | Ties into Department A group identity (§1.3 P3 row) — group colour renders in inbox rows + thread header | Medium | P2–P3 |
| **Home rail reorder/hide** (user-authored home) | Persists rail order; hide = removal, not fabrication | Medium | P3 |
| **Default sort/filter memory per surface** | MMKV per-surface preference | Low | P3 |

Guardrails (binding): every preset must pass light/dark geometry parity automatically (§30 theme checklist); live preview before commit; no free-form colour picker; no translucency additions in dark mode (§4 Light/dark parity); density change must not violate the 44pt target floor (§13).

---

## 5. Component flagship elevation (cross-cutting)

Primitives whose elevation lifts every department above at once:

| Primitive | Current state | Flagship target |
|---|---|---|
| Chat bubble | Static fill, no enter motion (doc-06 M2) | iMessage-style asymmetric radius, tail corner at `Radius.sm`, reaction spring pop, subtle enter fade; media IS the bubble (no frame) for attachments |
| Settings row | Mixed cards / over-carded heroes | `SettingsGroup` grouped list, native `Switch`, dynamic value subtitle, hairline-between-rows-only |
| Group info header | Flat rows | Identity hero: cover + avatar overlap, role chips (fail-closed from member roles) |
| Member row | List without per-member affordances | Role badge + action sheet; badge renders only from the server role row (§37.5) |
| Editor tool dock | Done (§38.9/38.10 — refined motion, 4+overflow) | Preserve; extend context-specific overflow only |
| Attachment picker | SURFACE — UI only | Staged multi-select composition (review before send — 2026 messaging pattern), progress → failure → retry per §15 |
| Empty/loading states | `FlagshipState` adopted on 18/165 screens | Skeleton-matched to final silhouette; canonical adoption continues |
| Press feedback | Mixed | §27.9 intensity-matched grammar (S0–S4), no universal scale/haptic |

---

## 6. Prioritised cross-department roadmap

| Phase | Department A (Group chat) | Department B (Settings) | Department C (Editor/Upload) | Department D (Customisability) |
|---|---|---|---|---|
| **0 — Truth** | Remove `FALLBACK_SETTINGS`; fail-closed group settings | Six §11 fixes (doc-10 Phase 1) | Honest AI labels in production | — |
| **1 — Depth** | Pinned messages, in-chat search, polls | Destructive separation; delete-ritual consolidation | **Export pipeline** (unhide + Skia→upload) | Accent theme presets |
| **2 — Vocabulary** | @all, events, approval-mode join, member sheets, attachments (P2-02) | `SettingsGroup` migration; chat-default settings block | Freeform canvas (GH v3 + snap guides); Instant Cut | Feed density; app-icon variants |
| **3 — Differentiate** | Sub-group spin-offs; group identity colour; voice transcription | Language override; storage management; per-conversation notify | Layout alternatives carousel; haptic semantics | Per-chat wallpaper; home rail reorder |

**Sequencing rationale:** Phase 0 is first because every §11/§37.5 violation is trust erosion that undermines all other work (charter §11; doc-06/10 precedent). Department C's export pipeline is the highest-value single functional gap in this report — authored output that cannot leave the app caps the entire creator department at BETA regardless of canvas quality. Accent presets are the cheapest Department D win with the widest visible surface.

---

## 7. Sources

**External (2026, verified):**
- Meta Newsroom — "We're Upgrading Your WhatsApp Group Chats" (Aug 4, 2026): poll end-time lock, hide voter names, editable poll questions, @all mentions, create chats from existing groups.
- Meta Newsroom — "Customize Your WhatsApp Group Chats With New Member Tags, Text Stickers, and Event Reminders" (Jan 7, 2026).
- Snap Newsroom — "Snapchat Introduces Quick Cut" (Dec 17, 2025): beat-synced multi-clip render, Sounds-library auto-sync, Lens carousel, Memories/Camera Roll/remix entry points; Timeline Editor in Director Mode.
- WhatsApp baseline capability set (help-centre documented behaviour, 2026): admin approval, disappearing timers, history visibility, pinned/starred messages, in-chat search, wallpapers.

**Internal (this report's claims are traceable):**
- `backend/api/src/routes/chat.ts` — full endpoint inventory listed in §1.1
- `backend/api/src/db/migrations/234_chat_group_settings.sql` — enforced scopes + CHECK constraints
- `frontend/src/services/chatApi.ts` — `ApiMessagePayload.replyToMessageId`, `GroupSettings` contract
- `frontend/src/screens/GroupPermissionsScreen.tsx:44-47` — `FALLBACK_SETTINGS` (§37.5 defect)
- `frontend/src/screens/settings/settingsRouteMetadata.ts` — 11 sections / 30 destinations
- `frontend/src/creator/capabilities/registry.ts` — `export: 'hidden'` on photoCapture / imageFilter / videoEffect
- `frontend/src/creator/look/autoCompose.ts` — `scoreLayout()` ranked-but-unpresented alternatives
- `frontend/src/creator/core/upload/MultipartUploader.ts` — resumable, stall-detecting, rehydrating upload system
- Prior internal research corpus: `docs/flagship-research/00–42` (esp. 06 Chat, 07 Creator, 10 Settings), `docs/FLAGSHIP_WEAKNESS_AUDIT_vs_COMPETITORS_2026-09-02.md`, `THRYFTVERSE_FLAGSHIP_PRODUCT_DEPTH_AUDIT_2026-09-01.md`, `frontend/CAPABILITY_REGISTRY.md`

---

*End of report. Next step per §25: pick the Phase-0 + Phase-1 slice per department and run the convergence loops (§31 visual + §37 live-signs) surface by surface — one surface at a time, native artifact required.*





