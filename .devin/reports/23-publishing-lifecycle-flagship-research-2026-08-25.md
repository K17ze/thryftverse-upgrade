# 23 — Poster, Look and Moodboard Publishing Lifecycle

**Engineering decision document**
**Research cut-off:** 25 August 2026
**Audited baseline:** `f82f74a54be79a1721017380ddd5472d856f1679`
**Decision owners:** Creator Platform + Media Platform + Trust & Safety + Mobile Platform
**Status:** **P0 architectural disconnect — backend capability blocker**

## Executive decision

ThryftVerse does not have one publishing lifecycle. It has several individually promising systems that do not converge:

1. `CreatorContext` and `CreatorDraftService` provide durable, device-local editing and five-second autosave.
2. `/creator/documents` provides server snapshots, revisions, optimistic locking and a nominal publish state, but the native publisher does not use it.
3. Looks publish directly into the public Look aggregate.
4. Posters publish through a separate, comparatively strong `/poster-stories` transaction.
5. Moodboards have their own backend routes and a memory-oriented native experience, but are not part of the creator-document lifecycle.
6. Scheduling targets server creator documents that the canonical native flow never creates.

This is not primarily an editor-polish problem. It is a source-of-truth and state-machine problem. A flagship implementation needs one durable authoring aggregate and explicit, type-specific publication projections. Saving, collaborating, scheduling, moderating and publishing must be operations on the same versioned document—not unrelated endpoint families joined by UI optimism.

The current implementation has valuable foundations and must be evolved, not discarded. In particular, local crash recovery, truthful unknown-outcome UI, Look media verification, and poster-story transactional idempotency are worth retaining.

## What the product must guarantee

For every Look, Poster or Moodboard, the user should be able to answer:

- Where is my latest work saved?
- Is it available on my other device?
- Which version is public?
- Who changed it, and can I recover an earlier version?
- If the app closes during upload or publish, what happened?
- If publication is scheduled, will it publish exactly once?
- Which media, product snapshots, rights and moderation decisions produced the public object?
- If collaboration is enabled, whose edit won and why?

If the system cannot answer these from authoritative rows, the UI must not imply that it can.

## Evidence map and maturity assessment

| Layer | Current evidence | Maturity | Consequence |
|---|---|---:|---|
| Local authoring | `CreatorContext.tsx`, `CreatorDraftService`, `ProjectStore`, `CrashJournal` | Strong local foundation | Restart recovery is credible on one device |
| Media transfer | `UploadManager`, persisted upload-job store, verified finalization flow | Medium | Retry survives process restart, but OS-level background execution is not established |
| Direct Look publish | `CreatorPublishSheet.tsx` → Look API; backend verifies finalization/asset state | Medium–strong | Public Look publication is materially real |
| Poster-story publish | `POST /poster-stories` transaction, advisory lock, payload hash, receipt binding | Strong foundation | Lost-response replay and media ownership are addressed |
| Server authoring | `routes/creatorDocuments.ts` | Medium but disconnected | Revisions and locking are not benefits the native creator receives |
| Scheduling | client camelCase payload vs server snake_case; server-document dependency | Broken/disconnected | New drafts are correctly fail-closed in UI; legacy retry cannot be trusted |
| Moodboards | separate routes and local/memory product surface | Fragmented | No shared draft, revision, collaboration or publication semantics |
| Legacy posters | separate `/posters` route | Unsafe/obsolete | Bare media URL and ownership/privacy concerns remain if reachable |
| Provenance | media finalization and bindings exist; no complete authoring lineage envelope | Partial | Public media can be verified without explaining transformation/history |
| Moderation/rights | publication gate exists for media assets | Partial | Document-level policy, rights snapshots and appeal workflow are not unified |

## Repository findings that change the earlier diagnosis

### 1. The native publisher bypasses server creator documents

`CreatorPublishSheet.tsx` uploads local media and then invokes `createLookOnApi`, `updateLookOnApi`, or `createPosterStory`. Repository search found no canonical client save/publish path through `/creator/documents`.

Therefore:

- server lock versions do not protect native edits;
- server revision history does not record normal native creation;
- cross-device recovery is not delivered by the current native flow;
- scheduled publication cannot reliably attach to its supposed document;
- the status on a creator-document row is not the status of the public Look or Poster.

