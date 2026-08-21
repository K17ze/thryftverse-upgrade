# Research-Driven Upgrade Loop

> Companion to the Visual Flagship Convergence Loop. This is the research methodology that feeds each convergence-loop iteration with current, verified knowledge — not memory, not assumptions.

---

## When to run

Every convergence-loop iteration begins with this research loop. The surface contract's "before→after delta" and "observable visual outcomes" must be informed by **verified current sources**, not recalled best practices.

## The loop

```text
1. RESEARCH  — spin parallel subagents (online + codebase) for the target surface
2. SYNTHESIZE — extract concrete, actionable guidance (not vague principles)
3. IMPLEMENT — apply the guidance to the surface, one structural fix at a time
4. VERIFY    — typecheck, tests, visual gates, native-artifact pending
5. CRITIQUE  — cold-critic pass against the surface contract's observable outcomes
6. CONVERGE  — if outcomes met, move to next surface; if not, loop back to step 3
```

## Subagent dispatch policy (AGENTS.md §0)

- Main agent owns the charter and the task plan.
- Parallel subagents are short-lived, stateless workers — dispatch only for self-contained, leaf-level work (search, read, isolated edits, single-file fixes).
- Subagent prompts must inline only the specific context they need — do not paste the whole charter.
- Subagents must NOT invoke `run_subagent` themselves. No recursive delegation. One level of parallelism, then stop.
- No limit on breadth (fan-out is fine). The constraint is depth (no nesting).
- `is_background: true` for parallelisable tasks whose output is needed later; `is_background: false` when the main agent must block before continuing.

### Profile selection — quota-aware dispatch (free-tier GLM-5.2 High)

Devin runs **two separate quota buckets**: GLM-5.2 High (free tier, parent model) and SWE-1.6 (paid, default subagent model). When the SWE-1.6 weekly quota is exhausted, profile choice determines whether dispatch succeeds or fails.

| Profile | Model | Quota bucket | Tool access | Use for |
| --- | --- | --- | --- | --- |
| `subagent_general` | Parent's model (GLM-5.2 High) | Free tier — **not** exhausted | **Full** (read, write, edit, exec, web_search, webfetch, etc.) | **Default for all subagent work** — research, code changes, commands, write-capable tasks |
| `free-explorer` | Parent's free model (GLM) | Free tier — **not** exhausted | Read-only (`find_file_by_name`, `grep`, `read`) | Lightweight read-only codebase scan when you want to conserve context and don't need exec/write |
| `subagent_explore` | SWE-1.6 (default subagent model) | Paid — **exhausted** | Read-only + `web_search` | AVOID when SWE-1.6 quota is empty |

**Dispatch rules on free tier:**

1. **Default → `subagent_general`.** Full functionality on free GLM-5.2 High: `exec`, `write`, `edit`, `read`, `grep`, `glob`, `web_search`, `webfetch`. This is the profile you used before for full-capability subagents — it still works identically. Use it for research that needs `exec` or `webfetch`, for code changes, for running tests, for any write-capable work.
2. **Lightweight read-only scan → `free-explorer`.** Runs on free GLM, read-only tools only (`find_file_by_name`, `grep`, `read`). Use when you only need to search/read files and want a smaller context footprint. Cannot run `exec` or `web_search`.
3. **Do NOT use `subagent_explore`** when the SWE-1.6 weekly quota is exhausted — it will fail with "Your weekly usage quota has been exhausted" regardless of foreground/background mode.
4. **Custom GLM-pinned profiles** (`.devin/agents/glm-explore.md`, `glm-general.md` with `model: GLM-5.2 High`) require a **session restart** to be discovered — they are loaded at startup, not mid-session. After restart they appear alongside built-in profiles and provide the same free-tier bypass with customised tool sets and system prompts.

**Verified behaviour (2026-08-19):**

- `subagent_general` (foreground) → ✅ works on free GLM — **full capability confirmed**: exec (`git rev-parse`), write (created test file), read (read file back) all succeeded
- `free-explorer` (foreground + background) → ✅ works on free GLM (read-only: `find_file_by_name`, `grep`, `read` only — no `exec`, `write`, or `web_search`)
- `subagent_explore` (foreground + background) → ❌ SWE-1.6 quota exhausted
- Custom profiles created mid-session → ❌ "Subagent failed to start" (not discovered until restart)

## Research streams per surface

Each surface iteration dispatches parallel subagents for:

1. **Online research (latest 2026)** — current best practices, platform guidance (iOS 26 / Android 16), flagship app patterns, psychology/cognitive fluency. Use `web_search` + `webfetch`. Verify against live sources. Return source URLs + concrete guidance + how it applies to this codebase.

2. **Codebase trace** — the full end-to-end implementation map of the target surface. Every coupled layer. Every defect. Every anti-pattern. Return file paths, line numbers, exact findings. For any surface that renders data, this stream **must** produce the data-path trace (DB → API → serializer → hook → state → UI) required by the live-signs convergence loop, and flag whether the surface is rendering real endpoint data or mock/hardcoded/fabricated data. A surface on mock data is a live-signs failure, not a visual task.

3. **Next-surface mapping** — the structural map of the NEXT surface in the loop, so its contract can be written while the current surface is being implemented.

4. **Component-specific research** — the target surface's key primitives (e.g. for Creator: ContextToolRail, MediaBrowserSheet, CreatorEntryScreen). How they decide what to show, where they expose too much complexity, where the interaction model needs art direction.

## Synthesis rules

- Research findings must be **concrete and actionable**, not vague principles. "Use progressive disclosure" is useless; "reduce primary tools from 6 to 4, move Timeline behind More for single-photo documents" is actionable.
- Every finding must include **the observable interaction outcome** it produces (e.g. "editor exposes no more than 4 immediately relevant actions before More").
- Research findings that contradict the codebase's documented decisions (e.g. the 3:4 portrait standard) are noted but not applied in a single-surface pass — they go to the surface contract's "out of scope" section.
- Research findings that reveal a functional defect (e.g. Reanimated 4.x scroll handler incompatibility) are applied immediately, regardless of scope.

## What this is NOT

- This is not a research dump. Research that doesn't lead to implementation is not completion (AGENTS.md §3).
- This is not a one-time pass. Each surface re-researches as needed when the loop returns to it.
- This is not a substitute for the cold critic. Research informs; the cold critic judges the rendered artifact.
- This is not a substitute for the live-signs loop. For functional surfaces, the "codebase trace" stream (below) must produce the **data-path trace** required by `.devin/workflows/live-signs-convergence-loop.md` (DB → API → serializer → hook → state → UI). Research that confirms a screen is rendering mock/hardcoded data must halt the visual loop and trigger the live-signs loop first. AGENTS.md §37 is binding alongside §31.

## EAS audit feedback intake

Human review of an EAS build outranks an agent's static confidence. Convert each reported weakness into one surface-contract delta before more implementation:

```text
build identifier → route → exact state → viewport/device → screenshot/recording
→ what visually dominates incorrectly → one measurable target → rework same surface
```

- A report such as “search suggestions look degraded” reopens the focused-search surface; it does not authorize a new department-wide styling pass.
- Do not move to the next surface while the reported state lacks a new native artifact.
- If the agent cannot access the audited build, complete engineering gates and use `IMPLEMENTED — NATIVE DEVICE VALIDATION PENDING`; the next user-supplied capture becomes the cold-critic input.
- Track repeated cross-screen defects, but change a shared primitive only after one corrected surface proves the new grammar.
