# 13 — Moodboards and Collaborative Creative Canvases

**Engineering decision document**
**Research cut-off:** 25 August 2026
**Audited baseline:** `f82f74a54be79a1721017380ddd5472d856f1679`
**Decision owners:** Creative Systems / Mobile Platform / Marketplace API / Identity + Realtime
**Status:** **P1 — durable single-owner canvas; collaboration, convergence and recovery absent**

---

## 1. Executive verdict

The backlog statement that moodboards are memory-only is **false** on this baseline. The production path persists boards and items in PostgreSQL, `MOODBOARD_DEMO_MODE` is hard-coded `false` (`moodboardApi.ts:98`), and the client intentionally propagates API failures. Replacing the existing system would discard a working data path.

The real deficit is architectural. A moodboard is owner-only CRUD over mutable rows. The screen can pan, pinch, rotate, layer, add and delete items, but the server has no revision token, operation identity, transaction spanning item mutation plus board metadata, membership model, realtime channel, durable offline outbox, comments, version history or publication snapshot. It is a competent private collage editor, not a collaborative creative system.

Three correctness defects compound the architectural gap:

1. **Public-only list bug:** `GET /moodboards` always filters `WHERE m.visibility = 'public'` (`moodboards.ts:158`), so `fetchMoodboards()` — which claims to fetch "the current user's moodboards" (`moodboardApi.ts:187`) — actually returns public boards, not the user's private owned boards. This is a contract violation.
2. **Non-transactional item + metadata writes:** Item writes and board metadata updates are separate `db.query` calls (`moodboards.ts:533–565`, `596–605`, `655–664`). A crash between statements creates inconsistent metadata with no recovery.
3. **Silent optimistic divergence:** `handlePositionCommit` (`MoodboardEditorScreen.tsx:578–601`) applies an optimistic local update, then calls `updateItemPosition`; on failure it only does `console.warn('Position update failed:', error)` (line 598). The UI and server are now divergent with no user-visible recovery. Theme update is fire-and-forget with the same `console.warn` pattern (line 724).

### 1.1 Maturity scorecard

| Dimension | Score / 5 | Evidence-backed judgement |
|---|---:|---|
| Persistence | 3.5 | Board/item rows and real API mutations exist; destructive delete is immediate and no history exists |
| Canvas interaction | 3.0 | Native pan/pinch/rotate and reduced-motion settle exist; accessibility remains pointer-centric |
| Authorization | 2.5 | Private reads fail closed and writes require owner/admin; no role/capability layer |
| Collaboration | 0.5 | No member, invite, presence, comment, realtime or conflict contracts |
| Offline/recovery | 0.5 | Honest offline warning (`MoodboardEditorScreen.tsx:813`), but no durable local mutation log or recovery |
| Publication lineage | 1.0 | Discovery reads boards, but no immutable version-to-publication relation |
| Observability/operations | 1.0 | Ordinary request logs only; no collaboration/convergence telemetry |
| Flagship UX | 2.5 | Media-led canvas is directionally right; status, conflict, history and accessible manipulation are incomplete |
| **Overall** | **1.9/5** | **Do not re-platform the canvas. Add a collaboration domain beneath the canonical editor, beginning with revisions and atomic item operations.** |

---

## 2. Precise code evidence register

All line numbers verified against `f82f74a54be79a1721017380ddd5472d856f1679`.

### 2.1 Frontend — moodboard API service

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `moodboardApi.ts` / `MoodboardItemPosition` | 22–31 | Normalised x/y (0–1), rotation, scale — no revision or operation ID | P1 |
| `moodboardApi.ts` / `MoodboardItem` | 34–50 | `id, listingId, imageUri, title, price, position, addedAt, isDemo` — no `revision`, `mediaAssetId`, `sourceLineage` or `operationId` | P1 |
| `moodboardApi.ts` / `Moodboard` | 68–90 | `id, title, description, curatorId, curatorName, curatorAvatar, items, coverImage, isPublic, theme, createdAt, updatedAt` — no `revision`, `members`, `permissions`, `versionHistory` | P1 |
| `moodboardApi.ts` / `MOODBOARD_DEMO_MODE` | 98 | `export const MOODBOARD_DEMO_MODE = false;` — real backend is the intended path | Foundation |
| `moodboardApi.ts` / `fetchMoodboards` | 190–193 | `GET /moodboards?limit=50` — claims "current user's moodboards" but backend returns public-only | P0 contract bug |
| `moodboardApi.ts` / `createMoodboard` | 217–230 | `POST /moodboards` with title, theme — creates server entity before user commits content | P1 |
| `moodboardApi.ts` / `addItemToMoodboard` | 234–260 | `POST /moodboards/:id/items` with listingId — returns `MoodboardItem \| null` | Foundation |
| `moodboardApi.ts` / `updateItemPosition` | 276–290 | `PATCH /moodboards/:id/items/:itemId` — returns `Promise<boolean>`; no revision, no operation ID | P1 |
| `moodboardApi.ts` / `removeItemFromMoodboard` | — | `DELETE /moodboards/:id/items/:itemId` — returns `Promise<boolean>` | P1 |
| `moodboardApi.ts` / `reorderItem` | — | `PUT /moodboards/:id/items/reorder` — returns `Promise<boolean>` | P1 |
| `moodboardApi.ts` / `updateMoodboardTheme` | — | `PATCH /moodboards/:id/theme` — fire-and-forget on client | P1 |

