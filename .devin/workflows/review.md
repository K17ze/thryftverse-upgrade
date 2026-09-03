---
auto_execution_mode: 0
description: Review a defined diff for correctness, security, product truth, regressions, and operational risk without modifying it
---

# Change Review

Review is read-only unless the user explicitly asks for fixes. The objective is to
find actionable defects in the requested change, not to produce a large list.

## Required inputs

Establish the review target before analysis:

- pull request, commit range, staged diff, or working-tree diff;
- base and head SHAs;
- intended behavior and acceptance criteria;
- generated files and unrelated dirty paths to exclude.

If the target is ambiguous, infer the narrowest safe diff and state the inference.
Do not review the entire repository because the worktree is dirty.

## Review sequence

1. Capture repository root, remote, branch, HEAD, status, and applicable
   `AGENTS.md`.
2. Read the change description and inspect `--stat`, `--numstat`, renames, deleted
   capabilities, dependency/lockfile changes, migrations, and workflow changes.
3. Read the highest-risk owner files in full, then trace every changed contract
   through its callers and consumers.
4. Review data/contracts → business logic → async/concurrency → security/privacy →
   state/cache → UI/accessibility → release/operations.
5. Run the smallest non-mutating verification that can prove or disprove a finding.
   Record the command and result; do not repair code during review.
6. Re-read the final diff for accidental scope, dead paths, fabricated success,
   missing cleanup, and documentation drift.

For UI changes, inspect hierarchy, state coverage, truthfulness, touch targets,
screen-reader order, reduced motion, media crop, keyboard behavior, and native
evidence. Apply the last-mile visual acceptance checklist (AGENTS.md §30): silhouette
at 25% scale, first viewport usefulness, rhythm, corner continuity, icon consistency,
media crop/focal point, typography hierarchy, press states, skeleton-to-final
geometry, theme parity, and device matrix. For backend changes, inspect authorization,
validation, atomicity, idempotency, privacy projection, observability, migration
compatibility, and rollback. For changes touching data, endpoints, mutations, or trust
signals, verify the live-signs definition of done (AGENTS.md §37.10): real data from a
live endpoint, mutation propagation, honest state matrix including unknown-outcome,
fail-closed trust signals, transactional idempotency on money/creation, auth + privacy
projections, and no timer/subscription leak. For CI/release changes, inspect least
privilege, immutable action pins, secret exposure, environment protection, artifact
identity, and failure behavior.

## Severity and evidence

Report only findings the author can act on:

- **P0** — active data loss, security/privacy breach, money ambiguity, or release
  path that can harm production;
- **P1** — likely user-visible failure, broken contract, race, dead capability, or
  major regression;
- **P2** — maintainability or quality defect with a concrete future failure mode;
- **P3** — optional improvement; never block on personal style.

Every finding must include:

```text
[P#] imperative title
location: exact file and tight line range
trigger: the state/input/timing that exposes it
impact: what fails for the user or operator
evidence: code path, command, or reproducible reasoning
fix direction: the owner layer to change, without over-designing the patch
confidence: high or medium
```

Do not report speculative or low-confidence issues. Do not treat missing evidence
as proof of a bug; label it as an unverified gate. Pre-existing defects belong in
a short, separate appendix only when directly discovered through the changed path.

## Output

Lead with findings ordered by severity. Then list open questions and a terse test
gap summary. If there are no findings, say so and identify the residual risks or
verification not performed. Never claim native, live, security, or production
verification from static inspection.

Research basis: [Google's code review standard](https://google.github.io/eng-practices/review/reviewer/standard.html),
[what to look for](https://google.github.io/eng-practices/review/reviewer/looking-for.html),
and [small changes](https://google.github.io/eng-practices/review/developer/small-cls.html).
