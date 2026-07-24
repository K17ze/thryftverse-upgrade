import assert from "node:assert/strict";
import test from "node:test";
import { Pool, type PoolClient } from "pg";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const shouldRun =
  process.env.RUN_INTEGRATION_TESTS === "true" && Boolean(databaseUrl);

async function expectConstraintViolation(
  client: PoolClient,
  sql: string,
  params: unknown[],
): Promise<void> {
  await client.query("SAVEPOINT expected_constraint_violation");
  try {
    await assert.rejects(client.query(sql, params), (error: unknown) => {
      const code = (error as { code?: unknown })?.code;
      return code === "23514" || code === "23505";
    });
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT expected_constraint_violation");
    await client.query("RELEASE SAVEPOINT expected_constraint_violation");
  }
}

test(
  "orders, payments, wallets, and Co-Own persist as one constrained commerce graph",
  {
    skip: !shouldRun,
  },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 2 });
    const client = await pool.connect();
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    const buyerId = `it_buyer_${suffix}`;
    const sellerId = `it_seller_${suffix}`;
    const listingId = `it_listing_${suffix}`;
    const orderId = `it_order_${suffix}`;
    const gatewayId = `it_gateway_${suffix}`;
    const intentId = `it_intent_${suffix}`;
    const walletId = `it_wallet_${suffix}`;
    const assetId = `it_asset_${suffix}`;

    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO users (id, username) VALUES ($1, $2), ($3, $4)`,
        [buyerId, `buyer_${suffix}`, sellerId, `seller_${suffix}`],
      );
      await client.query(
        `
        INSERT INTO listings (id, seller_id, title, description, price_gbp, status)
        VALUES ($1, $2, 'Integration jacket', 'Transactional fixture', 80, 'active')
      `,
        [listingId, sellerId],
      );
      await client.query(
        `
        INSERT INTO orders (
          id, buyer_id, seller_id, listing_id, subtotal_gbp,
          buyer_protection_fee_gbp, total_gbp, status
        )
        VALUES ($1, $2, $3, $4, 80, 4, 84, 'created')
      `,
        [orderId, buyerId, sellerId, listingId],
      );
      await client.query(
        `
        INSERT INTO payment_gateways (id, display_name, gateway_type, is_active)
        VALUES ($1, 'Integration gateway', 'fiat', TRUE)
      `,
        [gatewayId],
      );
      await client.query(
        `
        INSERT INTO payment_intents (
          id, user_id, gateway_id, channel, order_id, amount_gbp,
          amount_currency, status, idempotency_key
        )
        VALUES ($1, $2, $3, 'commerce', $4, 84, 'GBP', 'requires_confirmation', $5)
      `,
        [intentId, buyerId, gatewayId, orderId, `idem_${suffix}`],
      );
      await client.query(
        `
        INSERT INTO wallets (id, user_id, oneze_balance_mg, fiat_balance_minor, fiat_currency)
        VALUES ($1, $2, 2500, 8400, 'GBP')
      `,
        [walletId, buyerId],
      );
      await client.query(
        `
        INSERT INTO wallet_ledger (
          wallet_id, tx_id, asset, amount, balance_after, kind, ref_type, ref_id
        )
        VALUES ($1, $2, 'FIAT', 8400, 8400, 'CREDIT', 'payment_intent', $3)
      `,
        [walletId, `tx_${suffix}`, intentId],
      );
      await client.query(
        `
        INSERT INTO coOwn_assets (
          id, listing_id, issuer_id, title, total_units, available_units,
          unit_price_gbp, unit_price_stable, settlement_mode
        )
        VALUES ($1, $2, $3, 'Integration asset', 20, 20, 4, 4, 'GBP')
      `,
        [assetId, listingId, sellerId],
      );
      await client.query(
        `
        INSERT INTO coOwn_orders (
          asset_id, user_id, side, units, unit_price_gbp, fee_gbp,
          total_gbp, status, order_type, remaining_units, filled_units
        )
        VALUES ($1, $2, 'buy', 2, 4, 0.20, 8.20, 'open', 'market', 2, 0)
      `,
        [assetId, buyerId],
      );

      const graph = await client.query<{
        order_status: string;
        intent_status: string;
        wallet_balance: string;
        coown_units: number;
      }>(
        `
        SELECT
          o.status AS order_status,
          pi.status AS intent_status,
          w.fiat_balance_minor::text AS wallet_balance,
          co.units AS coown_units
        FROM orders o
        JOIN payment_intents pi ON pi.order_id = o.id
        JOIN wallets w ON w.user_id = o.buyer_id
        JOIN coOwn_orders co ON co.user_id = o.buyer_id
        WHERE o.id = $1
      `,
        [orderId],
      );

      assert.deepEqual(graph.rows[0], {
        order_status: "created",
        intent_status: "requires_confirmation",
        wallet_balance: "8400",
        coown_units: 2,
      });

      await expectConstraintViolation(
        client,
        `UPDATE wallets SET fiat_balance_minor = -1 WHERE id = $1`,
        [walletId],
      );
      await expectConstraintViolation(
        client,
        `
        INSERT INTO coOwn_orders (
          asset_id, user_id, side, units, unit_price_gbp, fee_gbp,
          total_gbp, status, order_type, remaining_units, filled_units
        )
        VALUES ($1, $2, 'buy', 21, 4, 0, 84, 'open', 'market', 21, 0)
      `,
        [assetId, buyerId],
      );
    } finally {
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
    }
  },
);

test(
  "support, reviews, collections, and notifications persist with ownership constraints",
  {
    skip: !shouldRun,
  },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 2 });
    const client = await pool.connect();
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    const buyerId = `it_experience_buyer_${suffix}`;
    const sellerId = `it_experience_seller_${suffix}`;
    const listingId = `it_experience_listing_${suffix}`;
    const orderId = `it_experience_order_${suffix}`;
    const ticketId = `it_ticket_${suffix}`;
    const reviewId = `it_review_${suffix}`;
    const collectionId = `it_collection_${suffix}`;
    const notificationId = `it_notification_${suffix}`;

    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO users (id, username) VALUES ($1, $2), ($3, $4)`,
        [
          buyerId,
          `experience_buyer_${suffix}`,
          sellerId,
          `experience_seller_${suffix}`,
        ],
      );
      await client.query(
        `
        INSERT INTO listings (id, seller_id, title, description, price_gbp, status)
        VALUES ($1, $2, 'Integration coat', 'Experience fixture', 120, 'active')
      `,
        [listingId, sellerId],
      );
      await client.query(
        `
        INSERT INTO orders (
          id, buyer_id, seller_id, listing_id, subtotal_gbp,
          buyer_protection_fee_gbp, total_gbp, status
        )
        VALUES ($1, $2, $3, $4, 120, 6, 126, 'delivered')
      `,
        [orderId, buyerId, sellerId, listingId],
      );
      await client.query(
        `
        INSERT INTO support_tickets (
          id, user_id, order_id, topic_id, topic_label, details, status
        )
        VALUES ($1, $2, $3, 'delivery', 'Delivery issue', 'Parcel arrived damaged', 'open')
      `,
        [ticketId, buyerId, orderId],
      );
      await client.query(
        `
        INSERT INTO order_reviews (
          id, order_id, reviewer_id, seller_id, rating, comment
        )
        VALUES ($1, $2, $3, $4, 5, 'Accurate listing')
      `,
        [reviewId, orderId, buyerId, sellerId],
      );
      await client.query(
        `
        INSERT INTO collections (id, user_id, name, is_private)
        VALUES ($1, $2, 'Wardrobe', TRUE)
      `,
        [collectionId, buyerId],
      );
      await client.query(
        `
        INSERT INTO collection_items (collection_id, listing_id)
        VALUES ($1, $2)
      `,
        [collectionId, listingId],
      );
      await client.query(
        `
        INSERT INTO notification_devices (user_id, provider, platform, token)
        VALUES ($1, 'expo', 'ios', $2)
      `,
        [buyerId, `ExponentPushToken[${suffix}]`],
      );
      await client.query(
        `
        INSERT INTO notification_events (
          id, user_id, channel, title, body, status, event_type, idempotency_key
        )
        VALUES (
          $1, $2, 'push', 'Order delivered', 'Your order was delivered',
          'queued', 'order_delivered', $3
        )
      `,
        [notificationId, buyerId, `it_notification_${suffix}`],
      );
      await client.query(
        `
        INSERT INTO notification_preferences (user_id, category, enabled)
        VALUES ($1, 'orderUpdates', FALSE)
        ON CONFLICT (user_id, category)
        DO UPDATE SET enabled = EXCLUDED.enabled
      `,
        [buyerId],
      );

      const graph = await client.query<{
        ticket_status: string;
        rating: number;
        item_count: string;
        notification_status: string;
        order_updates_enabled: boolean;
      }>(
        `
        SELECT
          st.status AS ticket_status,
          reviews.rating,
          (
            SELECT COUNT(*)::text
            FROM collection_items ci
            WHERE ci.collection_id = $3
          ) AS item_count,
          events.status AS notification_status,
          preferences.enabled AS order_updates_enabled
        FROM support_tickets st
        JOIN order_reviews reviews ON reviews.order_id = st.order_id
        JOIN notification_events events ON events.user_id = st.user_id
        JOIN notification_preferences preferences
          ON preferences.user_id = st.user_id
         AND preferences.category = 'orderUpdates'
        WHERE st.id = $1 AND events.id = $2
      `,
        [ticketId, notificationId, collectionId],
      );

      assert.deepEqual(graph.rows[0], {
        ticket_status: "open",
        rating: 5,
        item_count: "1",
        notification_status: "queued",
        order_updates_enabled: false,
      });

      await expectConstraintViolation(
        client,
        `
        INSERT INTO order_reviews (
          id, order_id, reviewer_id, seller_id, rating
        )
        VALUES ($1, $2, $3, $4, 6)
      `,
        [`it_invalid_review_${suffix}`, orderId, buyerId, sellerId],
      );
      await expectConstraintViolation(
        client,
        `
        INSERT INTO collection_items (collection_id, listing_id)
        VALUES ($1, $2)
      `,
        [collectionId, listingId],
      );
      await expectConstraintViolation(
        client,
        `
        INSERT INTO notification_preferences (user_id, category, enabled)
        VALUES ($1, 'unsupported', TRUE)
      `,
        [buyerId],
      );
    } finally {
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
    }
  },
);