**Critical quote — `MOODBOARD_DEMO_MODE = false` (`moodboardApi.ts:95–98`):**
```ts
// Demo mode is disabled: no API call may silently fall back to in-memory mock
// data and report success (truth-lockdown). Kept as an export so existing
// references compile, but it is now always `false`.
export const MOODBOARD_DEMO_MODE = false;
```
The backlog premise that moodboards are "memory-only" is incorrect. The real backend path is live and demo mode is explicitly disabled.

**Critical quote — `MoodboardItem` DTO (`moodboardApi.ts:34–50`):**
```ts
export interface MoodboardItem {
  id: string;
  /** The source listing ID (for navigation back to the listing). */
  listingId: string;
  /** Image URI (snapshot at time of addition). */
  imageUri: string;
  /** Title (snapshot at time of addition). */
  title: string;
  /** Price in GBP at time of addition. */
  price: number;
  /** Position and transform on the canvas. */
  position: MoodboardItemPosition;
  /** ISO timestamp of when the item was added. */
  addedAt: string;
  /** Honest flag — true while this item comes from mock data. */
  isDemo: boolean;
}
```
No `revision`, no `mediaAssetId`, no `sourceLineage`, no `operationId`, no `lastModifiedBy`. The DTO cannot express conflict-safe writes or capability-aware UI. The `imageUri`/`title`/`price` are snapshots — if the listing changes, the moodboard item is stale with no refresh or lineage trail.

### 2.2 Frontend — moodboard editor screen

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `MoodboardEditorScreen.tsx` / `saving` state | 476 | `const [saving, setSaving] = useState(false);` — one global boolean | P1 |
| `MoodboardEditorScreen.tsx` / `handlePositionCommit` | 578–601 | Optimistic local update, then `updateItemPosition`; failure is only `console.warn` (line 598) | P0 silent divergence |
| `MoodboardEditorScreen.tsx` / `handleAddItem` | 605–625 | `setSaving(true)`, calls `addItemToMoodboard`, updates local state on success, `haptic.error()` on catch | P1 |
| `MoodboardEditorScreen.tsx` / `handleDeleteItem` | 629–645 | `setSaving(true)`, calls `removeItemFromMoodboard`, removes from local state on success | P1 |
| `MoodboardEditorScreen.tsx` / `handleReorderItem` | 650–665 | `setSaving(true)`, calls `reorderItem`, reorders local state on success | P1 |
| `MoodboardEditorScreen.tsx` / multi-delete | 671–687 | `Promise.all(ids.map((id) => removeItemFromMoodboard(...)))` (line 678) — partial success cannot be represented/reversed | P1 |
| `MoodboardEditorScreen.tsx` / multi-layer | 692–710 | Sequential `for (const id of ids) { await reorderItem(...) }` (line 700–701) — multiple revisions and transient order collisions; not atomic | P1 |
| `MoodboardEditorScreen.tsx` / theme update | 714–729 | `void updateMoodboardTheme(...).catch((error) => { console.warn('Theme update failed:', error); })` (line 723–725) — fire-and-forget | P0 silent divergence |
| `MoodboardEditorScreen.tsx` / offline banner | 811–814 | `<OfflineBanner message="Offline — changes are not saved. Reconnect to persist your work." />` — honest disclosure, zero offline capability | P1 |
| `MoodboardEditorScreen.tsx` / saving pill | 950–958 | `saving && <View style={styles.savingOverlay}>...<Text>Saving…</Text>` — one global pill, cannot distinguish queued/synced/conflict/partial/unknown | P1 |
| `MoodboardEditorScreen.tsx` / `onPositionCommit` | 879 | Passes `handlePositionCommit` to `CanvasItem` — gesture commits flow through here | Foundation |

**Critical quote — `handlePositionCommit` silent divergence (`MoodboardEditorScreen.tsx:578–601`):**
```ts
  const handlePositionCommit = useCallback(
    async (id: string, position: MoodboardItemPosition) => {
      if (!moodboard) return;
      // Optimistic local update
      setMoodboard((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((it) =>
                it.id === id ? { ...it, position } : it
              ),
            }
          : null
      );
      try {
        await updateItemPosition(moodboard.id, id, position);
      } catch (error) {
        // Surface the error — position update failed
        console.warn('Position update failed:', error);
      }
    },
    [moodboard],
  );
```
The optimistic update is applied immediately. If the `PATCH` fails (network error, server crash, permission change), the only action is `console.warn`. The user sees their item in the new position, the server still has the old position, and there is no retry, no conflict UI, no "revert" — just silent divergence. The user's creative work appears saved but isn't.

