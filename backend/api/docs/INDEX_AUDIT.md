# Database Index Audit Report

**Audit date:** 2026 August
**Auditor:** WS31 — Database Index Audit + Missing Index Detection
**Scope:** `backend/api/src/db/migrations/*.sql` and `backend/api/src/index.ts`

---

## 1. Migration runner transaction behaviour

`backend/api/src/db/migrate.ts` wraps **every** migration in an explicit
`BEGIN` / `COMMIT` block (lines 35–38):

```ts
await client.query('BEGIN');
await client.query(migrationSql);
await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [fileName]);
await client.query('COMMIT');
```

`CREATE INDEX CONCURRENTLY` is **not permitted inside a transaction block**,
so all new indexes use plain `CREATE INDEX IF NOT EXISTS`. This is safe because
the indexes are additive and idempotent.

---

## 2. Existing indexes on hot-path tables

The migrations directory contains 108 SQL migrations with well over 100
explicit `CREATE INDEX` / `CREATE UNIQUE INDEX` statements. The tables called
out in the audit brief are already well-covered:

| Table | Existing index | Columns | Migration |
|---|---|---|---|
| `chat_messages` | `chat_messages_conversation_created_idx` | `(conversation_id, created_at DESC)` | 010 |
| `orders` | `orders_buyer_idx` | `(buyer_id, created_at DESC)` | 003 |
| `orders` | `orders_seller_idx` | `(seller_id, created_at DESC)` | 003 |
| `notification_events` | `notification_events_unread_idx` | `(user_id, read_at) WHERE read_at IS NULL` | 043 |
| `notification_events` | `notification_events_cursor_idx` | `(user_id, created_at DESC, id DESC)` | 043 |
| `notification_events` | `notification_events_type_idx` | `(user_id, event_type, created_at DESC)` | 043 |
| `auction_bids` | `auction_bids_auction_idx` | `(auction_id, created_at DESC)` | 003 |
| `listings` | `listings_search_vector_idx` | `GIN (search_vector)` | 008 |
| `listings` | `listings_sold_comparables_idx` | `(category, brand, created_at DESC) WHERE status = 'sold'` | 065 |
| `listing_images` | `listing_images_listing_id_idx` | `(listing_id, sort_order)` | 030 |

> **Note on table/column naming.** The audit brief referenced
> `messages.conversation_id`, `orders.user_id`, `notifications.user_id` and
> `bids.auction_id`. The actual schema uses `chat_messages`, `orders.buyer_id` /
> `orders.seller_id`, `notification_events` and `auction_bids` respectively.
> All of those already have the equivalent covering indexes listed above, so
> **no duplicate indexes were added** (per the constraint to only add genuinely
> missing indexes and never duplicate existing ones).

---

## 3. Hot query patterns identified in `index.ts`

### 3.1 Main discovery feed — `GET /listings` (line 18171)

```sql
SELECT l.id, l.seller_id, l.title, ..., l.created_at, u.username AS seller_username
FROM listings l
LEFT JOIN users u ON u.id = l.seller_id
WHERE status = 'active' [AND category = ... AND brand ILIKE ... AND ...]
ORDER BY l.created_at DESC, l.id DESC
LIMIT $N
```

- `status = 'active'` is **always** present (hard-coded base condition, line 18185).
- Default sort is `l.created_at DESC, l.id DESC` (line 18228).
- Keyset cursor pagination uses `(l.created_at, l.id) < (...)` (line 18238).
- This is the product's primary browse surface — the highest-traffic read path.

### 3.2 Seller dashboard listings — `GET /users/:userId/listings` (line 21705)

```sql
SELECT l.id, ..., l.created_at, u.username AS seller_username
FROM listings l
LEFT JOIN users u ON u.id = l.seller_id
WHERE seller_id = $1 [AND status = $2]
ORDER BY l.created_at DESC
LIMIT $N
```

- Filters by `seller_id` (always) and optionally `status` (line 21715–21721).
- Sorts by `l.created_at DESC` (line 21748).

### 3.3 Seller active-listing count (line 15551)

```sql
SELECT COUNT(*)::text AS active_count FROM listings WHERE seller_id = $1 AND status = 'active'
```

### 3.4 Related-listings by seller (line 21193)

