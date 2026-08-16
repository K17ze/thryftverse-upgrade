# Native Visual QA and Automation Prompt

## Mission

Prove the three product-detail families on the native rendering stack. Source analysis and web snapshots are supporting evidence only.

## Matrix

Widths: 320, 360, 390, 430  
Appearance: light, dark  
Text: normal, largest supported accessibility size  
Motion: standard, reduced  
Platforms: current supported iOS and Android versions  
Roles/states: all applicable rows in `09_STATE_ROLE_AND_FAILURE_COVERAGE_MATRIX.md`

Use pairwise reduction only after every P0/P1 visually distinct state has full representative coverage.

## Automation

- Seed deterministic fixtures through supported APIs.
- Record fixture/contract version in the manifest.
- Navigate from a real entry surface.
- Capture after fonts/media/state settle.
- Add runtime assertions for action eligibility and media index.
- Keep screenshot thresholds strict; review and approve intentional changes.

## Manual passes

- VoiceOver and TalkBack;
- keyboard/switch focus where supported;
- swipe/pinch/video controls;
- background/foreground;
- slow/offline/reconnect;
- long localized strings;
- safe areas and keyboard;
- 200%/largest text;
- reduce motion.

## Review rubric

Score 0–10 for:

- first-viewport hierarchy;
- object/media treatment;
- family distinctiveness;
- transaction clarity;
- evidence/trust clarity;
- state legibility;
- typography/spacing;
- dark mode;
- accessibility;
- perceived polish.

Two reviewers should record independent scores. Any category below 8.0 requires a documented fix or explicit accepted exception.

## Deliverables

- screenshot folder;
- machine-readable manifest;
- visual-regression output;
- manual accessibility notes;
- video clips for carousel and realtime transitions;
- populated final report;
- exception register with owner/date.

Do not mask the transaction instrument, media stage or state badges in visual tests.

