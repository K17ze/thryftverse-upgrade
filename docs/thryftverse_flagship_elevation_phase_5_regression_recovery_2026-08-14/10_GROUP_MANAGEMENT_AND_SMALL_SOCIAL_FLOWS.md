# Group Management & Social Micro-Flows

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Group Info current issues

The inspected Group Info is visually cleaner but several semantics remain local-device approximations:
- Leave Group text says it removes the group from the inbox on this device.
- Delete for me is also local-device.
- member/agent data comes from local conversation store.

These actions must be clearly distinguished from true server membership actions.

## Group Info V5

Hero:
- actual group avatar/mosaic;
- group name;
- optional description;
- member count.

Quick actions:
- Members
- Media
- Agents

Then flat rows:
- Notifications
- Quick replies if relevant
- Invite link / Add members if permitted
- Archive

Danger:
- Leave group
- Delete local conversation only if this concept truly exists.

## Backend membership truth

Need typed group role:
- owner;
- admin;
- member.

Current member screen explicitly notes admins are not supported by backend and infers creator owner from IDs.

If UI intends admin management, backend must support it before exposing it.

## Group Members current smell

Names can fall back to:
`User ${id.slice(-6)}`.

A flagship social product should not expose raw-ish ID-derived names as normal presentation.

Backend/API should provide participant summary:
- ID;
- displayName;
- username;
- avatar;
- role;
- relationship.

## Add members

People-first picker:
- existing member disabled;
- recent contacts;
- search;
- selected tray.

## Remove member

Only visible when viewer has authority.
Explain consequence.
Canonical server action.

## Invite link

If supported:
- create/revoke link;
- expiry;
- copy/share.

Do not invent a button before backend capability.

## Other small social flows to audit in same work package

- follower/following list;
- blocked users;
- message requests;
- report user;
- report listing;
- mute/restrict;
- share profile;
- share listing;
- user picker;
- mentions;
- quick replies;
- shared media;
- leave/archive/delete distinctions.

## Rule

A micro-flow is not “minor” if users encounter it while trusting the social graph.

Every row must either:
- work end-to-end;
- be absent;
- or be explicitly unavailable without looking tappable.
