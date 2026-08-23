/**
 * SQLite schema for the ThryftVerse local store.
 *
 * The on-device database (`thryftverse.db`) is the source of truth for
 * offline-first surfaces: conversations, messages, the discovery feed,
 * listing drafts, product cache, and the mutation outbox that drives the
 * sync engine. All tables carry a `server_rev` (server revision vector) and
 * `sync_seq` (local monotonic sequence) so the sync engine can reconcile
 * deltas bidirectionally and detect conflicts.
 *
 * This file exports:
 *   - Drizzle-style table definitions (as SQL strings) for documentation and
 *     for any future migration to a Drizzle ORM codegen pipeline.
 *   - `SCHEMA_VERSION_1` — a single SQL string that creates every table,
 *     index, and the initial `schema_version` row. Applied atomically on
 *     first open by `db.ts` / `migrations.ts`.
 *
 * Conventions:
 *   - `server_rev`  — monotonic server revision applied to this row.
 *   - `sync_seq`    — local monotonic sequence (set on every local write).
 *   - `is_deleted`  — soft-delete tombstone; the sync engine propagates
 *                     deletes as tombstones rather than hard-removing rows.
 *   - `updated_at`  — ISO-8601 timestamp of the last local or remote write.
 *   - `*_json`      — opaque JSON blob stored as TEXT; parsed by the caller.
 */

/** Current schema version number. Bumped on every breaking migration. */
export const CURRENT_SCHEMA_VERSION = 1;

// ── Drizzle-style table definitions (SQL strings) ──────────────────────

/**
 * Per-domain sync cursor. Tracks the last server revision applied and a
 * freshness TTL so the UI can decide whether a domain is stale enough to
 * require a network pull before rendering.
 */
export const TABLE_SYNC_CURSOR = `
CREATE TABLE IF NOT EXISTS sync_cursor (
  domain            TEXT    PRIMARY KEY NOT NULL,
  last_rev          INTEGER NOT NULL DEFAULT 0,
  last_synced_at    INTEGER NOT NULL DEFAULT 0,
  freshness_ttl_ms  INTEGER NOT NULL DEFAULT 300000
);
`;

/**
 * Conversation metadata. Drives the inbox surface offline.
 */
export const TABLE_CONVERSATION = `
CREATE TABLE IF NOT EXISTS conversation (
  id                  TEXT    PRIMARY KEY NOT NULL,
  title               TEXT    NOT NULL DEFAULT '',
  type                TEXT    NOT NULL DEFAULT 'direct',
  pinned              INTEGER NOT NULL DEFAULT 0,
  archived            INTEGER NOT NULL DEFAULT 0,
  muted               INTEGER NOT NULL DEFAULT 0,
  unread_count        INTEGER NOT NULL DEFAULT 0,
  last_message_preview TEXT   NOT NULL DEFAULT '',
  last_message_at     INTEGER NOT NULL DEFAULT 0,
  server_rev          INTEGER NOT NULL DEFAULT 0,
  sync_seq            INTEGER NOT NULL DEFAULT 0,
  is_deleted          INTEGER NOT NULL DEFAULT 0,
  updated_at          TEXT    NOT NULL DEFAULT ''
);
`;

/**
 * Individual chat messages. Ordered by (conversation_id, created_at DESC).
 */
export const TABLE_MESSAGE = `
CREATE TABLE IF NOT EXISTS message (
  id                TEXT    PRIMARY KEY NOT NULL,
  conversation_id   TEXT    NOT NULL,
  sender_id         TEXT    NOT NULL DEFAULT '',
  body              TEXT    NOT NULL DEFAULT '',
  media_url         TEXT,
  status            TEXT    NOT NULL DEFAULT 'sent',
  server_rev        INTEGER NOT NULL DEFAULT 0,
  sync_seq          INTEGER NOT NULL DEFAULT 0,
  is_deleted        INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL DEFAULT 0,
  updated_at        TEXT    NOT NULL DEFAULT ''
);
`;

/**
 * Discovery feed items cached for offline browsing.
 */
export const TABLE_FEED_ITEM = `
CREATE TABLE IF NOT EXISTS feed_item (
  id              TEXT    PRIMARY KEY NOT NULL,
  type            TEXT    NOT NULL DEFAULT 'listing',
  title           TEXT    NOT NULL DEFAULT '',
  image_url       TEXT,
  image_blurhash  TEXT,
  price_text      TEXT    NOT NULL DEFAULT '',
  creator_id      TEXT    NOT NULL DEFAULT '',
  creator_name    TEXT    NOT NULL DEFAULT '',
  metadata_json   TEXT    NOT NULL DEFAULT '{}',
  server_rev      INTEGER NOT NULL DEFAULT 0,
  sync_seq        INTEGER NOT NULL DEFAULT 0,
  is_deleted      INTEGER NOT NULL DEFAULT 0,
  updated_at      TEXT    NOT NULL DEFAULT ''
);
`;

/**
 * Listing drafts authored offline. The outbox drains these to the server.
 * `sync_state` transitions: draft → pending → pushing → synced | conflict.
 */
export const TABLE_LISTING_DRAFT = `
CREATE TABLE IF NOT EXISTS listing_draft (
  id                TEXT    PRIMARY KEY NOT NULL,
  title             TEXT    NOT NULL DEFAULT '',
  description       TEXT    NOT NULL DEFAULT '',
  price             TEXT    NOT NULL DEFAULT '',
  category_id       TEXT,
  brand             TEXT,
  size              TEXT,
  condition         TEXT,
  photos_json       TEXT    NOT NULL DEFAULT '[]',
  media_draft_json  TEXT    NOT NULL DEFAULT '{}',
  tags_json         TEXT    NOT NULL DEFAULT '[]',
  listing_mode      TEXT    NOT NULL DEFAULT 'sell',
  sync_state        TEXT    NOT NULL DEFAULT 'draft',
  base_rev          INTEGER NOT NULL DEFAULT 0,
  server_rev        INTEGER NOT NULL DEFAULT 0,
  sync_seq          INTEGER NOT NULL DEFAULT 0,
  is_deleted        INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL DEFAULT 0,
  updated_at        TEXT    NOT NULL DEFAULT ''
);
`;

