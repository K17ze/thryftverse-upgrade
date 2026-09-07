const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://thryftverse:thryftverse@localhost:5432/thryftverse' });

async function main() {
  const listingId = 'seed_l8';
  const sellerId = 'seed_u1';
  const periodDays = 30;

  try {
    const r1 = await pool.query(
      `SELECT l.id, l.title, l.price_gbp, l.status, l.image_url,
              l.category, l.brand, l.condition, l.created_at,
              (SELECT o.paid_at FROM orders o
               WHERE o.listing_id = l.id AND o.status IN ('paid','shipped','delivered')
                 AND o.paid_at IS NOT NULL
               ORDER BY o.paid_at DESC LIMIT 1) AS sold_at
       FROM listings l
       WHERE l.id = $1 AND l.seller_id = $2 LIMIT 1`,
      [listingId, sellerId]
    );
    console.log('Query 1 (listing) OK:', r1.rows[0]);

    const r2 = await pool.query(
      `SELECT
         COUNT(i.id) FILTER (WHERE i.action IN ('view', 'qualified_detail_view')) AS views,
         COUNT(i.id) FILTER (WHERE i.action = 'save') AS saves,
         COUNT(i.id) FILTER (WHERE i.action = 'offer_start') AS offers,
         COUNT(i.id) FILTER (WHERE i.action = 'wishlist') AS likes
       FROM interactions i
       WHERE i.listing_id = $1 AND i.created_at >= NOW() - $2::interval`,
      [listingId, `${periodDays} days`]
    );
    console.log('Query 2 (interactions) OK:', r2.rows[0]);

    const r3 = await pool.query(
      `SELECT previous_price_gbp, new_price_gbp, changed_at
       FROM listing_price_events
       WHERE listing_id = $1
       ORDER BY changed_at DESC
       LIMIT 50`,
      [listingId]
    );
    console.log('Query 3 (price events) OK, count:', r3.rows.length);

    const r4 = await pool.query(
      `SELECT o.subtotal_gbp AS price_gbp, o.paid_at AS sold_at
       FROM orders o
       INNER JOIN listings l ON l.id = o.listing_id
       WHERE o.listing_id <> $1
         AND o.status IN ('paid', 'shipped', 'delivered')
         AND o.paid_at IS NOT NULL
         AND l.status = 'sold'
         AND LOWER(l.category) = LOWER($2)
         AND ($3::text IS NULL OR LOWER(l.brand) = LOWER($3))
       ORDER BY o.paid_at DESC
       LIMIT 100`,
      [listingId, 'women', 'Jacquemus']
    );
    console.log('Query 4 (comparables) OK, count:', r4.rows.length);

    const r5 = await pool.query(
      `SELECT COUNT(*)::text AS count FROM orders
       WHERE listing_id = $1 AND seller_id = $2
         AND status IN ('paid', 'shipped', 'delivered')
         AND paid_at IS NOT NULL
         AND paid_at >= NOW() - $3::interval`,
      [listingId, sellerId, `${periodDays} days`]
    );
    console.log('Query 5 (purchases) OK:', r5.rows[0]);
  } catch (err) {
    console.error('Error running queries:', err);
  } finally {
    await pool.end();
  }
}

main();
