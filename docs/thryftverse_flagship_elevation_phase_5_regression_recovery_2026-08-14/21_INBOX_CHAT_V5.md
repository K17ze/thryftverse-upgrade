# Inbox & Chat V5

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Inbox

Three primary scopes are enough:
- Primary;
- Buying;
- Selling.

Requests as explicit entry.
Unread as filter.
Groups and Archived contextual.

## Chat

Without special state, it should look like a normal flagship messenger:
- identity;
- optional listing context;
- messages;
- composer.

## Phase 5 long-tail

Audit:
- message requests;
- attachments;
- camera;
- voice;
- reply;
- reactions;
- edit/delete if supported;
- report;
- listing share;
- offer card;
- order status;
- shared media;
- group info;
- agent participation;
- offline queue.

## Conversation DTO cleanup

`chatApi.ts` still imports important domain types from `mockData`.
Move:
- Conversation;
- Message;
- ChatAgentConfig;
- ChatBot;
to real domain modules.

## Participant summary

Never synthesize visible participant names from truncated IDs.

Backend/API supplies:
- display name;
- username;
- avatar.

## AI/agent

No permanent agent chrome in normal conversations.
