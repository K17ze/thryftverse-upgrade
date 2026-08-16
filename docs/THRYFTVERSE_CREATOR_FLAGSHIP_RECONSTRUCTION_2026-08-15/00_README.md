# ThryftVerse Creator Flagship Reconstruction — Research + Implementation Pack

**Created:** 15 August 2026  
**Repository:** `K17ze/thryftverse-upgrade`  
**Branch audited:** `feat/product-detail-contract-media-device-closure`  
**Live HEAD audited:** `7273211383f6553bd6813a824140a99d50555111`  
**Scope:** Poster creation, Look creation, capture/import, media browsing, photo/video editing, collage composition, direct manipulation, tools, timeline, drafts, upload, publish, accessibility, performance, visual QA.

## Why this pack exists

The creator department no longer has a "missing feature count" problem. It has a **creative-instrument quality problem**.

The branch already contains:
- separate Poster and Look composers;
- camera capture + recording;
- media gallery selection;
- a layer-based document model;
- direct canvas transforms;
- text, stickers, interactive stickers, music/data placeholders;
- crop/manual trace tooling;
- templates, drafts, history;
- publish/upload code;
- Skia, Reanimated, RNGH, Expo Camera, Expo Video and media libraries.

Yet it can still *feel* years behind Instagram/Snapchat because capability is being surfaced through too many generic sheets, controls and configuration modes rather than through a small number of fluent creative gestures and preview-first choices.

This pack therefore does **not** recommend "add more buttons". It reconstructs the interaction grammar.

## Current verdict

The user's **1/10 perceived-quality reaction is understandable**, especially if judged purely on first-use visual polish, flow confidence and editor delight. From the code, however, the subsystem is not technically 1/10; its capability foundation is materially stronger.

A more useful dual score is:

| Dimension | Current estimate | Flagship target |
|---|---:|---:|
| Capability coverage | 6.3/10 | 9.0+ |
| Camera foundation | 5.8/10 | 9.0+ |
| Poster temporal editing | 2.8/10 | 9.0+ |
| Look collage workflow | 4.2/10 | 9.0+ |
| Direct-manipulation fluency | 4.5/10 | 9.0+ |
| Tool discoverability / IA | 3.0/10 | 9.0+ |
| Visual orchestration | 3.1/10 | 9.0+ |
| Draft / project resilience | 3.6/10 | 9.0+ |
| Upload / publish resilience | 4.5/10 | 9.0+ |
| Accessibility / gesture alternatives | 5.0/10 | 9.0+ |
| **Overall flagship readiness** | **~4.1/10** | **9.0+** |

These are design-audit judgments, not laboratory measurements.

## Core diagnosis in one sentence

> **ThryftVerse has built an editor toolbox; Instagram/Snapchat behave like creative instruments.**

A toolbox asks the user to keep choosing modes.  
A creative instrument lets the user touch the thing they want to change, see options where they are looking, preview results before committing, and always get a good default.

## Recommended reading order

1. `01_EXECUTIVE_VERDICT_AND_SCORECARD.md`
2. `02_AUGUST_2026_COMPETITIVE_RESEARCH_REPORT.md`
3. `03_CODEBASE_FORENSIC_AUDIT.md`
4. `04_CREATOR_PSYCHOLOGY_AND_INTERACTION_PRINCIPLES.md`
5. `05_POSTER_RECONSTRUCTION_SPEC.md`
6. `06_LOOK_RECONSTRUCTION_SPEC.md`
7. `07_MEDIA_TOOLCHAIN_CAMERA_TIMELINE_TEXT_EFFECTS.md`
8. `08_ARCHITECTURE_DATA_MODEL_PERFORMANCE_PIPELINE.md`
9. `09_VISUAL_SYSTEM_MOTION_ACCESSIBILITY.md`
10. `10_IMPLEMENTATION_ROADMAP_AND_ACCEPTANCE_MATRIX.md`
11. `11_VISUAL_QA_AND_DEVICE_TEST_PLAN.md`
12. `12_AGENT_IMPLEMENTATION_PROMPTS.md`
13. `13_SOURCE_REGISTER.md`

## Non-negotiables

- Do not clone Instagram or Snapchat's branding.
- Do benchmark their **interaction compression, preview-first design, hierarchy and recovery**.
- Poster and Look remain separate product mental models.
- The media is the hero; chrome must lose visual weight.
- Tool presence is not parity. Tool quality includes entry → interaction → feedback → undo → recovery → output.
- No fake "Cutout": true transparent subject segmentation or call it `Crop`.
- Video cannot be considered flagship until the user has a real temporal editor.
- Drafts must survive app restarts and media-cache changes.
- Publish must survive flaky networks without losing the project.
- Every complex drag gesture needs an accessible alternative.
- No phase can claim completion without real-device screenshots and interaction recordings.