**Critical quote — theme update fire-and-forget (`MoodboardEditorScreen.tsx:721–726`):**
```ts
      if (moodboard) {
        void updateMoodboardTheme(moodboard.id, themeId).catch((error) => {
          console.warn('Theme update failed:', error);
        });
      }
```
`void` — fire-and-forget. The theme appears changed locally, the `catch` only logs. Same silent divergence pattern as position commits.

**Critical quote — offline warning (`MoodboardEditorScreen.tsx:811–814`):**
```tsx
      {/* Offline banner */}
      {isOffline && (
        <OfflineBanner message="Offline — changes are not saved. Reconnect to persist your work." />
      )}
```
Honest disclosure per AGENTS.md §11. But there is no durable local mutation log, no SQLite outbox, no offline editing capability. The user is told they can't save, but there's no path to queue changes for later sync.

**Critical quote — saving pill (`MoodboardEditorScreen.tsx:950–958`):**
```tsx
        {/* Saving indicator */}
        {saving && (
          <View style={styles.savingOverlay} pointerEvents="none">
            <View style={styles.savingPill}>
              <ActivityIndicator size="small" color={colors.textInverse} />
              <Text style={styles.savingText}>Saving…</Text>
            </View>
          </View>
        )}
```
One global `saving` boolean drives one pill. Cannot distinguish: queued local operations, syncing, synced, conflict, partial success, or unknown outcome. A collaborative system needs per-operation status.

### 2.3 Backend — moodboard routes

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `moodboards.ts` / `createMoodboardSchema` | 26–32 | `visibility: z.enum(['public', 'private']).default('public')` (line 29) — defaults to public! | P1 |
| `moodboards.ts` / `mapMoodboard` | 136–142 | Maps row to DTO; `isPublic: row.visibility === 'public'` (line 139) | Foundation |
| `moodboards.ts` / `GET /moodboards` | 155–207 | `WHERE m.visibility = 'public'` (line 158) — always filters public only; authenticated ownership is ignored | P0 contract bug |
| `moodboards.ts` / `GET /moodboards/:id` | 292–333 | Private board returns 404 unless viewer is creator — good anti-enumeration | Foundation |
| `moodboards.ts` / write auth | 368–721 | Repeated owner-or-admin checks — consistent but duplicated with no capability source | P1 |
| `moodboards.ts` / add media | 493–524 | Optional finalization checked for owner/status/public URL — good trust boundary | Foundation |
| `moodboards.ts` / `MAX(sort_order)+1` | 526–530 | `SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM moodboard_items WHERE moodboard_id = $1` (line 527) — unlocked, concurrent adds collide | P1 |
| `moodboards.ts` / item + metadata non-transactional | 533–565, 596–605, 655–664 | Item write and board metadata update are separate `db.query` calls — crash between statements creates inconsistent metadata | P0 |
| `moodboards.ts` / hard delete | 596–605 | `DELETE FROM moodboard_items WHERE id = $1 AND moodboard_id = $2` (line 596) — hard delete, no trash, no undo, no audit | P1 |
| `moodboards.ts` / reorder `MAX(sort_order)+1` | 699–704 | Same unlocked `MAX(sort_order)+1` pattern for reorder-to-front (line 701) | P1 |

**Critical quote — the public-only list bug (`moodboards.ts:155–162`):**
```ts
    const { limit, offset, q, theme } = listMoodboardsQuerySchema.parse(request.query);

    const params: Array<string | number> = [];
    let whereClause = `WHERE m.visibility = 'public'`;
    if (q) {
      params.push(`%${q}%`);
      whereClause += ` AND (m.title ILIKE $${params.length} OR m.description ILIKE $${params.length})`;
```
`WHERE m.visibility = 'public'` — always. The client's `fetchMoodboards()` (`moodboardApi.ts:190`) calls this endpoint expecting "the current user's moodboards" (per the JSDoc comment at line 187: "Fetch the current user's moodboards"). Instead it receives all public moodboards from all users. A user's private boards are invisible to this endpoint. This is a correctness bug that makes the "my moodboards" feature non-functional for private boards.

