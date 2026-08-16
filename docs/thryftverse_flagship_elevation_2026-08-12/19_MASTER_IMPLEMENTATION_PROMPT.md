# Master Coding-Agent Prompt for the Flagship Elevation

> **Audit date:** 2026-08-12  
> **Repository:** `K17ze/thryftverse-upgrade`  
> **Audited branch:** `feat/product-detail-contract-media-device-closure`  
> **Audited HEAD:** `df5e9a71f3dfb60407666a9323c66c758aef1b0f`  
> **Purpose:** Next-stage visual/UI/UX production elevation. This document is implementation guidance, not a claim that reference apps should be copied 1:1.

## How to use this prompt

Paste the whole document into the coding agent together with the relevant department file. The agent must not “improve” unrelated departments in the same pass.

---

## Master implementation prompt

You are performing the next production-quality UI/UX elevation of Thryftverse.

### Repository truth
- Work from the current target branch explicitly supplied by the operator.
- Re-read the latest files before editing; do not rely on old audit assumptions.
- Preserve backend contracts unless the task explicitly requires a contract change.
- Do not introduce demo/mock/competitor-branded data into production paths.

### Product objective
Move Thryftverse from a visually fragmented ~6/10 state toward a coherent flagship marketplace/social product.

The goal is NOT:
- more cards;
- more gradients;
- more shadows;
- more animation;
- more “AI” labels;
- copying Instagram/Pinterest/Snapchat/Depop pixel-for-pixel.

The goal IS:
- content-first composition;
- clear hierarchy;
- native-feeling behavior;
- authentic media;
- restrained motion;
- reliable states;
- one visual grammar;
- one interaction grammar.

### Non-negotiable visual principles
1. Content owns the canvas; chrome recedes.
2. One visually dominant action per viewport/state.
3. Prefer whitespace/separators over cards.
4. AI is invisible assistance unless the user explicitly enters an AI/agent feature.
5. Avoid sparkle/wand/orb/AI-gradient decoration.
6. Never render fake editorial data to make a screen look populated.
7. Use motion only for continuity/state/feedback.
8. Real item photography is trust evidence; enhancement cannot fabricate condition.
9. Use progressive disclosure.
10. Maintain reduced-motion, accessibility and theme support.

### Required workflow
1. Read the department audit.
2. Inventory current components/state/data.
3. Produce a brief change map.
4. Implement P0 only first.
5. Run typecheck + affected tests.
6. Capture/describe exact before/after hierarchy.
7. Check empty/loading/error/offline/permission states.
8. Check compact width + 200% text.
9. Check dark and light.
10. Verify no unrelated routes changed.
11. Commit as one focused change.

### Required evidence in final report
- starting SHA;
- final SHA;
- changed files;
- data-contract changes;
- screenshots/paths if device capture is available;
- tests;
- visual acceptance checklist;
- known remaining P1/P2 items.

### Rejection criteria
Reject your own implementation if:
- it adds decorative UI without clarifying hierarchy;
- it adds a new card just to group related things that spacing could group;
- it introduces new local typography/radius values instead of the system;
- it leaks demo content;
- it presents “AI” as the visual identity of routine assistance;
- it removes capability rather than progressively disclosing it;
- it silently changes commerce/financial semantics;
- it makes error recovery weaker;
- it passes tests but does not materially improve the first viewport.

### Department source
Use the matching `.md` file from this audit pack as the detailed specification and implement its P0 acceptance criteria literally. Do not start P1/P2 until P0 visual review is approved.
