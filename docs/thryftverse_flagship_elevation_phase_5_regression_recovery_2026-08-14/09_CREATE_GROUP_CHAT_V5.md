# Create Group Chat V5 — Small Flow, Flagship Standard

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Current flow

Current Create Group has:
1. username/member search;
2. group details.

Backend creation has strong fundamentals:
- search;
- blocked-user filtering;
- member limits;
- idempotency;
- retry.

## Current visible defect

The details step renders a prominent camera-style **Group photo** selector, but the inspected implementation has no `onPress`, picker or upload path.

This is a flagship blocker because it creates a **false affordance**.

## New Stage 1 — People

```text
New group                              Next

[Search people]

Suggested
[avatar] Maya
[avatar] Noor
[avatar] Dan

Recent
[avatar] ...
```

When selected:
horizontal selected avatar tray beneath search.

Each selected avatar has remove affordance.

### Sources

Priority:
- recent conversation participants;
- followed users/contacts if policy allows;
- search.

Do not require username knowledge as the only discovery path.

## New Stage 2 — Group

Default group avatar:
generated member mosaic using first 3–4 participant avatars.

Below:
`Add group photo`

**Only make Add group photo tappable if the media pipeline is real.**

Fields:
- Group name — required/clear.
- Add description — optional, can expand.
- `6 members` summary.
- Create.

## Backend contract

Group create:

```ts
{
  idempotencyKey,
  title,
  description?,
  participantIds,
  avatarAssetId? // preferable after finalized upload
}
```

Response:
- canonical conversation;
- avatarUrl/mosaic data;
- description;
- participant summaries;
- creator role;
- timestamps.

## Avatar upload

Preferred:
1. pick/crop;
2. upload media;
3. receive finalized asset ID;
4. create/update group with asset ID.

If upload fails:
- allow mosaic fallback;
- never leave spinner placeholder.

## Immediate Inbox insertion

After create:
- returned conversation inserted canonically;
- avatar/name/member count correct;
- navigation opens group;
- no temporary fake row requiring refresh.

## Error cases

- one member removed server-side;
- blocked relationship changed;
- member limit exceeded;
- name invalid;
- network lost;
- duplicate create tap.

Idempotency prevents duplicates.

## Psychology

Current Snapchat group creation is people-first: from Chat, choose who to chat with. Use that mental simplicity without copying the UI.

## Acceptance

A user who remembers faces but not usernames can create a group.

No visual control is inert.
