# SDD ledger ‚Äî plan: .flagship/sdd (Editor & Upload campaign)

BASE: 03153b2 (feat/product-detail-contract-media-device-closure)

## Rulings
- Ruling: Full migration = shared XHR transport (extracted from UploadManager) adopted by listing queue + profile upload; NOT wholesale adoption of creator UploadManager for listings ‚Äî couples listing publication contract (finalizationId/publicUrl, scope listing_media) to creator finalization semantics without backend verification. Cost if wrong: listing publish breaks; follow-up requires backend work.
- Ruling: Video trim deferred ‚Äî no trim capability in expo-video ~57; native module decision required; fabricated trim UI would violate honesty charter. Wave 2C ships real poster-frame thumbnails instead.
- Ruling: Wave 1A fix round 1 (memory): xhrPutFile must use native streaming send({uri}) on native, fetch‚Üíblob on web only; queue size probe via FileSystem.getInfoAsync on native. Cost if wrong: none ‚Äî restores original creator behavior exactly.

## Task 1A (upload transport migration)
- Task 1A: fix round 1/5 (3 addressed, 0 open ‚Äî native streaming restored, blob option added, queue size probe via FileSystem; commits: uncommitted working tree)
- Task 1A: review verdict SPEC ‚ùå / QUALITY NOT APPROVED ‚Äî 2 Critical, 7 Important, 9 Minor
- Task 1A: minor (deferred): #10 jitter +0-25% not ¬±25% (consistent with UploadManager; acceptable)
- Task 1A: minor (deferred): #11 retry loop 4 total attempts vs "3 attempts" wording (pre-existing bound)
- Task 1A: minor (deferred): #13 getState/getItems return live items array
- Task 1A: minor (deferred): #14 snapshot persists live asset object with stale fileSize
- Task 1A: minor (deferred): #15 web fetch response.ok not validated in transport
- Task 1A: minor (deferred): #16 xhr onload/onerror/ontimeout not nulled in cleanup
- Task 1A: minor (deferred): #17 addAssets unreachable URI-conflict branch (pre-existing)
- Task 1A: minor (deferred): #18 processQueue recursive self-spawn (pre-existing pattern)

## Task 1B (crop integration)
- Task 1B: complete (uncommitted working tree, review pending final wave review)

## Wave 2
- 2A focal previews: brief written, pending dispatch
- 2B straighten+reset: brief written, pending dispatch
- 2C video thumbnails: brief pending; trim deferred per ruling

## Wave 2 progress
- Task 1A: fix round 3/5 (3 addressed, 0 open ó native blob fallback removed w/ throw, opId bump atomic before abort, per-type AbortController wired into uploadMedia)
- Task 2A: complete (FocalImage + strip/cover consumption + focal threading; focal re-normalization delegated to sheet owner)
- Task 2B: complete (straighten + reset + readouts stripped; then focal re-normalization follow-up complete via mapFocalToOutput)
- Task 2C: complete (videoPoster.ts + VideoPosterThumb; cover poster skipped ó compat Video posterSource never unmounts, compat bug noted)
- Ruling: focal is presentation-only for now (stored on draft item, not sent to backend) ó media-attach contract extension requires backend work; parked.
- Ruling: straighten at theta!=0 outputs centered max-inscribed rect of current crop aspect; drag/pinch suspended while straightened; preview === output exactly. Cost if wrong: power users lose offset control while straightening ó acceptable, honest.
- Wave 1+2 verification: typecheck PASS; vitest 7 failed/1730 passed = exact pre-existing baseline; zero new failures.
- Adversarial review of Waves 1+2 dispatched (agent 50332af7)

## Adversarial review remediation (Waves 1+2)
- Review verdict: FINDINGS ó 2 P0, 7 P1, 8 Minor
- Task 1A: fix round 4/5 (P0-1 per-instance storage keys, PUT timeout 120s, guarded performance.mark, cancelled-retryable restore path, addAssets hydration await, removeItem abort, restore attemptCount fix, 3-attempt loop, profile stale-abort removed)
- Task 2B: fix round 2 (crop-frame rotation layer, focal tap surface moved inside transform wrapper for source-space coords, fake Auto-Detect button removed)
- Ruling: reviewer's preview-transform reorder REJECTED by implementer with RN 0.86 Transform.cpp/TouchTargetHelper evidence (row-vector application; last entry acts first; current order = flip-first = matches output). Accepted on mechanical simulation + numeric parity. Cost if wrong: flip+rotate preview mismatch ó final reviewer re-adjudicates.
- Task 2A: fix round 2 (P0-2 coverUri from queue result, P1-7 no stale focal overwrite, P1-12 queue reset on save/unmount, P1-13 ph:// copyAsync + kind!=='video' guard)
- Task 1A: minor (deferred): #15 other uploadMedia consumers (chat/review/report/verification/support/appeal) not wired to progress/abort ó different departments, out of Editor & Upload scope
- Task 1A: minor (deferred): #16 non-null assertions partially pre-existing; runtime validation deferred to contract-hardening pass
- Task 2A: minor (deferred): focal not sent to backend (media-attach contract extension) ó parked with UploadManager-for-listings follow-up
- Task 1A note: unnamed queues restore across restart only in same construction order; surfaces needing guaranteed durability pass explicit storageKey