**Critical quote — the non-transactional item + metadata update (`moodboards.ts:526–565`):**
```ts
      const sortOrderResult = await db.query<{ max_sort: string | number | null }>(
        `SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM moodboard_items WHERE moodboard_id = $1`,
        [moodboardId]
      );
      const sortOrder = Number(sortOrderResult.rows[0].max_sort) + 1;

      // ... INSERT item ...

      // Update board metadata
      const updatedBoard = await db.query(
        `UPDATE moodboards SET updated_at = NOW() WHERE id = $1 RETURNING *`,
        [moodboardId]
      );
```
Three separate `db.query` calls: (1) `SELECT MAX(sort_order)`, (2) `INSERT item`, (3) `UPDATE moodboards SET updated_at`. No `BEGIN`/`COMMIT`. If the process crashes between (2) and (3), the item is persisted but the board's `updated_at` is stale. Two concurrent adds can both read the same `MAX(sort_order)` and get the same sort order value.

**Critical quote — the hard delete (`moodboards.ts:595–598`):**
```ts
      const result = await db.query(
        `DELETE FROM moodboard_items WHERE id = $1 AND moodboard_id = $2`,
        [itemId, moodboardId]
      );
```
Hard delete. No `deleted_at`, no trash, no undo window, no audit trail. For creative work, this is disproportionately harmful — users perceive arranged boards as owned work and silent loss is a trust violation. Per AGENTS.md §6 (Trust): "After arranging objects users perceive the board as owned work; silent loss is disproportionately harmful."

### 2.4 Migrations

| Migration | Lines | Finding |
|---|---|---|
| `127_galleria_moodboards.sql` | 36–71 | Two mutable tables: `moodboards` (owner, visibility, transforms, theme) and `moodboard_items` (snapshot URL/title/price + transform + sort_order). No `revision`, no `deleted_at`, no `members`, no `versions`, no `operations`. `host_user_id` is TEXT with no FK. |

---

## 3. End-to-end flow traces

### 3.1 Current top-down: user edits a moodboard

```text
MoodboardEditorScreen mount
  → fetch themes + picker items in parallel (MoodboardEditorScreen.tsx:489-520)
  → fetchMoodboardDetail(id) or createMoodboard(title, theme)
  → user pans/pinches/rotates an item
  → Reanimated gesture owns transform values
  → gesture ends → handlePositionCommit (line 578)
  → optimistic local update (line 581-589)
  → updateItemPosition → PATCH /moodboards/:id/items/:itemId
  → on failure: console.warn (line 598) — UI/server diverge silently
```

### 3.2 Current bottom-up: data path

```text
moodboards row (owner, visibility, mutable metadata)
  + moodboard_items rows (snapshot URL/title/price + transform + sort_order)
  → route serializer mapMoodboard/mapItem (moodboards.ts:136-142)
  → client mapApiMoodboard adds isDemo:false (moodboardApi.ts:178-180)
  → React component state
  → gesture-owned values
```

There is no step where the server proves which revision the client edited. The absence is systemic, not a screen bug.

### 3.3 Concurrent add collision

```text
User A and User B both add items to the same board simultaneously:
A: SELECT MAX(sort_order) → 5
B: SELECT MAX(sort_order) → 5
A: INSERT item with sort_order = 6
B: INSERT item with sort_order = 6  ← collision
```

Both items have the same sort order. The z-order is ambiguous. No transaction, no lock, no atomic sequence operation.

### 3.4 Intended collaborative flow

```text
gesture ends
  → persist ClientOperation in SQLite outbox
  → optimistic reducer applies locally
  → POST /moodboards/:id/operations (Idempotency-Key, baseRevision)
  → transaction: authorize + lock + validate + apply + revision++ + event
  → ACK canonical operation/revision
  → durable fan-out; peers fetch missing operations after cursor
```

---

## 4. August 2026 benchmark research

### 4.1 Figma's multiplayer architecture — server-authoritative LWW

