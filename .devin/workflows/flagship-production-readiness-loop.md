# Flagship Production Readiness Loop

> **Authority:** Use this loop for repository-wide parity/readiness requests.
> It coordinates the visual convergence and live-signs loops; it does not
> replace either. A broad audit always resolves into bounded vertical slices.

## 1. Principle

The repository is not flagship because a file, package, route, migration, or
component exists. It is flagship only when the user-visible capability works in
the signed native artifact, through the live backend, under failure and recovery.

```
inventory → prove reachability → trace contract → reproduce → fix one slice
→ static gates → live gates → native capture → cold critique → rework → sign-off
```

## 2. Evidence ladder

Use the lowest honest status reached by a capability:

| Level | Evidence | Permitted statement |
|---:|---|---|
| 0 | prose, TODO, claim | proposed |
| 1 | file/package exists | scaffolded |
| 2 | canonical import/route registered | reachable candidate |
| 3 | types and focused tests pass | engineering-ready candidate |
| 4 | pristine migration/build succeeds | deployable candidate |
| 5 | live endpoint/provider/worker succeeds | live-verified |
| 6 | signed release artifact succeeds on device | native-verified |
| 7 | benchmark comparison, rework, accessibility/perf matrix, human acceptance | signed off |

Never translate levels 0–4 into “production,” “complete,” “flagship,” “closed,”
or “parity.” A capability’s department score is capped by its lowest critical
dependency.

## 3. Repository-wide audit fan-out

The main agent may dispatch leaf-only audits for:

1. visual product/navigation/accessibility;
2. creator/media/Skia/upload/export;
3. backend/data/security/providers;
4. release/EAS/CI/operations.

Each audit must return exact code locations, canonical route/import evidence,
failure modes, current official sources, and a ranked P0/P1/P2 list. Subagents
do not declare completion and do not spawn other agents.

## 4. Claim-to-evidence reconciliation

For every `COMPLETE`, `Closed`, `production-ready`, `wired`, or `verified` claim:

1. locate the executable owner;
2. prove it is registered and used;
3. prove schema/config compatibility;
4. run the smallest relevant test;
5. require live evidence for external systems;
6. require native evidence for visible behavior;
7. downgrade the documentation when evidence is missing.

File-presence tests, filename-parity tests, 1×1 images, mocks, source analysis,
and comments are never native visual evidence.

## 5. Selecting the implementation slice

Choose the smallest slice that removes the largest user or release risk.
Priority is:

1. crash, data loss, money ambiguity, privacy/security, false trust;
2. dead primary interaction or broken route;
3. upload/publication durability and WYSIWYG mismatch;
4. first-viewport composition and media geometry;
5. shared primitive inconsistency;
6. secondary polish.

Trace both directions before editing:

```
route → screen → state → service → API → transaction → rows/workers
rows/workers → serializer → API → service/cache → state → screen → route
```

## 6. Visual and functional convergence

After the slice reaches engineering-ready:

- Run `.devin/workflows/live-signs-convergence-loop.md` for data or mutation work.
- Run `.devin/workflows/visual-flagship-convergence-loop.md` for rendered work.
- Run `.devin/workflows/upload-department-convergence-loop.md` for creator entry,
  camera, gallery, editor seeding, upload, publish, or viewer work.

No surface passes when only one loop passes.

## 7. Release integrity gates

Before “ready to deploy,” require all of the following:

- pristine database migrates through the full chain;
- upgrade rehearsal from the previous production schema passes;
- migrations are serialized and checksummed;
- workers consume every enqueued production job with retry/DLQ recovery;
- money writes are transactional, provider-idempotent, and reconcile ambiguity;
- webhook inbox records `received → processing → succeeded/failed` durably;
- backups are created, encrypted, uploaded, restored, and verified;
- queue Redis cannot evict durable job keys;
- backend/schema deployment gates the mobile release;
- EAS builds finish before update/release progression;
- OTA signing and runtime compatibility are proved;
- production provider configuration contains no mock/fail-open defaults;
- signed Android/iOS artifacts pass the native device matrix.

## 8. Creator media gates

Before claiming Poster/Looks parity:

- one renderer/evaluator owns editor, viewer, and export parameters;
- every visible tool changes rendered output or is absent;
- camera preview and captured first frame match;
- drawing coordinates are normalized and deterministic;
- crop is nondestructive or preserves format/alpha/orientation;
- timeline seek/split/trim/reverse/freeze/speed/transition controls affect playback;
- audio controls produce real playback with a single clock;
- project-owned assets survive process death;
- Android pending picker results recover;
- every composition asset has an immutable manifest entry and upload binding;
- publish uses a stable key and exposes unknown outcome with reconciliation;
- privacy, block, remix, and attribution are server-authorized;
- release-mode performance is measured on mid-range Android.

Skia is used where one high-performance compositing contract materially improves
fidelity. “100% Skia” is not a goal for ordinary accessible controls or text.

## 9. Audit report contract

Every dated report contains:

- snapshot branch/HEAD and dirty-state note;
- methodology and official research date;
- department scorecard with confidence/evidence level;
- strengths to preserve;
- P0/P1/P2 findings with code evidence;
- benchmark delta by product psychology, not copied appearance;
- stack decision matrix: keep / upgrade / add / defer / remove;
- sequenced vertical-slice roadmap;
- measurable native/live acceptance gates;
- implemented changes made during the pass;
- commands and results;
- explicit blockers and honest final status.

## 10. Loop continuation

After sign-off or honest partial status:

1. update the dated report and surface contract;
2. select the next highest-risk bounded slice;
3. repeat from claim-to-evidence reconciliation;
4. never mass-propagate a visual pattern before one surface passes native review;
5. never polish a capability whose backend/rendering contract is false.
