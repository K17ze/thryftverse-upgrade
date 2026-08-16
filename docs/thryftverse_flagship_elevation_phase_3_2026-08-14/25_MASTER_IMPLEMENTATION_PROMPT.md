# MASTER IMPLEMENTATION PROMPT — Phase 3

> Phase 3 audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `315a0760267354be46fec8a5f83ad8746badd392`

You are implementing **Thryftverse Flagship Elevation Phase 3**.

Repository: `K17ze/thryftverse-upgrade`  
Target branch: `feat/product-detail-contract-media-device-closure`  
Audit baseline: `315a0760267354be46fec8a5f83ad8746badd392`

Read every Markdown document in this folder before code changes.

# Mission

Move Thryftverse from “technically comprehensive but visibly overbuilt/generated” to a 2026 flagship product by reducing mechanism, separating product mental models and replacing demo intelligence with a real permissioned Agent Platform.

# Hard constraints

1. Preserve Phase 2 correctness/truth fixes.
2. Do not fabricate marketplace, auction, Co-Own, profile or AI data.
3. Do not add mock/demo behavior to production routes.
4. Never store provider secrets in AsyncStorage.
5. Never call a provider Connected from format validation alone.
6. Every agent action goes through typed app capability/authorization.
7. UserProfile can never become owner profile.
8. Money/security/destructive actions always require canonical explicit confirmation.
9. Never claim a remote harness is on-device.
10. Do not solve quality by adding more cards, glass, gradients or explanation.

# Pass 1 — baseline
Verify HEAD, tests/typecheck, capture release-build native before screenshots for Agents, Connections, Poster, Look, Co-Own, TPP/self profile path, Chat and Wallet.

# Pass 2 — Profile P0
Implement `openProfile()`.
MyProfile owner-only; UserProfile public-only.
Remove self/edit branches from public route.
Sweep all UserProfile navigation.
Add deep-link and owner/public projection tests.

# Pass 3 — Agent security truth
Remove insecure secret fallback.
Real Connection probe.
Dynamic runtime model/capability discovery.
Remove/gate demo chat-agent production responses.
BotBuilder must stop importing mockData.

# Pass 4 — Agent domain/runtime
Implement AgentDefinition, AgentSession, RuntimeAdapter, RuntimeRegistry, normalized events, Capability Broker, Approval Policy, Activity Ledger.

Add real adapters only. Unavailable adapters remain visibly unavailable.

# Pass 5 — Agent UX
Consumer vocabulary = Agents / Connections / Access / Sessions / Activity.
Build Agents Home, Connections, Create Agent, Agent Detail, Agent Session.
Move real Agents out of developer-only Settings.

# Pass 6 — Poster V3
Keep Phase 2 frame model.
Create dedicated PosterComposerScreen.
Default toolbar: Text / Stickers / Product / Draw / More.
Move layer/safe-zone/page mechanics away from first-run path.
Frame-native navigation and video editing.

# Pass 7 — Look V3
Create LookComposerScreen.
Spatial direct-manipulation workspace.
Add item/photo/cutout/text/layout.
Marketplace-linked product objects.

# Pass 8 — Co-Own
First two viewports collectible-first.
Move spread/depth/chart/NAV/alert to Market details.
Evidence-oriented Due Diligence.
Shared cached asset truth.

# Pass 9 — Chat
Human messaging default.
Agent via @mention/add menu.
No permanent empty agent strip.
Agent draft != sent message.
Inline working/tool/approval states.
Decompose controller.

# Pass 10 — Wallet
Wallet Home summary.
Extract Add, Convert, Withdraw, Earnings, Activity.
Transaction = amount → review → auth → execute → receipt.
Remove timer-based refresh completion.

# Pass 11 — human-art-direction residue
Add production residue gate.
Remove design-by-reference comments that do not explain invariants.
Reduce nested cards, pills, duplicate statuses and simultaneous smart surfaces.

# Pass 12 — native acceptance
Test narrow iPhone, modern iPhone, Android, light/dark, 200% text, reduced motion, poor network, permission denial, provider auth failure, agent approval, transaction cancellation.

# Definition of flagship done

A screen is not done because it compiles or resembles a reference screenshot.

It is done when:
- one dominant job is obvious;
- content outranks chrome;
- system behavior is truthful;
- duplicate affordances are gone;
- failure/recovery is designed;
- async geometry is stable;
- native screenshots are approved;
- it still feels intentional after removing the words AI/flagship/premium/smart.

# Final report
Provide starting/ending SHA, commits by WP, changed files, removed demo paths, Agent architecture diagram, profile route invariant proof, Creator architecture before/after, Co-Own hierarchy proof, Chat/Wallet flows, tests, native screenshots and unresolved blockers.
