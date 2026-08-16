# Create Group / Group Management — Deep Implementation Specification

> Audit date: 2026-08-14  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Product job

Create Group is a frequent social utility. The flagship standard is not “functional form”; it is **low-memory-cost participant selection + confident group creation**.

## 1. People discovery

The current username-search-first model assumes the user remembers usernames.

Add sources in this order:

### Recent
People in recent DM/group interactions, excluding:
- self;
- blocked;
- already selected.

### Suggested
Can use:
- follows/followers;
- recent transactions/chats;
only if privacy/product policy permits.

### Search
Backend people search.

## 2. API

Preferred people-picker response:

```ts
interface PersonPickerUser {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  relationship?: 'following'|'follower'|'mutual'|'none';
  canMessage: boolean;
}
```

No client-created display fallback from raw ID.

## 3. Selected tray

Selected participants appear immediately as removable avatars.

Keyboard remains focused during selection if search active.

Next button includes count optionally:
`Next (4)`.

## 4. Search result row

Avatar.
Display name.
@username secondary.
Selection check.

Do not add follow stats or profile biography.

## 5. Details step

Default avatar mosaic is generated from canonical participant avatars.

If there are:
- 1–4 member avatars: compose mosaic;
- none: initials fallback.

Custom image:
only if upload is implemented end-to-end.

## 6. Media upload

Use existing media-upload infrastructure rather than local base64.

Flow:
pick → crop square → validate → upload → finalized asset ID → create group.

If group create fails:
keep uploaded draft asset reference temporarily/reuse, or clean up safely.

If photo upload fails:
allow Continue with mosaic.

## 7. Group name

Required? Decide explicitly.

If not required:
generate temporary human name from participants, but let user edit.

If required:
validate client and server.

## 8. Description

Optional.
Do not occupy two lines of the form if unused by most users.

`Add description` expands.

## 9. Create request

```ts
createGroup({
  idempotencyKey,
  participantIds,
  title,
  description,
  avatarAssetId
})
```

Server:
- validates membership;
- respects blocks/privacy;
- returns canonical summary.

## 10. Optimistic behavior

Do not create a fake full group in local store before server confirmation unless reconciliation is robust.

Better:
Create button -> `Creating…`
server returns group -> insert -> navigate.

Idempotency handles retries.

## 11. Group info

Group Info consumes canonical server group summary.

Do not infer owner as `participantIds[0]` long-term.

Server returns role.

## 12. Leave group

True server action:
`leaveGroup(conversationId)`

After success:
remove from active inbox.

If server action unavailable/offline:
do not pretend local deletion is leaving the group.

Separate:
`Remove chat from this device` if such a feature intentionally exists.

## 13. Delete-for-me semantics

Define whether this is:
- hide/archive;
- local clear;
- server conversation deletion for self.

Copy must match actual data lifetime.

## 14. Admin

Current UI type includes `admin` but backend reportedly does not support it.

Options:
A. implement backend roles;
B. remove admin visual model until supported.

Do not carry speculative domain states.

## 15. Add/remove member

Server authorization.

Owner/admin capability controls visibility.

## 16. Invite links

Only add if server has:
- secure token;
- revoke;
- expiry/rotation;
- join validation.

## 17. Group avatar updates

EditGroup:
pick/replace/remove.

Update response should propagate:
- Group Info;
- Inbox;
- Chat header;
without manual refresh.

## 18. Tests

- recent list;
- search;
- blocked user excluded;
- max;
- duplicate selection;
- long names;
- no avatar;
- photo upload fail;
- create network fail;
- duplicate tap;
- leave offline;
- add unauthorized.

## 19. Visual QA

Test group with:
- 3;
- 20;
- 100+ members if supported.

Do not display all selected avatars in a giant wrapping wall. Summarize after a useful count.
