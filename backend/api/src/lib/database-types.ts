/**
 * AUTO-GENERATED-TARGET — Kysely database type definitions.
 *
 * This file defines the `Database` interface consumed by the Kysely
 * type-safe query builder. Each interface maps to a PostgreSQL table;
 * column types are inferred from the 112 SQL migrations.
 *
 * Generation workflow:
 *   1. Start the backend with a live Postgres instance.
 *   2. Run `npm run db:types` (kysely-codegen) to introspect the live
 *      schema and regenerate this file.
 *   3. Commit the regenerated file.
 *
 * Until a live DB introspection is performed, this file is hand-maintained
 * from the migration SQL files. It covers the core tables used by the
 * extracted route files. As more routes migrate to Kysely, extend the
 * Database interface with additional tables.
 *
 * DO NOT hand-edit individual table interfaces after switching to
 * kysely-codegen — regenerate the whole file instead.
 */

import type {
  ColumnType,
  Generated,
  GeneratedAlways,
} from "kysely";

// ── Core tables (migration 001_init.sql) ──────────────────────────────

export interface UserTable {
  id: string;
  username: string;
  created_at: GeneratedAlways<Date>;
}

export interface ListingTable {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  price_gbp: ColumnType<number | string, string | number, string | number>;
  image_url: string | null;
  created_at: GeneratedAlways<Date>;
  // Extended by later migrations:
  status: ColumnType<string, string, string>;
  updated_at: ColumnType<Date | null, string | null | undefined, string | null>;
  brand: string | null;
  size: string | null;
  category: string | null;
  condition: string | null;
  color: string | null;
  shipping_gbp: ColumnType<number | string | null, string | number | null, string | number | null>;
  is_auction: Generated<boolean>;
  is_reserved: Generated<boolean>;
}

export interface InteractionTable {
  id: Generated<number>;
  user_id: string;
  listing_id: string;
  action: "view" | "wishlist" | "purchase";
  strength: ColumnType<number | string, string | number, string | number>;
  created_at: GeneratedAlways<Date>;
}

export interface RecommendationTable {
  user_id: string;
  listing_id: string;
  score: ColumnType<number | string, string | number, string | number>;
  source: Generated<string>;
  created_at: GeneratedAlways<Date>;
}

// ── Collections (migration 038_collections.sql) ───────────────────────

export interface CollectionTable {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_private: Generated<boolean>;
  created_at: GeneratedAlways<Date>;
  updated_at: Generated<Date>;
}

export interface CollectionItemTable {
  collection_id: string;
  listing_id: string;
  added_at: GeneratedAlways<Date>;
}

// ── Listing offers (migration 062_listing_offers.sql) ─────────────────

export interface ListingOfferTable {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  offer_price_gbp: ColumnType<number | string, string | number, string | number>;
  original_price_gbp: ColumnType<number | string, string | number, string | number>;
  counter_round: Generated<number>;
  status: string;
  expires_at: string;
  accepted_at: string | null;
  declined_at: string | null;
  expired_at: string | null;
  cancelled_at: string | null;
  conversation_id: string | null;
  parent_offer_id: string | null;
  metadata: ColumnType<unknown, unknown, unknown>;
  offered_by_user_id: string | null;
  idempotency_key: string | null;
  request_hash: string | null;
  created_at: GeneratedAlways<Date>;
  updated_at: GeneratedAlways<Date>;
}

// ── Notifications (migration 043_notification_centre_truth.sql) ───────

export interface NotificationDeviceTable {
  id: string;
  user_id: string;
  provider: string;
  platform: string;
  token: string;
  is_active: Generated<boolean>;
  app_version: string | null;
  created_at: GeneratedAlways<Date>;
  last_seen_at: ColumnType<Date | null, string | null | undefined, string | null>;
}

export interface NotificationEventTable {
  id: string;
  user_id: string;
  category: string;
  type: string;
  payload: ColumnType<Record<string, unknown>, unknown, unknown>;
  route: ColumnType<Record<string, unknown> | null, unknown, unknown>;
  is_read: Generated<boolean>;
  created_at: GeneratedAlways<Date>;
  read_at: ColumnType<Date | null, string | null | undefined, string | null>;
}

// ── Creator documents (migration 030_creator_tools.sql) ──────────────

export interface CreatorDocumentTable {
  id: string;
  creator_id: string;
  document_type: string;
  status: string;
  document_json: string;
  document_hash: string | null;
  revision_number: Generated<number>;
  lock_version: Generated<number>;
  idempotency_key: string | null;
  published_at: ColumnType<Date | null, string | null | undefined, string | null>;
  created_at: GeneratedAlways<Date>;
  updated_at: GeneratedAlways<Date>;
}

// ── Domain outbox (migration 069_transactional_domain_outbox.sql) ────

export interface DomainOutboxTable {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: ColumnType<Record<string, unknown>, unknown, unknown>;
  status: Generated<string>;
  attempts: Generated<number>;
  last_error: string | null;
  next_attempt_at: ColumnType<Date, string | undefined, string | null>;
  created_at: GeneratedAlways<Date>;
  updated_at: GeneratedAlways<Date>;
}

// ── Orders (migration 003_market_commerce.sql) ────────────────────────

export interface OrderTable {
  id: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string;
  status: string;
  total_gbp: ColumnType<number | string, string | number, string | number>;
  created_at: GeneratedAlways<Date>;
  updated_at: GeneratedAlways<Date>;
}

// ── Chat (migration 010_chat_groups_and_bots.sql) ─────────────────────

export interface ChatConversationTable {
  id: string;
  type: string;
  name: string | null;
  created_at: GeneratedAlways<Date>;
  updated_at: GeneratedAlways<Date>;
}

export interface ChatMessageTable {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  created_at: GeneratedAlways<Date>;
}

// ── Kysely Database interface ─────────────────────────────────────────
// Add tables here as more routes migrate to Kysely. Each key maps to
// the table's row interface. Kysely uses this to type all queries.

export interface Database {
  users: UserTable;
  listings: ListingTable;
  interactions: InteractionTable;
  recommendations: RecommendationTable;
  collections: CollectionTable;
  collection_items: CollectionItemTable;
  listing_offers: ListingOfferTable;
  notification_devices: NotificationDeviceTable;
  notification_events: NotificationEventTable;
  creator_documents: CreatorDocumentTable;
  domain_outbox: DomainOutboxTable;
  orders: OrderTable;
  chat_conversations: ChatConversationTable;
  chat_messages: ChatMessageTable;
}
