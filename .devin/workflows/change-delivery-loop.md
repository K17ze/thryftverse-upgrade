---
auto_execution_mode: 0
description: Deliver one reviewable repository change from intake through scoped implementation, risk-shaped validation, and handoff
---

# Change Delivery Loop

Use this as the default entry point for a feature, fix, refactor, or operational
change. It turns broad requests into one self-contained change that preserves a
buildable repository and can be reviewed and reversed independently.

## 1. Intake contract

Write down:

- user outcome and acceptance evidence;
- files/systems explicitly in scope;
- non-goals and compatibility constraints;
- risk class: low, product, sensitive, or release-critical;
- environments/devices/providers available;
- actions requiring additional authorization.

Ask only when a missing choice materially changes the product or causes an external,
destructive, privacy-sensitive, or production action. Otherwise make and state the
narrowest reasonable assumption.

## 2. Repository preflight

Run from the open workspace before editing:

```powershell
Get-Location
git rev-parse --show-toplevel
git remote -v
git branch --show-current
git rev-parse HEAD
git status --short
rg --files -g AGENTS.md -g '!node_modules'
```

Record workspace, Git root, remote, branch, HEAD, applicable `AGENTS.md`, dirty
paths, and execution mode. Resolve any overlap with user-owned changes before
editing. Never discard, stash, reformat, or commit unrelated work.

## 3. Find the owners before proposing architecture

Search for the canonical route/import/registration before creating anything. Trace
the current behavior through all directly coupled layers and identify:

- source-of-truth owner and contracts;
- callers, consumers, persistence, cache, events, and navigation;
- existing commands in package manifests and authoritative CI;
- state, security, privacy, accessibility, performance, and release implications;
- baseline failures that predate the task.

If the decision is externally volatile or unfamiliar, run
`research-driven-upgrade-loop.md`. If the request spans multiple concerns, pick the
highest-risk vertical slice; do not turn it into a horizontal repository wave.

## 4. Plan a reviewable slice

The slice must leave every intermediate revision coherent and include its related
tests. Separate preparatory refactors from behavior changes unless the split would
create dead or unusable code. Define:

```text
owner layer → coupled layers → expected files → failure states
→ verification commands → evidence → rollback/forward-fix
```

Large-team rule: ownership and automation are how a monorepo scales. Directory
layout alone is not governance. Escalate missing ownership, duplicated CI/release
controllers, or conflicting source-of-truth rather than adding another parallel
implementation.

## 5. Implement at the owner layer

Use canonical files, repository patterns, strict types, and the smallest useful
abstraction. Preserve working handlers, navigation, contracts, accessibility,
virtualization, and recovery. Add no placeholder controls, fabricated data, fake
success, speculative APIs, or TODO-only capability.

Route specialist work as needed:

- functional/data: `live-signs-convergence-loop.md`;
- visual/native UI: `visual-flagship-convergence-loop.md`;
- messaging: `message-department-convergence-loop.md`;
- release/OTA: `mobile-release-loop.md`.

## 6. Validate by risk

Start focused and widen only after the slice is stable:

| Risk | Minimum evidence |
|---|---|
| low docs/config | syntax/link/command resolution + scoped diff |
| product logic | typecheck + focused unit/contract tests + state verification |
| sensitive data/money/privacy | integration, authorization, concurrency, idempotency, recovery |
| native UI | focused gates + physical/signed artifact capture and accessibility |
| release-critical | authoritative CI + staging artifact + rollout/rollback rehearsal |

Resolve exact commands from manifests. Record command, working directory, exit
code, and relevant output. Never present a check not run as passed.

## 7. Review and handoff

Inspect `git diff --stat`, `--numstat`, and the complete scoped diff. Confirm every
substantial deletion preserves capability, every new dependency has an owner, and
documentation matches behavior. Use `review.md` for an independent findings pass.

The handoff includes starting/final branch and HEAD, files changed, visible and
functional outcomes, preserved/fixed/removed interactions, states, accessibility,
commands/results, native/live validation, blockers, rollback, and the lowest honest
status required by `AGENTS.md`.

### Completion standard (AGENTS.md §22)

A task is complete only when:

- requested screens were visibly improved to flagship quality;
- working functionality was preserved;
- navigation is correct;
- every visible control is truthful;
- relevant states are complete;
- TypeScript passes;
- the diff contains no unrelated work;
- no fake success or fake data remains;
- remaining blockers are explicitly reported.

Use one honest status:

```text
COMPLETE — TARGET MET
IMPLEMENTED — NATIVE DEVICE VALIDATION PENDING
PARTIAL — VISUAL TARGET NOT MET
PARTIAL — INTERACTION FAILURES REMAIN
PARTIAL — BACKEND CAPABILITY BLOCKER
BLOCKED — INCORRECT REPOSITORY OPEN
BLOCKED — REFERENCE IMAGES UNAVAILABLE
BLOCKED — RUNTIME FAILURE
```

For tasks touching data, endpoints, mutations, or trust signals, completion also
requires the live-signs definition of done (AGENTS.md §37.10, see
`live-signs-convergence-loop.md`).

### Final response format (AGENTS.md §23)

Every implementation report must include:

```text
Workspace:              Starting branch:        Starting HEAD:
Final branch:           Final HEAD:             Files changed:
Visible improvements:   Interactions preserved: Interactions fixed:
Controls removed:       Navigation changes:     Loading/empty/error states:
Accessibility:          TypeScript:             Tests:
Native validation:      Remaining visual weaknesses:
Remaining interaction issues: Backend blockers:
Commit SHAs:            Final status:
```

Do not commit, push, open a PR, deploy, change repository settings, or message an
external party unless the user requested that action.

## Tooling compatibility note

Official Devin Desktop guidance reviewed 25 August 2026 describes manual Cascade
workflows in `.windsurf/workflows` with a 12,000-character limit, while reusable
cross-agent procedures belong in skills. This repository keeps `.devin/workflows`
because it is user-requested project infrastructure. Do not assume automatic
discovery; propose a reviewed migration/mirror to `.agents/skills` or the current
supported location as a separate change.

Research basis: [Devin workflows](https://docs.devin.ai/desktop/cascade/workflows),
[Devin skills](https://docs.devin.ai/product-guides/skills),
[Google small changes](https://google.github.io/eng-practices/review/developer/small-cls.html),
and [Google version control](https://abseil.io/resources/swe-book/html/ch16.html).
