---
auto_execution_mode: 0
description: Research a product or engineering decision, map it to the live codebase, and turn evidence into one bounded implementation slice
---

# Research-Driven Upgrade Loop

Use this workflow when a decision depends on current platform behavior, external
standards, competitor capabilities, user psychology, or unfamiliar repository
architecture. Research is an input to implementation, not the deliverable.

## Required inputs

Record before searching:

- the user outcome and decision to make;
- the exact surface, service, or release path in scope;
- what may have changed since the repository was written;
- the evidence needed to change the current design;
- the maximum implementation slice that can be reviewed and rolled back alone.

If the question is stable and answerable from repository source-of-truth, do not
browse merely to make the work look researched.

## 1. Repository evidence first

This workflow operationalizes the mandatory research-to-implementation protocol
(AGENTS.md §25). The binding 6-stage sequence is:

```text
1. CODEBASE RESEARCH     → understand the current implementation end-to-end
2. REFERENCE RESEARCH    → study supplied reference images / apps deeply
3. ONLINE RESEARCH       → find the maximum best current practices and patterns
4. FLAGSHIP SYNTHESIS    → combine codebase + references + best practices into a target
5. IMPLEMENT             → write the change in the production TSX/files
6. VERIFY + CRITIQUE     → render, criticise, correct, render again
```

Skipping a stage is a process failure, even if the output looks reasonable. Stage 3
(online research) is the stage agents most often skip — do not. Verify current library
APIs and platform guidance against online sources; they drift. Cite the source when it
changes a decision.

Capture the workspace root, Git root, remote, branch, HEAD, dirty paths, and
applicable `AGENTS.md`. Preserve unrelated work. Then trace the target in both
directions:

```text
route → screen → state/hooks → service → API → transaction/storage/worker
storage/worker → contract/serializer → service/cache → state → screen → route
```

For every important claim, record the owner file and whether the behavior is
reachable, tested, live-verified, native-verified, or only asserted. Search
manifests and CI before naming a command. Never invent an endpoint, script,
environment, benchmark result, or product capability.

## 2. External research only where freshness matters

Use this source order:

1. current official platform documentation, standards, specifications, and
   first-party release notes;
2. primary research papers or first-party engineering publications;
3. vendor documentation for that vendor's own product behavior;
4. independent measurement for comparative observations, labelled as such.

Record title, publisher, URL, publication/update date when visible, access date,
and the exact decision supported. Search results and AI summaries are discovery
tools, not evidence. Resolve contradictions against a primary source or mark the
decision uncertain.

Research agents are read-only leaf workers by default. Give each one a bounded
question and output schema; do not delegate product ownership or final approval.
If parallel workers are unavailable, run the same streams sequentially.

## 3. Evidence ledger

Maintain this compact ledger in the task notes or dated report:

| Claim or question | Repository evidence | External source | Confidence | Decision impact |
|---|---|---|---|---|
| What is true now? | file:line / command result | URL + date | high/medium/low | keep/change/defer |

Reject a recommendation when it cannot identify an observable user, reliability,
security, accessibility, performance, or operability outcome.

### Research pack routing (AGENTS.md §28)

The flagship research library is a reference corpus, not a prompt to load wholesale.
When supplied research conflicts, resolve in this priority order:

```text
user requirement (explicit, current task)
  → screen-specific research (department report for this surface)
    → component research (primitive-level report)
      → generic research (cross-cutting principles)
```

A higher tier overrides a lower tier. Generic research never overrides a
screen-specific finding. A finding about feed masonry does not apply to a settings
screen; a finding about media focal points does not apply to a text-only confirmation
sheet.

## 4. Translate psychology into mechanics

Do not use psychology as decorative vocabulary. For each finding state:

```text
human tension → product mechanic → observable outcome → counter-metric
```

Useful tensions include uncertainty, interruption, social pressure, choice
overload, recognition versus recall, spatial continuity, cost of error, and loss
of control. Examples:

- uncertainty → explicit send states and recovery → user can distinguish queued,
  sent, delivered, failed, and unknown outcome → do not increase notification noise;
- choice overload → progressive disclosure → one primary action is identifiable
  without reading → expert actions remain reachable;
- spatial discontinuity → stable geometry → loading and final states do not jump
  → reduced-motion users receive equivalent clarity.

Never infer a universal law from a benchmark app. Explain the mechanism, the
context in which it helps, and the failure mode it could introduce.

## 5. Synthesize a decision, not a dump

Produce a decision matrix:

| Candidate | Decision | Why it fits this repository | Observable outcome | Risk / rollback |
|---|---|---|---|---|
| Existing pattern | keep / upgrade / add / defer / reject | code evidence | measurable result | containment plan |

Write one bounded slice with:

- source-of-truth owner and coupled layers;
- files expected to change;
- full state matrix;
- acceptance evidence;
- security/privacy/accessibility implications;
- rollback or forward-fix path.

Separate dated market observations from durable repository policy. Never place
model availability, quotas, temporary account state, rumours, or unverified future
features in a committed workflow.

## 6. Implement and converge

Implement the highest-value slice in the canonical files. Then run the relevant
specialist workflow:

- rendered UI: `visual-flagship-convergence-loop.md`;
- data, mutations, realtime, or trust: `live-signs-convergence-loop.md`;
- messaging: `message-department-convergence-loop.md`;
- signed build or OTA release: `mobile-release-loop.md`.

Research that does not alter a decision or implementation is archived as context,
not presented as completion.

## 7. Output and stop conditions

Report:

- snapshot branch/HEAD and dirty-state note;
- research date and primary sources;
- current implementation trace;
- decision matrix and rejected alternatives;
- implemented slice and scoped diff;
- commands, exit codes, live/native evidence, and not-run reasons;
- remaining uncertainty and the next decision—not the next department.

Stop and request direction when evidence conflicts on a material product decision,
production access would be required, or the necessary scope exceeds the approved
slice. Use the lowest honest completion status from `AGENTS.md`.

## Maintained research basis

Reviewed 25 August 2026: [Devin workflow guidance](https://docs.devin.ai/desktop/cascade/workflows),
[Google engineering review practices](https://google.github.io/eng-practices/review/),
[NIST SSDF](https://csrc.nist.gov/projects/ssdf), and
[WCAG 2.2](https://www.w3.org/TR/WCAG22/). Recheck volatile platform guidance
at execution time.