This is a P0 architectural disconnect, not a missing query invalidation.

### 2. `/creator/documents/:id/publish` is not publication

The route at `creatorDocuments.ts:607–731` validates a document, marks it `published` (`:684`), and writes a revision (`:697–711`). It does not create the public Look or Poster projection used by discovery and viewers. Its media validation rejects local URIs (`:356–359`), but does not perform the same owner-bound finalization/asset checks as the stronger direct publication routes.

**Verified:** `creatorDocuments.ts:682–686`:
```sql
UPDATE creator_documents
SET next_revision_number = next_revision_number + 1,
    status = 'published',
    lock_version = lock_version + 1,
    published_at = COALESCE(published_at, NOW()),
```
The document status becomes `published` but no Look, Poster, or Moodboard projection is created. The revision is inserted (`:697–711`) but it's an internal document revision, not a public content projection.

Calling this operation `publish` creates two dangerous truths: “document status is published” and “content is publicly available.” These can diverge.

### 3. Poster-story publication is a good reference implementation

`POST /poster-stories`:

- locks the publication ID;
- hashes the accepted payload;
- replays the same owner/same payload safely;
- rejects owner or payload reuse conflicts;
- validates finalization owner, status, MIME family, supplied URL, asset ID and scope;
- gates on published canonical media when enabled;
- validates the composition envelope;
- creates story, frames, stickers and media bindings in one transaction.

This is the closest current code to the desired publication boundary. It should inform a shared publication orchestrator rather than be generalized away behind a weak CRUD service.

### 4. Scheduling is not an honest end-to-end capability

The frontend helper sends `scheduledFor`; the server schedule contract expects `scheduled_for`. More fundamentally, the route schedules a `creator_documents` row, while the native publish flow has not created that row. Earlier code also attempted immediate publication before attaching the schedule, which makes “schedule” semantically false.

The current UI’s disabled treatment—“Scheduling is unavailable. Clear it to publish now.”—is the correct fail-closed behavior until the backend workflow exists. Do not remove this guard to make the UI look complete.

### 5. Upload persistence is not native background transfer

Persisting job metadata in AsyncStorage enables rehydration and retry. It does not prove that iOS or Android will continue an HTTP transfer after suspension or termination. Apple’s supported background `URLSession` design hands transfers to the system; uploads that must continue after app exit must be file-backed. The mobile implementation needs a native transfer adapter and reconciliation, not just a durable JavaScript queue.

### 6. Legacy poster paths increase risk

The repository contains both poster stories and a legacy `/posters` family. The legacy create/update behavior permits a bare URL fallback and uses an upsert shape that requires strict owner guarding. Its direct detail projection also needs status/audience access enforcement. Even if the canonical UI no longer calls it, reachable routes are production surface area.

Required action: instrument callers, migrate remaining consumers, then remove or hard-disable legacy mutation/detail paths. “Unused by this screen” is not a security boundary.

## Root-cause model

```text
Local CreatorDocument
  ├─ saved to device project store
  ├─ media uploaded through UploadManager
  ├─ Look sent directly to Look API
  ├─ Poster sent directly to Poster Story API
  └─ schedule sent to unrelated server creator-document API

Server CreatorDocument
  ├─ supports locks/revisions
  ├─ is not canonical native authoring state
  └─ “publish” does not create public projection

Moodboard
  └─ separate model, separate persistence semantics
```

The owner layer is missing: a canonical authoring document that controls every transition and records its projection.

## Target domain model

### Canonical authoring aggregate

```ts
type CreatorDocument = {
  id: string;
  ownerId: string;
  type: 'look' | 'poster' | 'moodboard';
  schemaVersion: number;
  lifecycle: 'draft' | 'ready' | 'scheduled' | 'publishing' |
    'published' | 'blocked' | 'failed' | 'archived' | 'deleted';
  headRevision: number;
  publishedRevision?: number;
  publicationId?: string;
  schedule?: { at: string; timezone: string; version: number };
  moderationState: 'not_submitted' | 'pending' | 'approved' | 'rejected';
  rightsSnapshotId?: string;
  createdAt: string;
  updatedAt: string;
};
```

