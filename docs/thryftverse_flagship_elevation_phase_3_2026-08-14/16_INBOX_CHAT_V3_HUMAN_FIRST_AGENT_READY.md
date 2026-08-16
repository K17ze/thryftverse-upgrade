# Inbox & Chat V3 — Human First, Agent Ready

> Phase 3 audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `315a0760267354be46fec8a5f83ad8746badd392`

## Goal

Chat should first feel like excellent messaging. Agents and commerce are contextual capabilities, not permanent layers around the composer.

## Current pressure

`ChatScreen.tsx` owns messages, offers, commerce events, media, voice, reactions, link previews, payment warnings, agents, suggestions, composer state, offline, typing, selection and context menus.

This breadth increases regression risk and visual stacking.

## V3 structure

### Top bar
identity + optional listing context + info.

### Message area
Human messages dominate.
Commerce system events use quiet event cards.
Agent output is a participant with explicit runtime state.

### Composer
Default:
add · text · camera/media · send/voice.

A single suggestion area appears only when useful.

Do not stack quick replies + agent suggestions + active-agent chips + warning + reply quote simultaneously.

## Agent invocation

- `@agent`
- plus menu → Ask agent
- long press message → Ask agent about this
- group info → Add agent.

When agents are attached, a single quiet `2 agents` indicator is enough.

## Working state

`Archive Stylist is working…` [Stop]

Tool call:
`Searching Saved items…`

Approval card appears inline.

Do not use fake typing dots for multi-step tool work.

## Draft vs sent

Agent-generated draft lives in a draft/composer surface. It enters message history only after the configured send policy is satisfied.

## Safety

Off-platform-payment/scam warnings remain platform-owned and work with no AI connection.

## Architecture split

Introduce controller hooks:
- `useConversationMessages`
- `useConversationComposer`
- `useConversationCommerce`
- `useConversationAgents`
- `useConversationSafety`
- `useMessageSelection`

ChatScreen becomes orchestration/composition.

## Performance

Keep FlashList callbacks stable. Avoid rebuilding large render functions when unrelated agent/theme state changes.
