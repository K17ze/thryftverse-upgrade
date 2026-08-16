# Agents, Connections and Session UI

## Code surfaces inspected / affected

- `frontend/src/screens/AIAgentIntegrationScreen.tsx`
- `frontend/src/screens/BotDirectoryScreen.tsx`
- `frontend/src/screens/BotBuilderScreen.tsx`
- `frontend/src/screens/AgentActivityScreen.tsx`
- `frontend/src/platform/agents/*`

## Current diagnosis


Phase 3.1 architecture is frozen as closed. The remote visual shell still demonstrates the next problem: Connections uses a hero summary, Agent Management card, provider rows, status badges and entrance animations.

Agent product quality now depends on making permissions understandable without turning Chat into a developer console.


## User psychology / product job


Users need answers to:
- Which agent is here?
- What can it access?
- What is it doing now?
- What will happen if I approve?
- Can I stop/revoke it?

They do not need:
- JSON tool calls;
- provider/runtime terminology in ordinary chat;
- tier letters;
- capability enum names.


## Flagship target composition


Connections:
- flat provider list;
- status;
- current model/connection details only when expanded;
- one security note.

Agent Definition:
- Purpose
- Connection
- Access
- Where it appears
- Memory

Session:
- human-readable working state;
- tool events;
- approval card only at decision point;
- stop.


## Detailed implementation map


1. Remove/flatten Connections hero card unless connection health is globally broken.
2. Agent Management `Pause all` / Activity can be toolbar/secondary section, not another card.
3. Provider rows expand inline or push detail; only connected/invalid state is immediately visible.
4. Capability UI groups by human risk:
   - read;
   - draft;
   - publish/send;
   - money/security.
5. Never show Tier A/B/C/D to consumers.
6. Approval card states exactly:
   - agent;
   - intended action;
   - object/amount;
   - data it will use;
   - Approve once / Deny;
   - “Always allow” only when policy permits.
7. Financial approval must visually transition into canonical transaction UI, not execute inside agent card.
8. Agent Activity becomes a chronological audit list with verbs and objects, not telemetry.
9. “Working…” indicator stops when runtime completes/fails/cancels.
10. Context scope (`This chat`, `Saved`, `Own listings`) is configured once and shown as a compact disclosure, not permanent chips.


## Micro-detail pass


- Avoid robot/cube icons everywhere.
- Provider brand marks/names can carry identity; no colored icon circle needed.
- Status: plain text + semantic dot.
- Money approvals use the same numeric/trust typography as Wallet/Checkout.


## Acceptance / screenshot QA


Scenarios:
- no connection;
- one provider;
- invalid key;
- agent read;
- draft;
- publish approval;
- money approval;
- denied;
- stopped;
- runtime error.

Pass:
- a nontechnical user can state what approval will do before tapping.


## Reference crosswalk


- Apple design principle: clarity of purpose/meaning.
- Pinterest 2026 AI direction: intelligence serves recommendation/action, not decorative “AI-ness.”