| Source | Finding | ThryftVerse application |
|---|---|---|
| [Figma Multiplayer Infrastructure — Sujeet Jaiswal](https://sujeet.pro/articles/figma-multiplayer-infrastructure) | Figma supports 200 concurrent editors per document using a CRDT-inspired, server-authoritative protocol. Rejected OT for combinatorial complexity and pure CRDTs for decentralization overhead. Uses property-level last-writer-wins with fractional indexing, backed by a Rust multiplayer server and DynamoDB write-ahead journal processing 2.2B changes/day | ThryftVerse should use Figma's server-authoritative LWW pattern, not pure CRDTs. The server defines operation ordering; clients send optimistic operations and reconcile when the server's decision differs |
| [CRDTs in Production: Lessons from Figma — ML Systems Review, updated 2026](https://mlsystemsreview.com/figma-crdt-deep-dive/) | "The Figma-style server-authoritative pattern has become the dominant architecture for new collaborative editors (Linear, Notion's 2024 rewrite, and most AI-document-editing startups). True peer-to-peer CRDT systems — Yjs, Automerge — have found a home in local-first tooling but remain a minority in consumer web applications." | For ThryftVerse's moodboard (discrete transforms, not rich text), server-authoritative LWW is the right choice. CRDTs are overkill |
| [Figma Architecture Teardown — ADHDecode](https://adhdecode.com/system-design/real-world-architecture-teardowns/figma-architecture-teardown/) | "When you move a layer, it's not a request to a server, a wait for a processed image, and then a display. It's an immediate, local transformation... The server's role? Primarily synchronization and persistence." | ThryftVerse's current optimistic update pattern is directionally correct; the gap is in the sync/persistence/reconciliation layer |
| [CRDT and Real-time Collaboration 2026 — AnhTu.dev](https://anhtu.dev/crdt-and-real-time-collaboration-2026-multi-user-sync-architecture-figma-notion-yjs-automerge-websocket-presence-awareness-1069) | "In 2026 the opposite is true — a product that still has a Save button feels dated. Users are used to Figma, Notion, Linear, Google Docs, Miro, and FigJam: you type — the other person sees it instantly; you go offline for ten minutes, come back, and no 'conflict' dialog asks you to pick a version." | ThryftVerse's current `saving` pill and `console.warn` failure pattern is the pre-collaboration state. The target is seamless sync with no explicit save |

### 4.2 Pinterest group boards — permission model

| Source | Finding | ThryftVerse application |
|---|---|---|
| [Pinterest Create — Board Fundamentals](https://create.pinterest.com/blog/board-fundamentals/) | Group boards: owner sets permissions — collaborators can "add, move and delete Pins and sections or invite others" OR "limit them to saves, comments, reacts and organizing Pins." Secret boards visible only to owner and invited collaborators | ThryftVerse should adopt Pinterest's tiered permission model: owner, editor (add/move/delete), commenter (comment/react only), viewer (read only) |
| [Pinterest Business Community — Group Board Curation, 2025](https://community.pinterest.biz/t/group-board-curation/383) | "As a collaborator, you're able to do what the board owner has determined in their settings... Only the board owner has those controls." Collaborators cannot archive, make secret, or remove the board | ThryftVerse moodboard owner retains full control: delete, publish, change visibility, restore version. Collaborators are scoped to their granted capabilities |
| [Oraya Studios — Group Boards, May 2026](https://orayastudios.com/what-are-group-boards-and-how-to-use-them/) | "A small cluster of profile icons appears in the board thumbnail to indicate that multiple people contribute." Board owner manages invitations and can remove contributors | ThryftVerse should show collaborator avatars (collapsed after 3) as a visual indicator of shared boards, not as decorative presence spectacle |

### 4.3 Apple CloudKit — mobile sync patterns

| Source | Finding | ThryftVerse application |
|---|---|---|
| [Apple CloudKit — Remote Records](https://developer.apple.com/documentation/cloudkit/remote-records) | Local caches, subscriptions/change tokens; `recordChangeTag` is compared on save | Mobile sync requires revision tokens and durable cache even if CloudKit is not chosen |
| [Apple CloudKit — `serverRecordChanged`](https://developer.apple.com/documentation/cloudkit/ckerror/serverrecordchanged) | Provides ancestor/client/server copies on conflict | Conflict responses must preserve all logical versions; retry alone is insufficient. ThryftVerse's `console.warn` pattern is the anti-pattern |

### 4.4 C2PA — content provenance

| Source | Finding | ThryftVerse application |
|---|---|---|
| [C2PA Content Credentials 2.4, April 2026](https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html) | Preserves ingredient/edit provenance | Publications should retain source asset/operation lineage; C2PA does not certify truth but provides attribution chain |

---

## 5. Capability, state and ownership matrices

### 5.1 Capability matrix

| Capability | Current | Target owner | Required change |
|---|---|---|---|
| Create/read private board | Live | Moodboard domain | Fix owned-list endpoint (`moodboards.ts:158`) |
| Transform item | Live, last-write-wins | Operation service | Conditional atomic operation with revision |
| Add finalized media | Partly live | Media + moodboard domain | Preserve asset ID/source lineage, not URL only |
| Invite collaborator | Missing | Membership service | Token-hashed invite lifecycle |
| Roles/revocation | Missing | Authorization policy | Board-scoped capabilities and channel eviction |
| Presence | Missing | Ephemeral realtime | TTL presence; never durable truth |
| Comments/mentions | Missing | Comment service | Anchored threads with resolve state/preferences |
| Version history | Missing | Version service | Immutable checkpoints plus operation log |
| Offline editing | Missing | Native sync engine | SQLite outbox, idempotent replay, conflict UI |
| Publish board | Public toggle only | Publication domain | Immutable snapshot, moderation/rights gate |

### 5.2 Role-to-capability matrix (per Pinterest model)

| Action | Owner | Editor | Commenter | Viewer | Public anonymous |
|---|:---:|:---:|:---:|:---:|:---:|
| Read | ✓ | ✓ | ✓ | ✓ | Published/public snapshot only |
| Transform/add/remove | ✓ | ✓ | — | — | — |
| Comment | ✓ | ✓ | ✓ | Product decision | — |
| Invite/change roles | ✓ | — | — | — | — |
| Change visibility/publish | ✓ | — | — | — | — |
| Restore version | ✓ | Optional | — | — | — |
| Delete | ✓ | — | — | — | — |

### 5.3 Source-of-truth ownership

| State | Durable authority | Client cache | Realtime |
|---|---|---|---|
| Board/member/item/version/comment | PostgreSQL | SQLite snapshot | Durable event notification |
| Pending local operation | Client SQLite outbox until ACK | Same | Not server truth before ACK |
| Presence/cursor/selection | Redis/provider TTL | In-memory | Ephemeral/lossy |
| Published board | Immutable publication snapshot | Read cache/CDN | Invalidation event |
| Media/moderation | `media_assets` + finalization | Disk cache | Status events |

---

## 6. User psychology, JTBD and trust

### 6.1 Jobs to be done

- "Externalize a look before I forget it": speed and spatial directness.
- "Let a friend/client refine it without taking over": permission clarity and attribution.
- "Experiment safely": undo, history and non-destructive editing.
- "Turn this into something publishable": rights, stable output and lineage.

### 6.2 Trust implications

- After arranging objects users perceive the board as owned work; silent loss is disproportionately harmful.
- Ambiguous roles create social friction. Invitation copy must state exactly what can change.
- Instant optimistic movement is correct, but must not imply durability. Status appears only on transition: `Saving`, `Offline — 3 changes`, `Conflict needs review`, then recedes.
- "Server won" is unacceptable for creative work. Preserve the rejected local state as a recoverable version.
- New boards stay private; publishing is a reviewed action, not a casually flipped visibility value. (Current default is `public` — `moodboards.ts:29` — which is wrong for creative work.)

---

## 7. Strict anti-AI flagship design direction

### 7.1 Composition and density

- Canvas/media is dominant. One compact top rail and one context-sensitive bottom dock.
- No card dashboard, permanent collaboration panel, sparkle badge or explanatory onboarding paragraphs.
- Selection gets one meaningful outline; Back/invite/undo/overflow use transparent 44pt targets with 20–24pt glyphs.
- No decorative card around the canvas; no more than two non-avatar radii.
- Collaborator avatars collapse after three; presence is informational, not ornament.

### 7.2 State design

| State | Required presentation |
|---|---|
| Loading | Canvas-shaped skeleton preserving final geometry |
| Empty | Empty canvas plus direct "Add items"; no tutorial card stack |
| Saving | Quiet transient text, not indefinite spinner overlay |
| Offline/no edits | Small banner; browsing continues |
| Offline/edits | Queued count and durable local guarantee |
| Conflict | Preserve work; identify object/person/time; compare/keep/use latest/duplicate |
| Permission revoked | Freeze editing; retain unsynced work as exportable local copy |
| Partial media failure | Preserve geometry; mark only failed asset with retry |
| Deleted | Trash deadline and restore |

### 7.3 Motion and accessibility

- 160–220ms tool-state transitions; no bouncing cursors, mount cascade or perpetual pulse.
- Reduced motion removes spring settle and cursor interpolation.
- Provide ordered-list alternative actions: move, resize presets, rotate steps, bring forward/back and describe position.
- Batch non-urgent live announcements; do not flood screen readers with every remote drag.
- At large text, move tools to a sheet rather than shrinking canvas below usefulness.

---

## 8. Target architecture and contracts

### 8.1 Convergence model (per Figma's server-authoritative LWW pattern)

Use server-ordered per-object operations with optimistic concurrency first. A CRDT is not justified for discrete transforms/metadata; add one only if simultaneous rich text/freehand becomes a proved requirement.

```text
gesture ends
  → persist ClientOperation in SQLite outbox
  → optimistic reducer applies locally
  → POST /moodboards/:id/operations (Idempotency-Key, baseRevision)
  → transaction: authorize + lock + validate + apply + revision++ + event
  → ACK canonical operation/revision
  → durable fan-out; peers fetch missing operations after cursor
```

### 8.2 Proposed storage

```sql
ALTER TABLE moodboards ADD COLUMN revision BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD COLUMN updated_by TEXT REFERENCES users(id);

CREATE TABLE moodboard_members (
  board_id TEXT REFERENCES moodboards(id), user_id TEXT REFERENCES users(id),
  role TEXT CHECK (role IN ('owner','editor','commenter','viewer')),
  state TEXT CHECK (state IN ('active','suspended','removed')),
  joined_at TIMESTAMPTZ, removed_at TIMESTAMPTZ,
  PRIMARY KEY (board_id, user_id)
);

CREATE TABLE moodboard_operations (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL, actor_id TEXT NOT NULL,
  client_id TEXT NOT NULL, base_revision BIGINT NOT NULL,
  applied_revision BIGINT NOT NULL, operation_type TEXT NOT NULL,
  item_id TEXT, payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (board_id, client_id)
);

CREATE TABLE moodboard_versions (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL, revision BIGINT NOT NULL,
  snapshot JSONB NOT NULL, label TEXT, created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL, UNIQUE(board_id, revision)
);
```

Add invites/comments/comment replies/publications and `media_asset_id` on items. Hash invite tokens at rest.

### 8.3 Mutation contract

```ts
type MoodboardOperationRequest = {
  clientOperationId: string; baseRevision: number;
  type: 'item.add'|'item.transform'|'item.remove'|'item.reorder'|'board.theme'|'board.rename';
  itemId?: string; payload: unknown;
};
type OperationResponse =
  | { outcome:'applied'|'duplicate'; operationId:string; revision:number; canonicalPatch:unknown }
  | { outcome:'conflict'; currentRevision:number; operationsSinceBase:unknown[]; snapshot?:unknown }
  | { outcome:'forbidden'; recoverLocalCopy:true };
```

HTTP timeout is `unknown`, not failure. Reconcile by `clientOperationId` before retry.

### 8.4 Events/cache/privacy

- Transactional outbox: `moodboard.operation.applied.v1`, `member.changed.v1`, `comment.created.v1`, `publication.created.v1`.
- Events carry IDs/revisions, not private content unless authorized.
- Realtime channel authorizes on join and reauthorizes on membership change.
- Cache public snapshots by `{boardId}:{publishedRevision}`; avoid broad caching of private mutable state.
- CDN cover keys include revision. Presence has short TTL and no long-term cursor history.

### 8.5 Full client state machine

```text
unloaded → loading → ready
ready → editing → queued_local → syncing → synced
queued_local ↔ offline_queued
syncing → conflict → resolving → queued_local
syncing → outcome_unknown → reconciling → synced | conflict | retryable
any editable → permission_revoked → local_recovery_only
ready → deleting → trashed → restored | purged
```

Status derives from the outbox, never a manually toggled `saving` boolean.

---

## 9. Security, privacy and failure modes

| Failure/threat | Current exposure | Required mitigation |
|---|---|---|
| IDOR/enumeration | Detail 404 is good; collaborator surface expands risk | Central capability authorization and object-level tests |
| Invite theft/replay | Not built | 256-bit token, hash, TTL, single use, recipient binding, rate limits/revoke |
| Realtime access after revocation | Not built | Short-lived channel token and immediate disconnect |
| Lost update | Unconditional PATCH (`moodboards.ts:533–565`) | Revision, operation idempotency, conflict response |
| Partial mutation | Separate SQL statements (`moodboards.ts:533–565, 596–605, 655–664`) | Transaction plus transactional event outbox |
| Ordering collision | Unlocked `MAX(sort_order)+1` (`moodboards.ts:527, 701`) | Board row lock; ranked ordering/rebalance or atomic sequence op |
| Silent optimistic divergence | `console.warn` on failure (`MoodboardEditorScreen.tsx:598, 724`) | Reconcile with server; show conflict/retry UI; never silently swallow |
| Malicious remote media | Free `mediaUrl` remains possible | Finalized media IDs only in production |
| Comment abuse | Not built | Block graph, reports/moderation, mention/rate limits |
| Presence surveillance | Not built | Ephemeral TTL, minimization, opt-out decision |
| Deletion/retention | Hard cascade (`moodboards.ts:596`) | Export/trash/retention/publication-preservation policy |
| Public-by-default creation | `visibility.default('public')` (`moodboards.ts:29`) | Default to `private`; publishing is a deliberate action |

---

## 10. Reliability, SLOs and observability

### SLOs

- Snapshot read p95 <350ms API, p99 <800ms, 99.9% availability.
- Operation ACK p95 <250ms in-region, p99 <750ms.
- Peer propagation p95 <500ms, p99 <2s.
- 99% offline replay convergence within 10s for ≤100 operations.
- Lost acknowledged operations: 0; duplicate side effects: 0.
- Revocation propagation p99 <5s.
- Version restore success 99.99%; historical snapshot never mutates.

### Telemetry

Track operation queued/applied/duplicate/conflict/reconciled, outbox depth/age, revision gap, unauthorized attempts, channel disconnect reason, invite abuse, compaction time and lineage failures. Never log board text, invite tokens or private asset URLs. Alert on conflict/unknown-outcome regressions by app version.

---

## 11. Migration, flags, compatibility and rollback

### Flags

```text
moodboard_revision_writes_v1
moodboard_owned_list_split_v1
moodboard_sync_v1
moodboard_collaboration_v1
moodboard_history_publish_v1
moodboard_private_by_default_v1
```

### Sequence

1. **Fix public-by-default:** change `createMoodboardSchema` visibility default to `private` (`moodboards.ts:29`).
2. **Fix owned-list bug:** split `GET /me/moodboards` for owned/member boards from `GET /moodboards/discover` for public discovery. The current endpoint (`moodboards.ts:158`) violates its client contract.
3. Add/backfill revisions and owner membership rows; dual-read old DTO plus revision.
4. Add operation endpoint behind `moodboard_revision_writes`; old PATCH temporarily increments revision transactionally.
5. Wrap each semantic operation and related board metadata update in one transaction.
6. Ship SQLite outbox behind `moodboard_sync_v1`; shadow-apply and compare snapshots.
7. Enable read-only realtime, then internal collaborative editing.
8. Add invites/comments/history after authorization audit.
9. Deprecate old mutations only after supported-version threshold and forced-upgrade decision.

Rollback disables new collaboration admission/submission, not reads. Keep the log; rebuild snapshots from operations if a reducer defect appears.

---

## 12. Phased implementation backlog

| Phase | Concrete work/files | Owner | Dependency | Exit |
|---|---|---|---|---|
| 0 — correctness | `routes/moodboards.ts` (lines 29, 158, 533–565, 596–605, 655–664), `moodboardApi.ts` (lines 190–193): private-by-default, owned/public split, transaction, revision responses | Marketplace API | Migration | Contract/integration tests pass |
| 1 — domain | migration; `domain/moodboards/*`; authorization/operation/outbox | API Platform | Phase 0 | Two API clients converge; duplicates harmless |
| 2 — native sync | `services/moodboardSync/*`, SQLite outbox/reducer; canonical editor refactor; replace `console.warn` divergence (`MoodboardEditorScreen.tsx:598, 724`) with reconciliation | Mobile Platform | Operation API | Kill/relaunch/offline replay passes |
| 3 — collaboration | membership/invites, realtime/presence/comments | Identity + Realtime | Security review | Revocation/abuse suites pass |
| 4 — history/publish | snapshots/restore/publication/media lineage | Creative Systems | Media/moderation | Revision reproducible byte-for-byte |
| 5 — UX hardening | conflict compare, accessible ordered editor, per-operation status (replace global `saving` pill), profiling | UI/UX | Sync | Native/visual gates pass |

---

## 13. Test, evaluation and release gates

- Property-based reducer: any valid non-conflicting operation permutation converges.
- Transaction tests for item + board metadata + event atomicity.
- Duplicate client ID, reordered delivery, disconnect-after-commit and retry tests.
- Full authorization matrix including removed member and anonymous publication.
- Invite expiry/replay/brute-force/rate-limit tests.
- Migration/backfill and older-client compatibility tests.
- Snapshot reconstruction hash equals materialized state.
- Native offline kill/relaunch, conflict recovery and screen-reader manipulation tests.
- No data loss in dogfood across 10k+ operations.
- Conflict task success ≥95% in usability test; nobody loses local work.
- Crash-free editor sessions ≥99.9%; gesture frame budget p95 under 16.7ms on target devices.
- VoiceOver/TalkBack, 200% text, switch control, reduced motion; thumbnail/squint tests pass.
- No `console.warn`-only error handling in any mutation path.

---

## 14. Explicit non-goals

- General-purpose Figma/Canva clone, whiteboard, rich-text CRDT, desktop infinite canvas or public cursor spectacle.
- AI-generated layouts, decorative presence or autonomous edits.
- Publishing arbitrary remote media without finalization/rights checks.
- Pure peer-to-peer CRDT (Yjs/Automerge) — server-authoritative LWW is sufficient for discrete transforms.

---

## 15. Decisions requiring product, legal/trust and operations input

1. Can viewers comment? Can editors invite?
2. Does collaborator removal preserve comments/attribution?
3. Trash, operation and version retention by plan/region?
4. Are public boards live mutable views or immutable publications? Recommendation: immutable snapshots.
5. What rights attestation applies to collaborator-provided assets?
6. Is presence opt-out required?
7. Should new boards default to private? (Recommendation: yes — current `public` default at `moodboards.ts:29` is wrong for creative work.)

---

## 16. Final decision

**PARTIAL — DURABLE MVP, NOT COLLABORATIVE.** Fix the owned-list contract bug (`moodboards.ts:158`), change visibility default to private (`moodboards.ts:29`), wrap mutations in transactions, replace `console.warn` silent divergence (`MoodboardEditorScreen.tsx:598, 724`) with proper reconciliation, and establish revisions/idempotent operations. Then add mobile offline sync (SQLite outbox) and capability-based collaboration (per Figma's server-authoritative LWW pattern and Pinterest's tiered permission model). That sequence preserves the working editor while creating flagship trust boundaries. The current system is a competent private collage editor — the upgrade path makes it a collaborative creative system without re-platforming.
