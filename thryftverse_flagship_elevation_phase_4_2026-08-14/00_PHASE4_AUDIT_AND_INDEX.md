# Phase 4 Audit & Implementation Index

> Audit date: 2026-08-14  
> HEAD: `f1ca7b09`  
> Branch: `feat/product-detail-contract-media-device-closure`

## Executive diagnosis

Phase 3 closed the five largest architecture gaps. The application now has correct product architecture, real agent security, honest state representation, and a clean codebase. The remaining gap is **optical refinement and runtime implementation**.

## Phase 3 completion summary

| Work package | Status | Commits |
|---|---|---|
| Agent Capability Broker | ✅ Complete | `acd3c0a5` |
| Poster frame-native composer | ✅ Complete | `633c7541` |
| Agent draft vs sent distinction | ✅ Complete | `ac33d31a` |
| Anti-AI residue cleanup | ✅ Complete | `1507a752` |
| Production residue CI gate | ✅ Complete | `1507a752` |

## Phase 4 work packages

### WP-01 — Agent Session UI
Wire the capability broker into ChatScreen with:
- Inline tool approval cards (not JSON)
- Agent working state indicator ("Archive Stylist is working… [Stop]")
- Tool call rendering ("Searching your Saved items…")
- Context scope chips ("This chat · Saved · Own listings")

### WP-02 — Runtime adapter connections
Connect actual runtime adapters to the agent session service:
- OpenAI direct provider adapter (already has probe + discovery)
- Anthropic direct provider adapter
- Remote host adapter foundation (for Codex/Hermes)
- Apple Foundation Models native bridge stub (iOS 27)
- Android ADK native bridge stub

### WP-03 — Poster video trim
Implement video frame editing in PosterComposerScreen:
- Trim start/end on video frames
- Volume/mute per frame
- Playback preview
- Frame duration derived from media

### WP-04 — Look cutout
Implement background removal in LookComposerScreen:
- Native vision API integration or expo-image-manipulator
- Before/after preview
- Fallback to original rectangle if quality unavailable

### WP-05 — Wallet Convert flow
Extract Convert (1ZE ↔ fiat) from inline expandable to dedicated screen:
- Amount → review → auth → execute → receipt
- Same pattern as AddMoney and Withdraw

### WP-06 — Native screenshot baselines
Capture maestro device screenshots for:
- Agents home, Connections, Agent session
- Poster camera, Poster editor, Look editor
- Co-Own Asset Detail, Due Diligence
- Chat, Wallet, Settings
- Profile (self and public)

### WP-07 — Remaining "per spec" / "per audit" comment cleanup
35 non-blocking warnings remain. Clean these in a focused pass.

### WP-08 — Agent persistent session storage
Replace in-memory deployment Map with persistent storage for production agent sessions.

## Quality estimates

See README.md for the full quality estimate table.

## Test results

- 1211 passed, 2 failed (screenshot baselines)
- Typecheck: exit 0
- Residue check: 0 errors, 35 warnings
