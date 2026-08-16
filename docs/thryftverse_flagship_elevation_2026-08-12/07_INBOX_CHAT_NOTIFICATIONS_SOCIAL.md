# Inbox, Chat, Notifications & Social Communication

> **Audit date:** 2026-08-12  
> **Repository:** `K17ze/thryftverse-upgrade`  
> **Audited branch:** `feat/product-detail-contract-media-device-closure`  
> **Audited HEAD:** `df5e9a71f3dfb60407666a9323c66c758aef1b0f`  
> **Purpose:** Next-stage visual/UI/UX production elevation. This document is implementation guidance, not a claim that reference apps should be copied 1:1.

## Current position

`InboxScreen.tsx` already has:
- FlashList;
- search;
- segments;
- listing context thumbnail;
- message requests;
- unread state;
- pin/mute/archive;
- swipe actions;
- offline/error handling.

The target is not more features. It is a calmer social + commerce message hierarchy.

---

## Inbox psychology

A user scans messages by:
1. face/name;
2. unread state;
3. latest message;
4. time;
5. item context if the conversation is transactional.

Do not make every state a badge.

### Recommended row
- avatar;
- display name;
- one-line snippet;
- timestamp;
- unread dot or bolding;
- small listing thumbnail on the right for commerce thread;
- muted/pinned icon only when it materially changes interpretation.

### Segment rail
Keep few:
- All
- Buying
- Selling
- Requests

Unread can be a filter within All or a temporary chip. Archived belongs behind overflow/search unless usage justifies a top-level segment.

---

## Marketplace context

Meta’s 2026 Seller app specifically organizes seller messages around item context. Thryftverse should take advantage of this more than a generic social DM app.

Chat header:
- person;
- listing thumbnail/title/price;
- transaction state;
- quick “View item.”

In conversation:
- offer cards / order update / auction outcome have a distinct transactional card grammar;
- ordinary messages remain ordinary bubbles;
- do not turn every listing mention into a giant card.

---

## New message

User should understand whether they are:
- messaging a person;
- asking about an item;
- contacting support;
- starting a group.

If policy requires “start from a listing,” explain that at the point of action rather than disabling a generic compose icon mysteriously.

---

## Chat screen polish

- bubble width capped;
- timestamps grouped;
- media messages preserve aspect ratio;
- delivery/read state quiet;
- composer uses native keyboard motion;
- attachment tray follows same media-source language as Poster/Sell where possible;
- long-press opens reaction/action menu;
- link/listing previews load asynchronously without reflow.

Avoid:
- gradient bubbles for “premium”;
- oversized floating composer;
- multiple top-bar icons without overflow;
- bot/agent visual identity leaking into human threads unless the thread is explicitly an agent.

---

## Exact backlog

### P0
- [ ] Simplify Inbox segments.
- [ ] Make commerce context a consistent right-side thumbnail/row state.
- [ ] Remove redundant badges.
- [ ] Verify message requests as a clear, single entry.
- [ ] Standardize search/header geometry with Settings/Search.

### P1
- [ ] Transaction event component system.
- [ ] Optimistic send + pending/error retry state.
- [ ] attachment upload progress per message.
- [ ] grouped timestamps.
- [ ] unread divider.
- [ ] thread search.
- [ ] contextual listing header.

### P2
- [ ] seller quick replies;
- [ ] item-aware safe suggestions, visually neutral;
- [ ] inbox triage for high-volume sellers under Seller mode.

---

## Acceptance
- [ ] User identifies unread conversations without reading badges.
- [ ] Listing context is understandable but does not crowd social threads.
- [ ] keyboard never obscures composer.
- [ ] media upload can fail/retry.
- [ ] offline outgoing state is explicit.
- [ ] large inbox remains smooth in release mode.
