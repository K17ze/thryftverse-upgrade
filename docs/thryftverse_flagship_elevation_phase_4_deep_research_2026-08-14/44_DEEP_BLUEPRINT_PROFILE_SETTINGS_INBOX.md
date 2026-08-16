# Deep blueprint — Profile, Settings, Inbox

These are the screens where repetitive “app UI” grammar is most obvious. The flagship goal is **flatness with hierarchy**, not emptiness.

---

# PROFILE

## 1. Owner vs public
Preserve the route/data separation.

Visual parity:
same identity/media geometry.

Action difference:
Owner:
- Edit
- settings/utility

Public:
- Follow
- Message
- overflow

Do not change the whole header template based on owner mode.

---

## 2. Hero geometry

Cover:
~140–180pt depending device, not an enormous social-network banner.

Avatar:
overlap cover seam.

Identity:
name + handle.
Verification/trust adjacent, not a separate row of badges.

Bio:
2–4 lines.

Social:
followers / following / sales if seller identity really needs it.

---

## 3. Owner utility migration

Move these away from primary profile content:

### Profile completion
Small:
`Complete profile · 2 items`
in utility row or one-time banner.

### Growth tasks
Seller Center/Insights.

### Co-Own portfolio
Utility:
`Co-Own holdings`
opens Portfolio.

### Archive
Utility.

The profile content feed should not be interrupted every 1–2 sections by account chores.

---

## 4. Tabs

Recommended:
`Shop | Looks | About`

Shop may have:
`For sale | Sold`
as secondary filter.

Do not put nested permanent pills under all three tabs.

---

# SETTINGS

## 1. Root density

The route metadata is valuable for search but should not dictate root IA.

Use broad rows.

Example:

```
Account & security
  Account
  Verification
  Devices

Privacy & safety
  Privacy
  Messages
  Blocked accounts

Buying & payments
  Payments
  Addresses
  Saved

Selling & payouts
  Wallet & payouts
  Shipping

...
```

Not every leaf route visible simultaneously.

---

## 2. Identity at Settings top

If user identity is shown:
one flat row:
avatar + name/handle + `Account`.

No large “account hero card” unless verification/action required.

---

## 3. Row visual grammar

```
Label                         value >
------------------------------------
Label                               >
```

Icon only where it materially aids scan:
- security;
- payments;
- agents maybe.

Do not give every row a colored glyph.

---

## 4. Search
Settings search can search all hidden leaf routes.

This is the best way to have deep settings without deep root clutter.

On current iOS, search in settings-like apps is a strong convention. Preserve.

---

# INBOX

## 1. Current segmentation
Source supports:
- all;
- unread;
- archived;
- groups;
- buying;
- selling;
- requests.

This is too many equal modes.

### Recommended top
```
Inbox                      compose/settings
[ Search ]
Primary   Buying   Selling
```

Requests:
`Message requests 3 >`

Unread:
filter icon or `Unread` quick toggle in filter sheet.

Groups:
appear in Primary and optional filter.

Archived:
overflow.

---

## 2. Conversation row

```
[avatar] Name                2m
         Last message...
         [item thumb optional]
```

Alternative if commerce context:
small item thumbnail on right, not another full card.

Unread:
- name/snippet weight;
- small dot/count.

Pinned:
ordering; tiny pin only if needed.

Muted:
quiet icon.

Do not show 4 state badges.

---

## 3. Agent conversation
If agent is the counterparty/participant:
avatar + name.
Secondary:
`Agent`

Not:
`Name · AI` + AI chip + cube icon + different bubble all at once.

---

# CHAT

## 1. Default state
Header.
Optional listing context.
Messages.
Composer.

No visible agent row when none is active.
No quick replies when user has started typing.
No safety module when no risk.

## 2. Listing context
Single compact persistent bar if chat is tied to one listing:
image, title, price/state.

Tap opens detail.

If order supersedes listing:
context evolves to order status.

## 3. Composer stack priority
Only one auxiliary row at a time:
1. reply quote;
2. attachment review;
3. contextual safety;
4. quick replies;
5. agent draft/approval.

Resolve conflicts in controller, not by stacking.

---

# Reference rationale

The supplied Instagram inbox screenshot demonstrates how little containment is needed:
- top identity;
- search;
- small scopes;
- flat rows.

The supplied Settings reference demonstrates:
- section headings;
- hairlines;
- row values;
- almost no card stack.

The implementation should emulate those **composition principles** without copying brand styling.

---

# QA

Profile:
- owner incomplete;
- owner complete;
- public;
- long bio;
- no media.

Settings:
- default;
- search results;
- developer mode;
- dark/light.

Inbox:
- 0;
- 100 conversations;
- requests;
- buyer/seller mix;
- agent.