```sql
... l.id != $1 AND l.status = 'active' AND l.seller_id = $2 ...
```

---

## 4. Missing indexes found

Before this audit, `listings` had **no** index on `status`, `seller_id`, or
`created_at` (other than the partial `status = 'sold'` comparables index and
the GIN full-text index). Both hot paths above were therefore doing
**sequential scans** on the `listings` table.

| Missing index | Hot query it serves |
|---|---|
| `listings (status, created_at DESC, id DESC)` | Main feed — `GET /listings` |
| `listings (seller_id, status, created_at DESC)` | Seller dashboard, active count, related listings |

---

## 5. New indexes added — migration `109_index_audit_additions.sql`

```sql
-- Feed: filter by status + sort by created_at (keyset cursor on created_at, id)
CREATE INDEX IF NOT EXISTS idx_listings_status_created_at
  ON listings (status, created_at DESC, id DESC);

-- Seller dashboard: filter by seller (+ optional status) + sort by created_at
CREATE INDEX IF NOT EXISTS idx_listings_seller_status_created_at
  ON listings (seller_id, status, created_at DESC);
```

### Rationale

#### `idx_listings_status_created_at` — `(status, created_at DESC, id DESC)`

- **Query optimised:** `GET /listings` — the main discovery feed.
- **Why composite:** `status` is an equality predicate (`= 'active'`) and
  `created_at DESC` is the sort key. Following the "equality first, range
  second" rule, `status` leads so the planner can seek directly to the active
  partition and then walk the `created_at` ordering index-order, avoiding an
  explicit sort.
- **Why `id DESC`:** the feed uses keyset cursor pagination with the tie-breaker
  `(l.created_at, l.id) < (...)`. Including `id DESC` lets the index satisfy
  both the sort and the cursor range scan in a single index scan.
- **Why not partial (`WHERE status = 'active'`):** a partial index would be
  smaller, but the seller dashboard and admin paths filter on other statuses
  (`draft`, `paused`, `sold`, `deleted`). A general composite index serves all
  status-filtered listing queries while still being highly selective because
  `status` is the leading column.

#### `idx_listings_seller_status_created_at` — `(seller_id, status, created_at DESC)`

- **Queries optimised:**
  - `GET /users/:userId/listings` — seller dashboard (filters `seller_id` + optional `status`, sorts `created_at DESC`).
  - Active-listing count — `WHERE seller_id = $1 AND status = 'active'`.
  - Related-listings — `l.status = 'active' AND l.seller_id = $2`.
- **Why composite:** `seller_id` and `status` are both equality predicates;
  `created_at DESC` is the sort key. Equality-first, range-second ordering lets
  the planner seek to the `(seller_id, status)` sub-range and stream rows in
  `created_at DESC` order without a separate sort step.
- **Why not just `(seller_id, created_at DESC)`:** the seller dashboard
  optionally filters by `status`; having `status` as the second column means
  the index is usable both with and without the status filter (when the status
  filter is absent the planner scans the leading `seller_id` range).

---

## 6. Indexes considered but **not** added

| Candidate | Reason for rejection |
|---|---|
| `chat_messages (conversation_id, created_at)` | Already exists as `chat_messages_conversation_created_idx`. |
| `orders (user_id, created_at DESC)` | `orders` has no `user_id` column; `buyer_id` and `seller_id` variants already exist. |
| `notification_events (user_id, read_at) WHERE read_at IS NULL` | Already exists as `notification_events_unread_idx`. |
| `auction_bids (auction_id, created_at)` | Already exists as `auction_bids_auction_idx`. |
| BRIN on `listings.created_at` | The composite `(status, created_at DESC)` index already covers the time-ordered feed scan. `listings` is not strictly append-only (status/updated_at mutate), so a BRIN would add maintenance cost without a clear win. |
| Partial `listings (created_at DESC) WHERE status = 'active'` | The general composite index is preferred because it also serves non-active status filters used by the seller dashboard. |

---

## 7. Verification

- `npx tsc --noEmit` in `backend/api` — passes with 0 errors (migration is pure
  SQL; no TypeScript surface changed).
- Migration is additive (`IF NOT EXISTS`) and does not drop or modify any
  existing index.
