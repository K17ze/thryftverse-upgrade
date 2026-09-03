---
auto_execution_mode: 0
description: Upgrade one messaging capability end to end across delivery truth, realtime, safety, psychology, native UX, and marketplace context
---

# Message Department Convergence Loop

Use this workflow for Inbox, message requests, a conversation thread, composer,
attachments, voice, groups, notifications, search, safety, or commerce messaging.
The unit is one user promise across client, API, storage, realtime, push, and every
state—not a list of competitor features.

The dated research report at
`.devin/reports/message-department-flagship-research-2026-08-24.md` is a snapshot,
not current truth. Revalidate its findings against the task's HEAD before acting.

## 1. Define the promise and threat model

Record:

- conversation type, participants, tenancy, and marketplace object;
- message/content types and retention rules;
- privacy, block, request, mute, report, moderation, and notification policy;
- delivery guarantee and offline/process-death expectations;
- encryption claim actually supported by the architecture;
- abuse, spam, impersonation, payment-diversion, and unsafe-link risks.

Never imply end-to-end encryption, delivery, read state, presence, moderation,
translation, deletion for everyone, or report success unless the server and client
contract prove it.

## 2. Trace the canonical message lifecycle

Inspect the current owners under the messaging screens, hooks, services, domain
types, realtime client/provider, API routes, migrations, workers, moderation, and
notification integrations. Map:

```text
draft → stable clientMessageId → durable outbox → upload binding → send request
→ authorization/idempotency transaction → server message/sequence
→ acknowledgement/event/push → reconciliation → delivery/read state
→ pagination/search/reply/reaction/edit/delete/report
```

Also trace cold start, background/foreground, reconnect, process death, multi-device,
duplicate event, out-of-order event, and network loss after send. Choose one
canonical thread screen, message type, and reconciliation owner; remove compensation
only after all callers migrate.

## 3. Reliability gate before feature breadth

The worked slice must define and prove:

- newest-page and cursor semantics with stable ordering;
- client/server deduplication by stable operation identity;
- queued, sending, acknowledged, delivered, read, failed, retrying, and unknown
  outcome as truthful distinct states;
- media lifecycle: local preview → upload progress → remote binding → send → retry;
- persisted outbox/reconciliation when offline behavior is promised;
- authorized replay with gap detection and canonical refetch;
- server-owned read state, replies, reactions, edits, deletion scope, and reports;
- notification/mute/request behavior consistent with conversation policy.

Do not add stories, bots, AI, large groups, or decorative voice UI while message
identity, pagination, delivery truth, media, or safety remain unproved on the slice.

## 4. Psychology and anti-AI messaging design

Messaging quality comes from reducing uncertainty and interruption while preserving
human agency:

| Human tension | Product mechanic | Acceptance evidence |
|---|---|---|
| “Did it send?” | stable per-message lifecycle | no duplicate or false failure after reconnect |
| “Am I being ignored?” | privacy-aware delivery/read semantics | state is truthful and user-controllable |
| turn-taking | restrained typing/presence | expires correctly; no fabricated activity |
| context loss | reply quote, search, commerce context | source remains understandable and reload-safe |
| social effort | reactions/quick acknowledgement | persisted, accessible, undoable |
| interruption | per-chat mute/request controls | push and in-app behavior agree |
| safety at decision time | contextual warnings/report/block | action works without dead-end toast |

Anti-AI composition rules:

- conversation content dominates; chrome and commerce recede until relevant;
- rows are flat and information-dense, not equal rounded cards;
- bubbles communicate authorship/grouping, not decoration;
- one composer boundary, one send affordance, and progressive attachment tools;
- no duplicated status labels, rainbow badges, gratuitous gradients, or animated
  activity that implies presence;
- stable scroll anchoring, keyboard geometry, date separators, unread boundary, and
  loading/final layout;
- selection, reply, retry, and destructive modes are explicit and reversible.

### 2026 messaging surface patterns (AGENTS.md §35.3–35.6)

These are verified August 2026 findings from first-party sources, not memory. Apply
the ones relevant to the worked surface:

**WhatsApp 2026 bubble design (§35.3):** Bubbles are now fully rounded pill-shaped
with significantly increased radius. The classic tail/pointer has been removed —
media appears without traditional bubble borders (media IS the bubble). Messages align
closer to the display edge. Our approach: keep the asymmetric tail radius
(iMessage-style) which is also flagship; the tail corner at `Radius.sm` (4px) is
subtle enough. Full pill removal is a design choice, not a requirement.

**iMessage typing dots (§35.4):** Three dots pulsing in sequence, not simultaneously.
Each dot fades from 30% to 100% opacity with a 200ms stagger. Brand blue on iOS; we
use `colors.brand` for consistency. Reduced motion: static dots at fixed opacity, no
animation. Replaces text "typing..." which reads as prototype-grade.

**Unread count badge (§35.6):** Single unread = small 8pt dot in brand color, no
number. Multiple unread = pill-shaped badge with count, `minWidth: 18, height: 18,
borderRadius: full`, shows "99+" when over 99. Position: right side of the
conversation row, after the snippet preview. Brand color background, inverse text.
Consistent across WhatsApp, iMessage, Telegram.

**Send feedback (§27.9):** Send message is S2 (visual + subtle haptic). Like/react is
S1 (visual only). Failed send is distinct from unknown-outcome — never show success
for an ambiguous outcome (§37.7).

## 5. Implement one vertical slice

Run both `live-signs-convergence-loop.md` and
`visual-flagship-convergence-loop.md`. Cover Inbox plus thread propagation when the
same entity changes. Relevant states include initial sync, cached refresh, empty,
request, blocked, muted, offline, reconnecting, history pagination, attachment
upload, partial failure, permission denied, and unknown send outcome.

Security checks include object-level authorization, membership changes, blocked
users, attachment validation, link handling, rate limits, abuse reporting,
moderation provenance, retention/deletion semantics, notification privacy, local
storage protection, and sensitive log redaction.

## 6. Verification packet

Use synthetic local/staging identities only unless separately authorized. Verify:

1. send interruption before request, after request, and after commit;
2. duplicate send/event and out-of-order replay;
3. offline queue and process restart when promised;
4. newest pagination, older history, reply/reaction/edit/delete/report persistence;
5. authorization for non-member, blocked, removed, and message-request states;
6. media upload failure/retry and missing media;
7. mute/request/read propagation to Inbox, thread, push, and secondary device;
8. native keyboard, scroll anchor, large text, TalkBack/VoiceOver, reduced motion,
   and representative Android performance.

Run focused messaging tests first, then canonical frontend/backend commands from
the manifests. Record endpoint responses without message bodies or user data. If
live staging, push credentials, multiple devices, or native artifacts are absent,
name the exact pending gates and use the corresponding honest status.

## 7. Success measures

Track send acknowledgement latency percentiles, send failure and unknown-outcome
rate, duplicate rate, reconnect recovery time, outbox age, history load success,
notification delivery/mute correctness, report/block completion, crash-free thread
sessions, and marketplace conversion/support outcomes. Metrics need an owner and
privacy-safe instrumentation; a proposed dashboard is not evidence.

Competitor research informs mechanisms, not copied appearance. Verify current
first-party WhatsApp, Telegram, Signal, Apple, Expo, and React Native documentation
at execution time because messaging features and platform behavior are volatile.