The document is the editable source. A publication is an immutable snapshot/projection of one accepted revision. Editing published work creates a new draft head; it must not mutate history silently.

### Required authoritative tables

- `creator_documents`: ownership and lifecycle only.
- `creator_document_revisions`: immutable normalized snapshots, author/device, base revision, checksum.
- `creator_document_media`: revision-scoped bindings to verified assets and transformation lineage.
- `creator_collaborators`: role, invitation state, expiry and revocation.
- `creator_publications`: document ID, revision, target type/ID, idempotency key, state, policy decision.
- `creator_schedules`: due time, timezone, claimed-at lease, attempts, terminal state.
- `creator_rights_snapshots`: licence/consent assertions and evidence references as they existed at publish time.
- `creator_recovery_events`: deletion tombstone, restore window and purge result.

Public `looks`, `poster_stories`, and moodboard projections can remain optimized read models. They must reference `creator_publications.id` and `source_revision`.

## Lifecycle state machine

```text
draft --validate--> ready --publish command--> publishing
  |                    |                         |
  |                    +--schedule--> scheduled  +--accepted--> published
  |                                      |       +--policy hold--> blocked
  +--delete--> deleted                   |       +--definite failure--> failed
                                         +--claim exactly once--> publishing

published --edit--> draft (new revision; old publication remains immutable)
published --archive--> archived
deleted --restore within window--> draft/archived
```

Rules:

- An ambiguous client response is `unknown`, a presentation state, not a server lifecycle transition.
- The client resolves unknown outcome using `GET /publication-commands/:idempotencyKey`.
- Only the publication orchestrator may write `published`.
- Schedule edits increment a version; workers must publish only the claimed version.
- Moderation failure never becomes a public projection.

## API contract

### Save revision

```http
PUT /creator/documents/:id
If-Match: "revision-41"
Idempotency-Key: save_<device>_<operation>
```

```json
{
  "baseRevision": 41,
  "deviceId": "device_…",
  "schemaVersion": 3,
  "document": {},
  "mediaBindings": [{"assetId":"asset_…","role":"layer:4"}]
}
```

Return the committed revision and server clock. A base mismatch returns `409 revision_conflict` with current revision metadata—not a silent last-write-wins overwrite.

### Publish command

```http
POST /creator/documents/:id/publications
Idempotency-Key: pub_<document>_<revision>
```

```json
{
  "revision": 42,
  "destination": "look",
  "audience": "public",
  "expectedMedia": [{"assetId":"asset_…","finalizationId":"fin_…"}],
  "rightsSnapshotId": "rights_…"
}
```

The server transaction must:

1. lock document/publication key;
2. prove actor role and target revision;
3. validate schema and capabilities;
4. bind owner-verified, published media assets;
5. evaluate document and asset policy;
6. create the type-specific projection;
7. write publication and document states;
8. append an outbox event;
9. commit before responding.

Same key/same hash replays the original result. Same key/different hash returns conflict. No response after commit remains discoverable by key.

## Cross-device sync and conflict behavior

Use revisioned snapshots first. Do not introduce a CRDT merely to claim collaboration.

- Autosave locally after short idle and immediately on background/navigation boundaries.
- Sync a coalesced revision after idle, connectivity recovery and app background.
- Keep a device operation ID and base revision.
- Auto-merge only disjoint, typed fields where the merge is provably safe.
- For composition collisions, preserve both revisions and show a visual conflict resolver: “This device” versus “Saved on iPad at 14:32.”
- Never discard an offline branch because its timestamp is older.
- Media upload and document save are separate durable operations; the draft can reference pending local media, but `ready` cannot.

Real-time collaboration should use ordered operations only for surfaces that need simultaneous editing. Presence is ephemeral and must never count as a saved edit. Durable operations require actor, role, document revision, operation ID and server sequence. Periodic snapshots bound replay time.

## Media lineage and provenance

Every published media binding needs:

- original asset checksum and owner;
- upload finalization receipt;
- canonical rendition ID and moderation state;
- ordered transformation recipe (crop, mask, filter, AI edit, export);
- source listing/content references;
- rights snapshot;
- publication and revision IDs;
- provenance credential or explicit “no credential available” state.

