# Group Member Search — Runtime Repair + Flagship People Picker

# Current frontend

`CreateGroupChatScreen.tsx` already has:
- query state;
- debounce;
- skeleton;
- error/retry;
- recent/suggested users;
- selected-member rail;
- FlashList results;
- selection.

`profileApi.ts` calls:
```http
GET /users/search?q=<query>&limit=<n>
```

Repository search during this audit did not surface a corresponding backend route. Verify `backend/api/src/index.ts`; if absent, implement it.

# Backend contract

```http
GET /users/search?q=&limit=&cursor=
```

```json
{
  "ok": true,
  "items": [
    {
      "id": "user_id",
      "username": "khaize",
      "displayName": "Mohammad",
      "avatar": "https://...",
      "relationship": "following",
      "mutualCount": 3
    }
  ],
  "nextCursor": null
}
```

Validate:
- auth;
- normalized 2–64 char query;
- limit 1–20;
- cursor.

Server filters:
- self;
- blocked relationships;
- deleted/deactivated;
- non-searchable/privacy-protected users.

# Ranking

1. exact username;
2. username prefix;
3. exact display name;
4. display-name prefix;
5. username substring;
6. display-name substring;
7. relationship/recent DM/mutuals;
8. stable ID tie-break.

Use an indexed/trigram approach for contains/fuzzy search; do not rely on unbounded `%query%` scans.

# UX

- autofocus on entry;
- recents before typing;
- 150–250ms debounce;
- cancel/ignore stale requests;
- retain prior results while a refined query loads where useful;
- selected avatar rail;
- keyboard stays open while multi-selecting;
- query clear does not clear selected users.

# Visual

```text
[ Search people…                         × ]

Selected
(avatar) (avatar)

Recent
[avatar] Mohammad Khaize            ✓
         @khaize · Following
```

No card per person. Soft search field, flat rows, simple trailing state.

# Tests

Backend:
- exact/prefix/case-insensitive/display-name;
- self excluded;
- blocked excluded;
- pagination;
- auth;
- rate limit;
- invalid query.

Frontend:
- no request below threshold;
- debounce;
- stale result protection;
- retry;
- clear;
- select/deselect;
- selection survives query changes;
- max members.

Native E2E:
```text
New group
→ type real username
→ result appears
→ select
→ search second real username
→ Continue
→ name group
→ create
→ conversation opens
```

Do not mark complete until this real-account flow passes.
