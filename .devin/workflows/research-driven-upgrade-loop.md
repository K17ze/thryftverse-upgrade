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

## Research streams per surface

Each surface iteration dispatches parallel subagents for:

1. **Online research (latest 2026)** — current best practices, platform guidance (iOS 26 / Android 16), flagship app patterns, psychology/cognitive fluency. Use `web_search` + `webfetch`. Verify against live sources. Return source URLs + concrete guidance + how it applies to this codebase.

2. **Codebase trace** — the full end-to-end implementation map of the target surface. Every coupled layer. Every defect. Every anti-pattern. Return file paths, line numbers, exact findings.

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