C2PA 2.4, published April 2026, is the current technical benchmark for content credentials and provenance manifests. Adopt it as an interoperability layer, not a badge that implies truth. Credentials describe asserted origin and edits; they do not prove that the depicted event is true. The UI should expose a restrained “Content details” action and never place decorative “AI verified” pills over the artwork.

## Scheduling design

Scheduling is a server responsibility:

- Store UTC instant, original timezone and schedule version.
- Claim due rows using a short database lease and `SKIP LOCKED` or an equivalent queue primitive.
- Execute the same idempotent publication command used by “Publish now.”
- Write attempt, policy decision and terminal result before notification.
- Re-check ownership, rights, media readiness and moderation at execution time.
- A cancel/reschedule increments version so an already-leased stale job cannot publish.
- Notify on success, actionable block, definite failure and prolonged delay.

Do not publish immediately and then label the object scheduled. Do not rely on a mobile timer.

## Moderation, rights and recovery

Moderation must cover the composition, not only each image. Text, stickers, linked products, mentions and derived output can change policy meaning.

- Pre-submit checks may guide the creator, but server policy is authoritative.
- Store policy version and decision evidence with the publication.
- “Blocked” must state the affected element and an appeal/recovery action.
- Product snapshots must record the listing state used at publication; viewers should resolve live availability separately.
- Deletes create tombstones and revoke public projections immediately.
- Keep a documented restore window; purge media only after reference counting across drafts/publications.
- Legal retention must be policy-controlled and invisible as a false user-restorable state.

## Flagship native UX and anti-AI design

The editor’s dominant object is the creation. Chrome must recede.

- One compact status line: `Saved`, `Saving…`, `Offline — on this device`, or `Conflict`.
- No “cloud sync” badge unless the acknowledged server revision is current.
- “Next” opens one publication decision surface; do not stack cards for caption, audience, schedule and quality score.
- Show validation beside the affected object, with one recovery action.
- Keep Publish as the only visually dominant action.
- Unknown outcome uses calm warning language: “We lost the connection after sending. Check whether it published.”
- Success transitions directly to the real public object. Avoid confetti, generic AI sparkle, inflated quality scores or multi-step theatre.
- Revision history is a media-first timeline, not a dashboard of equal rounded panels.
- Collaboration avatars communicate active people only when presence is fresh; saved authorship comes from revisions.
- Loading skeletons preserve canvas geometry. Offline mode retains editing and truthful local-save state.

Accessibility requirements:

- announce save/publish status changes without repeatedly interrupting typing;
- expose layer order and selected state;
- provide non-gesture controls for reorder/resize critical operations;
- label conflict choices by device/time/author;
- support large text without covering the canvas or primary action;
- provide reduced-motion transitions and captions/transcripts for video/audio media.

## Reliability targets

| Signal | Initial SLO |
|---|---:|
| Local edit recovery after forced termination | 99.99% of acknowledged local saves |
| Server save acknowledged durability | 99.99% |
| Publish command availability | 99.95% monthly |
| Duplicate public projections per idempotency key | 0 |
| Scheduled publish within 60 seconds of due time | 99.9% |
| Unknown outcomes resolvable by key within 30 seconds | 99.9% |
| Cross-device revision propagation p95 | < 3 s online |
| Public projection/media referential integrity | 100% |

Instrument state transitions, queue delay, revision conflicts, lost-response replays, moderation holds, orphaned uploads, recovery success and legacy-route traffic. Never log document bodies, private media URLs or caption text by default.

## Implementation sequence

### P0 — establish one truth

1. Define one versioned creator-document contract for Look, Poster and Moodboard.
2. Wire canonical native save/open to server revisions while preserving local-first crash recovery.
3. Replace `/creator/documents/:id/publish` with or redirect it to a real publication command that creates the public projection transactionally.
4. Preserve poster-story receipt binding/idempotency behavior in the shared orchestrator.
5. Fix scheduling casing, then keep the UI disabled until server documents and workers are live.
6. Audit and block legacy `/posters` owner/privacy weaknesses; measure and migrate callers.

### P1 — resilience and parity

7. Add native background-transfer adapters with persisted file-backed upload sources and reconciliation.
8. Add publication lookup by idempotency key for unknown outcomes.
9. Add conflict UI and immutable revision history.
10. Bring Moodboards into the same lifecycle without forcing their canvas schema into Look/Poster shapes.
11. Add document-level moderation, rights snapshots and media lineage.

