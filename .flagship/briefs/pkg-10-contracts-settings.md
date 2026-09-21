# PKG-10 — Contract & test closure: notification registry, seller performance, review photos, distribution dates, settings freshness, font caps

Repo root: C:/Users/User/Desktop/thryftverse-upgrade (HEAD 76c0733). Audit: ThryftVerse-Post-Upgrade-Audit-2026-09-20.md §2.2-2.3 + Appendix B (FRESH-11, FRESH-12).

## Findings to close

### T1 — backend focused test failures (9 failures in notification/seller/review rerun)
Run first with a dummy DATABASE_URL (e.g. `DATABASE_URL=postgres://localhost:1/x`) to satisfy import config:
`cd backend/api && node --import tsx --test src/__tests__/notificationContract.test.ts src/__tests__/sellerPerformance.test.ts src/routes/supportReviews.test.ts` (adjust to actual filenames — the audit ran a 70-test subset: notificationContract + sellerPerformance + review-photo route tests).
Known specifics:
- **Notification contracts**: Co-Own alert and DRIP event types absent from one central declaration; `smart_sell_decision` lacks a push category; another emitter lacks a literal eventType. Fix at the source: consolidate the typed event registry so every emitted eventType is declared with channel/preference/deep-link mapping. Find emitters via grep and reconcile them into the central declaration — do not just add strings to satisfy the test.
- **Seller performance**: three assertions disagree with boost multipliers. Investigate whether implementation or fixture is wrong per the business contract; fix whichever is incorrect — do not blindly change tests to pass. Document your determination in the report.
- **Review photos**: two route tests get 422 instead of 200. Find the validation rejecting them; fix validation or fixture per the real contract (auth/validation must remain enforced — the test should exercise the authorized happy path).

### T2 — distribution-date timezone failure
`frontend/src/components/coown/CoOwnDistributionCalendar.tsx:63-70` formats `new Date(iso).toLocaleDateString('en-GB')` with no timezone; in America/Chicago, `2026-09-15T00:00:00Z` renders Sept 14; test expects 15. The audit requires a CONTRACT DECISION, not a regex loosening: record/ex/payable dates are civil business dates — implement a formatter that renders the UTC calendar date regardless of device timezone (e.g. format with `timeZone:'UTC'` or parse the date part), and add an explicit comment/doc noting the business-date contract. Check other money-date formatters in `frontend/src/utils/` for the same bug pattern; fix the shared helper if one exists.

### FRESH-11 — settings identity/freshness
`frontend/src/hooks/settings/useSettingsScreenData.ts:33-52` doesn't clear balance on identity change while hook is retained, and coalesces malformed successful snapshots to zero. Fix: scope the snapshot to the account identity — clear/reload on user-id change; malformed/partial payloads → "unavailable" state, never fabricated zero.

### FRESH-12 — font-scale cap inconsistency
`frontend/src/components/ui/AppSegmentControl.tsx:141` caps at 1.3; `components/home/HomeFeedHeader.tsx:201,205,294` caps key text at 1.4/1.5. Establish ONE documented policy: find the shared text component/theme tokens (`src/theme/`, shared Text wrapper) and align caps to a single grammar — compact utility text gets one cap, headings another. If a shared cap constant exists, use it; if not, introduce `MAX_FONT_SCALE` tiers in the theme module and migrate these call sites. Do not remove caps — large-text safety is intentional; make them consistent and named.

## File ownership
- EXCLUSIVE (backend): `backend/api/src/__tests__/notificationContract.test.ts` + the central notification/event registry file it checks (find it — likely under `src/lib/` or `src/domain/`), `backend/api/src/__tests__/sellerPerformance.test.ts` + the boost-multiplier implementation it covers, `backend/api/src/routes/supportReviews.test.ts` + the review-photo route file, NEW test files. Do NOT edit `outboxDrainHandler.ts` or `coOwn*.ts` (owned by another package) — if a fix genuinely requires those files, note it in the report instead.
- EXCLUSIVE (frontend): `frontend/src/hooks/settings/useSettingsScreenData.ts`, `frontend/src/components/ui/AppSegmentControl.tsx`, `frontend/src/components/home/HomeFeedHeader.tsx`, `frontend/src/components/coown/CoOwnDistributionCalendar.tsx`, `frontend/src/utils/` date-formatter file(s), `frontend/src/theme/` font-scale constant location, NEW test files.
- Read-only: everything else.

## Constraints
- Business-contract judgment required: when test and implementation disagree, determine intended behavior from surrounding code/migrations/docs, fix the wrong side, and explain in the report.
- `npx tsc --noEmit` clean for touched files (backend and frontend). Run only your focused tests. No commit.

## Report
`.flagship/reports/pkg-10-report.md` — per-finding closure table + business-contract determinations. Return: status, files changed, one-line test summary.