/**
 * Product cache for PDP and search surfaces.
 */
export const TABLE_PRODUCT = `
CREATE TABLE IF NOT EXISTS product (
  id              TEXT    PRIMARY KEY NOT NULL,
  title           TEXT    NOT NULL DEFAULT '',
  description     TEXT    NOT NULL DEFAULT '',
  price           TEXT    NOT NULL DEFAULT '',
  currency        TEXT    NOT NULL DEFAULT 'GBP',
  image_url       TEXT,
  image_blurhash  TEXT,
  brand           TEXT,
  size            TEXT,
  condition       TEXT,
  category_id     TEXT,
  seller_id       TEXT    NOT NULL DEFAULT '',
  seller_name     TEXT    NOT NULL DEFAULT '',
  metadata_json   TEXT    NOT NULL DEFAULT '{}',
  server_rev      INTEGER NOT NULL DEFAULT 0,
  sync_seq        INTEGER NOT NULL DEFAULT 0,
  is_deleted      INTEGER NOT NULL DEFAULT 0,
  updated_at      TEXT    NOT NULL DEFAULT ''
);
`;

/**
 * Mutation outbox — the queue of local operations awaiting push to the
 * server. Drained in `seq` order by the sync engine.
 *
 * `state` transitions: pending → pushing → synced | conflict | failed.
 */
export const TABLE_MUTATION_OUTBOX = `
CREATE TABLE IF NOT EXISTS mutation_outbox (
  seq            INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id   TEXT    NOT NULL UNIQUE,
  entity_type    TEXT    NOT NULL,
  entity_id      TEXT    NOT NULL,
  operation      TEXT    NOT NULL,
  payload_json   TEXT    NOT NULL DEFAULT '{}',
  base_rev       INTEGER NOT NULL DEFAULT 0,
  state          TEXT    NOT NULL DEFAULT 'pending',
  attempt_count  INTEGER NOT NULL DEFAULT 0,
  last_error     TEXT,
  created_at     INTEGER NOT NULL DEFAULT 0,
  updated_at     TEXT    NOT NULL DEFAULT ''
);
`;

/**
 * Schema version bookkeeping. A single row per applied migration.
 */
export const TABLE_SCHEMA_VERSION = `
CREATE TABLE IF NOT EXISTS schema_version (
  version      INTEGER PRIMARY KEY NOT NULL,
  applied_at   TEXT    NOT NULL DEFAULT ''
);
`;

// ── Indexes ────────────────────────────────────────────────────────────

export const INDEX_MESSAGE_CONVERSATION = `
CREATE INDEX IF NOT EXISTS idx_message_conversation_created
  ON message (conversation_id, created_at DESC);
`;

export const INDEX_FEED_ITEM_SYNC_SEQ = `
CREATE INDEX IF NOT EXISTS idx_feed_item_sync_seq
  ON feed_item (sync_seq DESC);
`;

export const INDEX_LISTING_DRAFT_SYNC_STATE = `
CREATE INDEX IF NOT EXISTS idx_listing_draft_sync_state
  ON listing_draft (sync_state)
  WHERE sync_state != 'synced';
`;

export const INDEX_PRODUCT_CATEGORY = `
CREATE INDEX IF NOT EXISTS idx_product_category_id
  ON product (category_id);
`;

export const INDEX_PRODUCT_SELLER = `
CREATE INDEX IF NOT EXISTS idx_product_seller_id
  ON product (seller_id);
`;

export const INDEX_MUTATION_OUTBOX_STATE = `
CREATE INDEX IF NOT EXISTS idx_mutation_outbox_state_seq
  ON mutation_outbox (state, seq)
  WHERE state IN ('pending', 'pushing', 'conflict');
`;

// ── Pragmas ─────────────────────────────────────────────────────────────

/**
 * Connection-level pragmas applied on every open. WAL gives concurrent
 * readers + a single writer with crash safety; `synchronous = NORMAL` is
 * the recommended companion for WAL and avoids the fsync cost of FULL.
 */
export const DB_PRAGMAS = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
`;

// ── Full v1 schema ──────────────────────────────────────────────────────

/**
 * The complete v1 schema as a single SQL string. Executed atomically on
 * first open. Creates all tables, indexes, and seeds the `schema_version`
 * row. Every statement is `IF NOT EXISTS` so re-running is idempotent.
 */
export const SCHEMA_VERSION_1 = [
  DB_PRAGMAS,
  TABLE_SYNC_CURSOR,
  TABLE_CONVERSATION,
  TABLE_MESSAGE,
  TABLE_FEED_ITEM,
  TABLE_LISTING_DRAFT,
  TABLE_PRODUCT,
  TABLE_MUTATION_OUTBOX,
  TABLE_SCHEMA_VERSION,
  INDEX_MESSAGE_CONVERSATION,
  INDEX_FEED_ITEM_SYNC_SEQ,
  INDEX_LISTING_DRAFT_SYNC_STATE,
  INDEX_PRODUCT_CATEGORY,
  INDEX_PRODUCT_SELLER,
  INDEX_MUTATION_OUTBOX_STATE,
  `INSERT OR IGNORE INTO schema_version (version, applied_at)
   VALUES (${CURRENT_SCHEMA_VERSION}, datetime('now'));`,
].join('\n');
