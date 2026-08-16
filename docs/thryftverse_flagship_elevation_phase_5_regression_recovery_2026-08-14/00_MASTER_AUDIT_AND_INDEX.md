# Phase 5 Master Audit & Index

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Executive conclusion

Phase 4 improved architecture but regressed visual authorship in several places. The clearest examples are:

- Home commerce tiles were simplified until product identity largely disappeared.
- Notifications were simplified into a mixture of `All/Unread`, semantic overflow filters and time sections — three overlapping taxonomies rather than one confident attention model.
- Co-Own positions had to be explicitly restored after a flattening pass turned a horizontal visual rail into ordinary vertical rows.
- frontend-only development can show curated fixture listings while full-stack mode shows materially different backend records, so design quality changes depending on which data source is active.
- “small” flows such as Create Group still contain affordances that visually promise functionality without implementing it.

The remaining gap is not one thing. It is an interaction between:

**design system over-generalization + weak frontend/backend presentation contracts + incomplete long-tail flows + missing native release evidence.**

## Phase 5 heuristic quality scores

These are source/repository heuristics, not moderated usability scores.

| Area | Current | Target |
|---|---:|---:|
| Home discovery cards | 5.5/10 | 9.2+ |
| Notification attention UX | 5.8/10 | 9.2+ |
| Fixture ↔ backend visual parity | 4.5/10 | 9.5 |
| Product-detail foundations | 8.0/10 | 9.3 |
| Sell workflow | 7.5/10 | 9.2 |
| Auction architecture | 8.0/10 | 9.3 |
| Co-Own architecture | 8.2/10 | 9.4 |
| Creator architecture | 8.0/10 | 9.2 |
| Messaging core | 7.8/10 | 9.2 |
| Small social/group flows | 6.0/10 | 9.0 |
| Backend presentation contracts | 6.3/10 | 9.4 |
| Frontend domain-model hygiene | 6.5/10 | 9.3 |
| CI/release evidence | 6.0/10 | 9.7 |
| Human-authored impression | 6.6/10 | 9.4 |

## P0 findings

### P0-1 — visual dataset parity is broken

Development defaults to `fixture-design`. If the API fails or returns no listings, `BackendDataContext` substitutes curated `MOCK_LISTINGS/MOCK_USERS`. If the backend returns real rows, those fixtures disappear.

This means the app can be designed against one high-density dataset and shipped against another.

The context also reports its source as `api` even when fixture data is substituted, making diagnostics misleading.

### P0-2 — current HEAD is not release green

Current GitHub Actions is failing:
- Expo Doctor reports 15 dependency-version mismatches.
- the visual golden test intentionally fails because reviewed iOS and Android screenshot baselines do not exist.

Typecheck, design lint, residue and Maestro YAML pass, but a production branch cannot call those two failures “expected” and simultaneously claim flagship completion.

### P0-3 — notification presentation is guessing domain semantics

The UI still infers some notification categories from `payload.event`, `title` and `body` text. Aggregation uses presentation strings/regex. This is fragile, non-localizable and impossible to art-direct reliably.

### P0-4 — visual rules need product roles

Phase 4’s own repair commit is evidence that “flat is premium” was applied too broadly. Phase 5 introduces role-specific visual contracts.

## Core doctrine

> **Utility should be flat. Content should be expressive. Transactions should be explicit. Evidence should be document-like. Editorial should have compositional freedom. Attention should be prioritized.**

## Read order

1. `01` Phase 4 regression validation.
2. `02–04` runtime/data parity and role-aware design.
3. `05–08` Home and Notifications.
4. `09–10` group/social long-tail.
5. `11–24` department audits.
6. `25–30` architecture/engineering/human-authorship.
7. `31–34` QA and state matrices.
8. `35–39` research, code evidence, roadmap and master prompt.
9. `40–44` deep visual wireframes and contract tests.
