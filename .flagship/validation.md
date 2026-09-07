# Co-Own validation ledger

## Passed

- Frontend TypeScript: pass.
- Backend TypeScript: pass.
- Focused frontend closure tests: 3 files, 85 tests passed.
- Complete Co-Own frontend matrix: 14 files, 211 tests passed.
- Targeted lint: 0 errors; warnings are existing localization, accessibility-hint, and max-lines policy findings.
- Live `GET /api/v1/co-own/assets?limit=1`: 200; response includes `bestBidGbp`, `bestAskGbp`, `bidDepthUnits`, and `askDepthUnits`.
- Live authenticated `GET /api/v1/users/:userId/co-own/holdings`: 200; empty holdings are represented by `items: []`.
- Live authenticated issue report: `POST /api/v1/co-own/assets/:assetId/issues` returned 201 with an authoritative open issue id.
- Public asset order projection no longer contains `userId`.

## Known blockers

- Native device capture and accessibility traversal are still pending.
- The existing `smoke:coown` script is stale: its listing fixture omits required images and currently stops at listing creation with 422. This is a test-harness defect, not an API success claim.
- The repository backend test command has a pre-existing runner mismatch for `coownMatchingProperty.test.ts` (`@vitest/runner` under Node's native test loader); the Co-Own API build and live checks remain green.
- Native visual capture and accessibility traversal remain pending because no configured native device is available in this environment.
- The implementation was adversarially re-reviewed for issue authorization/audit, mark-vs-sale truth, reserved units, self-bid exclusion, public counterparty privacy, foreground stale fail-closed behavior, and online ledger failure recovery.
