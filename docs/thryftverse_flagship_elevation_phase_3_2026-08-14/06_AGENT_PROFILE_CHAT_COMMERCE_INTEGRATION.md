# Agent Integration — Profile, Chat, Commerce & Creator

> Phase 3 audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `315a0760267354be46fec8a5f83ad8746badd392`

## Principle

Agents should operate through normal Thryftverse product primitives. Do not create “AI versions” of every screen.

## Profile

Agent can:
- summarize public shop;
- draft bio;
- prepare profile edits;
- suggest curation.

Private fields require explicit scope. Edits remain drafts until applied.

## Chat

Invoke via:
- `@agent-name`;
- composer `+ → Ask agent`;
- long-press message → Ask agent about this;
- group info → Add agent.

Do not render a permanent agent-chip strip in every conversation.

Agent state:
- Working
- Needs approval
- Paused
- Failed

A generated draft is not a sent message.

## Search

Agent can formulate/refine searches and compare items, but results render in normal Search UI. No permanent assistant panel.

## Sell

Agent can inspect media and draft structured facts/title/description/price guidance. Seller reviews normal fields. Intelligence stays implicit.

## Poster / Look

Agent can propose:
- frame order;
- text;
- collage layout;
- product tags;
- captions.

All proposals are reversible drafts in the direct-manipulation Composer.

## Wallet / commerce

Allowed:
- explain balance/holds;
- calculate fees/rates;
- prepare quote;
- navigate to transaction.

Not allowed without canonical review:
- transfer;
- withdrawal;
- payment;
- bid;
- buy;
- sell;
- Co-Own order.

## Agent identity

Avoid robot/sparkle gradients. Agent is represented like a service participant: avatar, name, runtime status, permission state.
