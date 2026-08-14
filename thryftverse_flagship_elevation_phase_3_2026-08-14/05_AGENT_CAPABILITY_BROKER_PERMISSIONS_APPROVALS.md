# Agent Capability Broker, Permissions & Approvals

> Phase 3 audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `315a0760267354be46fec8a5f83ad8746badd392`

## Core rule

No agent receives arbitrary app access.

Every action passes through a typed **Thryftverse Capability Broker**.

## Capability groups

### Read
`profile.read_public`
`profile.read_private_preferences`
`closet.read`
`saved.read`
`looks.read`
`listings.read_own`
`orders.read`
`wallet.read_balance`
`chat.read_current`
`chat.read_selected_history`

### Draft/reversible
`profile.draft_edit`
`listing.create_draft`
`listing.draft_edit`
`look.create_draft`
`poster.create_draft`
`chat.draft_reply`
`offer.draft`
`search.run`

### External communication/publication
`chat.send`
`listing.publish`
`look.publish`
`poster.publish`
`profile.apply_edit`

### Money/security
`offer.send`
`auction.bid`
`auction.buy_now`
`coown.place_order`
`wallet.convert`
`wallet.withdraw`
`payment.confirm`
`account.change_security`

## Approval tiers

A — low-risk read: may auto-run after persistent explicit grant.

B — draft/reversible: may auto-run because nothing is externally committed.

C — send/publish: ask by default; per-surface narrow persistent grant may be allowed for low-risk messaging.

D — money/security/legal/destructive: always explicit canonical confirmation and re-auth where appropriate.

There is no “always allow” consumer setting for withdrawals, bids, purchases, trades, password/2FA changes or destructive account actions.

## Approval card

Do not show JSON.

Example:

**Archive Stylist wants to search your Saved items**  
Looking for black leather jackets under £250.  
Access: Saved · Search only

`Allow once` `Always allow searches` `Deny`

For money:
the agent only prepares/navigates to canonical transaction review.

## Activity ledger

Persist:
- session;
- agent;
- runtime/provider;
- capability;
- policy match;
- approval;
- sanitized argument summary;
- result status;
- externally committed resource ID;
- timestamp.

Expose this to the user in plain language.

## Context firewall

Invoking an agent in one Chat does not grant Inbox, Wallet, all Saved items or private Profile by implication. Initial context is the minimum scope implied by invocation.