### P2 — collaboration and provenance

12. Add role-based collaborators, invitations and auditable operations.
13. Add live presence and simultaneous editing only after sequential revision sync is reliable.
14. Export/verify C2PA-compatible content credentials where media infrastructure supports them.
15. Add scheduled-publication operations UI, recovery and SLO dashboards.

## Verification matrix

### Contract and security

- actor cannot read/update/publish another owner’s private document;
- collaborator roles restrict publish/delete/invite correctly;
- finalization belongs to actor, asset, media type and document scope;
- same idempotency key/different payload fails closed;
- private, draft, expired and deleted projections cannot leak from any legacy route.

### Failure injection

- process killed during edit, upload, transaction and after commit/before response;
- offline branch edited on two devices;
- media moderation changes between schedule and due time;
- schedule cancelled after worker claim;
- finalization succeeds but public projection fails;
- query invalidation fails after a successful commit;
- app upgraded with an older local document schema.

### Product states

- loading, empty, offline-local, syncing, conflict, upload pending, processing, blocked, scheduled, publishing, unknown, failed, published, archived and deleted;
- large text, screen reader, switch control, reduced motion and low-memory media behavior;
- visual parity among editor, preview, published renderer and thumbnail.

## Current-2026 primary-source research

### C2PA 2.4 — April 2026

| Source | Finding | ThryftVerse application |
|---|---|---|
| [C2PA Technical Specification 2.4 (April 2026)](https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html) | Version 2.4 introduces: new crJSON serialization, `c2pa.ai-disclosure` assertion for machine-readable AI transparency, `c2pa.repository-receipt` assertion, HTML embedding support, structured text embedding | Adopt C2PA 2.4 as interoperability layer for content credentials; use `c2pa.ai-disclosure` for AI-edited media |
| [C2PA Content Credentials](https://spec.c2pa.org/specifications/specifications/2.4/specs/ContentCredentials.html) | "Content Credentials do not provide value judgments about whether a given set of provenance data is 'true', but instead merely whether the provenance information is well-formed and free from tampering" | Never claim "AI verified" or "authentic" — credentials describe asserted origin, not truth |
| [C2PA crJSON format](https://spec.c2pa.org/specifications/specifications/2.4/crJSON/crjson-format.html) | JSON-LD serialization for Content Credentials export and interoperability | Use crJSON for export/validation reporting |

### Additional sources

- [C2PA specifications index](https://spec.c2pa.org/) — current release family and implementation guidance.
- [Apple URLSession](https://developer.apple.com/documentation/foundation/urlsession) — system-managed networking and background transfer architecture.
- [Apple `background(withIdentifier:)`](https://developer.apple.com/documentation/foundation/urlsessionconfiguration/background(withidentifier:)) — durable background-session semantics and constraints.
- [Canva: collaborate on designs](https://www.canva.com/help/collaborate-designs/) — current user expectations for invites, permissions, comments and shared design work.
- [Canva: schedule social media posts](https://www.canva.com/help/schedule-social-media-posts/) — current scheduling/recovery interaction benchmark.

### Key C2PA 2.4 finding for ThryftVerse

C2PA 2.4 (April 2026) introduced the `c2pa.ai-disclosure` assertion for machine-readable AI transparency. This is directly relevant to ThryftVerse's AI photo enhancement and AI listing intelligence features. When AI is used to edit or generate media, the `c2pa.ai-disclosure` assertion should record:
- What AI model was used
- What operation was performed
- What the original source was

However, C2PA credentials describe **asserted** origin and edits — they do not prove that the depicted event is true. The UI should expose a restrained "Content details" action and never place decorative "AI verified" pills over the artwork.

## Definition of done

This department is not flagship-complete until a user can start on one device, recover and continue on another, collaborate without silent loss, schedule without immediate publication, survive an ambiguous network outcome, and trace every public object to one immutable revision and verified media set. All three content types must use the same lifecycle semantics while retaining their distinct creative tools.

**Current status: PARTIAL — BACKEND CAPABILITY BLOCKER.** The repository has strong local and publication primitives, but they are not yet one end-to-end system.
