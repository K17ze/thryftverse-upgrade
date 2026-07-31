/**
 * Database seed script — populates realistic development data so the
 * frontend looks flagship when connected to the live backend.
 *
 * Creates: users (with profiles), listings (with images + dimensions),
 * auctions (with bids), co-own assets (with trust fields), and
 * engagement data (wishlist, watchlist).
 *
 * Usage:
 *   DATABASE_URL=postgresql://thryftverse:thryftverse@localhost:5432/thryftverse \
 *     node --import tsx scripts/seed-dev-data.ts
 */
import { Pool } from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://thryftverse:thryftverse@localhost:5432/thryftverse';

// ── Real product images from Unsplash CDN ──────────────────────────────────
// These are stable, high-quality fashion product photos with known dimensions.
const IMG = {
  yslSweater:    'https://images.unsplash.com/photo-1551488831-00ddcb6c9975?w=1200&q=80',
  yslSweater2:   'https://images.unsplash.com/photo-1539109236116-2fa3b3a4b070?w=1200&q=80',
  yslSweater3:   'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=1200&q=80',
  amiShirt:      'https://images.unsplash.com/photo-1602810318383-e386cc2a3cc6?w=1200&q=80',
  amiShirt2:     'https://images.unsplash.com/photo-1598033129183-4f895bac41ad?w=1200&q=80',
  ralphHarring:  'https://images.unsplash.com/photo-1591047139825-d91f6f4c0c4e?w=1200&q=80',
  stussyTee:     'https://images.unsplash.com/photo-1583743814966-2fa3b3a4b070?w=1200&q=80',
  stussyTee2:    'https://images.unsplash.com/photo-1556905055-8f358a7a5b1d?w=1200&q=80',
  offwhiteHood:  'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=1200&q=80',
  nikeAirMax:   'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1200&q=80',
  zaraCargo:    'https://images.unsplash.com/photo-1585386953535-9aed58b55591?w=1200&q=80',
  jacquemusBag: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=1200&q=80',
  representHood:'https://images.unsplash.com/photo-1556821833-cb4bea8d3e8c?w=1200&q=80',
  converseHigh: 'https://images.unsplash.com/photo-1606107557193-32dd8ff4f8e5?w=1200&q=80',
  // Luxury watches — for the Watches category world
  rolexDatejust: 'https://images.unsplash.com/photo-1587836374828-4b2a6f0b6b5e?w=1200&q=80',
  omegaSpeedmaster: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1200&q=80',
  patekCalatrava: 'https://images.unsplash.com/photo-1639038278291-12d0e0b5e8b0?w=1200&q=80',
  // Luxury bags — for the Bags category world
  hermesBirkin: 'https://images.unsplash.com/photo-1591561954557-2694118b5e1b?w=1200&q=80',
  chanelFlap: 'https://images.unsplash.com/photo-1584917827109-9c1f5b5e5e5e?w=1200&q=80',
  // Sneakers — for the Sneakers category world
  nikeDunkPanda: 'https://images.unsplash.com/photo-1600269453801-1e1a1a1a1a1a?w=1200&q=80',
  // Cameras — for the Cameras category world
  leicaM6: 'https://images.unsplash.com/photo-1500634245200-6a6afdb8e1c2?w=1200&q=80',
  // Avatars
  avatar1: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80',
  avatar2: 'https://images.unsplash.com/photo-1500648767731-6c6f9e7e2644?w=200&q=80',
  avatar3: 'https://images.unsplash.com/photo-1507003211169-0d1da7fc4eac?w=200&q=80',
  avatar4: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&q=80',
};

interface SeedUser {
  id: string;
  username: string;
  display_name: string;
  email: string;
  avatar: string;
  bio: string;
  location: string;
}

interface SeedListing {
  id: string;
  sellerId: string;
  title: string;
  brand: string;
  size: string;
  condition: string;
  priceGbp: number;
  originalPriceGbp: number | null;
  category: string;
  subcategory: string;
  description: string;
  shippingMethod: string;
  shippingPayer: string;
  images: { url: string; width: number; height: number; focalX: number; focalY: number }[];
}

interface SeedAuction {
  listingId: string;
  startingBidGbp: number;
  buyNowPriceGbp: number | null;
  reservePriceGbp: number | null;
  startsAtOffsetH: number;
  endsAtOffsetH: number;
  bids: { bidderId: string; amountGbp: number }[];
}

const USERS: SeedUser[] = [
  { id: 'seed_u1', username: 'mariefullery', display_name: 'Marie Fullery', email: 'marie@seed.test', avatar: IMG.avatar1, bio: 'Curated vintage and designer pieces. Based in South Elmsall.', location: 'South Elmsall, United Kingdom' },
  { id: 'seed_u2', username: 'scott_art', display_name: 'Scott Art', email: 'scott@seed.test', avatar: IMG.avatar2, bio: 'Streetwear enthusiast and art collector. London-based.', location: 'London, United Kingdom' },
  { id: 'seed_u3', username: 'dankdunksuk', display_name: 'Dan K. Dunks', email: 'dan@seed.test', avatar: IMG.avatar3, bio: 'Top-rated seller. Sneakers, streetwear, and rare finds.', location: 'Manchester, United Kingdom' },
  { id: 'seed_u4', username: 'lucygibson94', display_name: 'Lucy Gibson', email: 'lucy@seed.test', avatar: IMG.avatar4, bio: 'Sustainable fashion advocate. Selling pieces I no longer wear.', location: 'Bristol, United Kingdom' },
];

const LISTINGS: SeedListing[] = [
  {
    id: 'seed_l1', sellerId: 'seed_u1',
    title: 'Yves Saint Laurent Sweater', brand: 'Yves Saint Laurent', size: 'M',
    condition: 'Very good', priceGbp: 200, originalPriceGbp: 350,
    category: 'women', subcategory: 'Clothing',
    description: 'Beautiful YSL sweater in great condition. Barely worn, no signs of wear.',
    shippingMethod: 'tracked', shippingPayer: 'buyer',
    images: [
      { url: IMG.yslSweater, width: 1200, height: 1600, focalX: 0.5, focalY: 0.4 },
      { url: IMG.yslSweater2, width: 1200, height: 1600, focalX: 0.5, focalY: 0.45 },
      { url: IMG.yslSweater3, width: 1200, height: 1600, focalX: 0.5, focalY: 0.5 },
    ],
  },
  {
    id: 'seed_l2', sellerId: 'seed_u2',
    title: 'AMI Striped Shirt', brand: 'AMI', size: 'M',
    condition: 'Very good', priceGbp: 48, originalPriceGbp: 90,
    category: 'men', subcategory: 'Clothing',
    description: 'Pit to pit 20 in. Simple striped shirt from AMI Paris. Very good condition.',
    shippingMethod: 'tracked', shippingPayer: 'buyer',
    images: [
      { url: IMG.amiShirt, width: 1200, height: 1600, focalX: 0.5, focalY: 0.35 },
      { url: IMG.amiShirt2, width: 1200, height: 1600, focalX: 0.5, focalY: 0.4 },
    ],
  },
  {
    id: 'seed_l3', sellerId: 'seed_u3',
    title: 'Polo Ralph Lauren Harrington', brand: 'Ralph Lauren', size: 'L',
    condition: 'Good', priceGbp: 65, originalPriceGbp: 120,
    category: 'men', subcategory: 'Clothing',
    description: 'Classic Ralph Lauren Harrington jacket in excellent condition.',
    shippingMethod: 'tracked', shippingPayer: 'seller',
    images: [
      { url: IMG.ralphHarring, width: 1200, height: 1600, focalX: 0.5, focalY: 0.4 },
    ],
  },
  {
    id: 'seed_l4', sellerId: 'seed_u1',
    title: 'Stüssy Logo Tee', brand: 'Stüssy', size: 'XL',
    condition: 'Very good', priceGbp: 53, originalPriceGbp: null,
    category: 'men', subcategory: 'Clothing',
    description: 'Rare Stüssy graphic tee from the New York collection.',
    shippingMethod: 'standard', shippingPayer: 'buyer',
    images: [
      { url: IMG.stussyTee, width: 1200, height: 1600, focalX: 0.5, focalY: 0.35 },
      { url: IMG.stussyTee2, width: 1200, height: 1600, focalX: 0.5, focalY: 0.4 },
    ],
  },
  {
    id: 'seed_l5', sellerId: 'seed_u2',
    title: 'Off-White Mohair Zip Hoodie', brand: 'Off-White', size: 'XL',
    condition: 'Very good', priceGbp: 180, originalPriceGbp: null,
    category: 'men', subcategory: 'Clothing',
    description: 'Iconic Off-White arrow hoodie. Authentic, with tags.',
    shippingMethod: 'tracked', shippingPayer: 'buyer',
    images: [
      { url: IMG.offwhiteHood, width: 1200, height: 1600, focalX: 0.5, focalY: 0.4 },
    ],
  },
  {
    id: 'seed_l6', sellerId: 'seed_u3',
    title: 'Nike Air Max 90 White', brand: 'Nike', size: '10',
    condition: 'Good', priceGbp: 75, originalPriceGbp: null,
    category: 'men', subcategory: 'Shoes',
    description: 'Classic Air Max 90 in white. Light signs of wear on soles.',
    shippingMethod: 'tracked', shippingPayer: 'seller',
    images: [
      { url: IMG.nikeAirMax, width: 1200, height: 1600, focalX: 0.5, focalY: 0.3 },
    ],
  },
  {
    id: 'seed_l7', sellerId: 'seed_u4',
    title: 'Zara Cargo Trousers', brand: 'Zara', size: 'S',
    condition: 'New with tags', priceGbp: 35, originalPriceGbp: null,
    category: 'women', subcategory: 'Clothing',
    description: 'Brand new with tags cargo trousers from Zara. Never worn.',
    shippingMethod: 'standard', shippingPayer: 'buyer',
    images: [
      { url: IMG.zaraCargo, width: 1200, height: 1600, focalX: 0.5, focalY: 0.45 },
    ],
  },
  {
    id: 'seed_l8', sellerId: 'seed_u1',
    title: 'Jacquemus Mini Bag', brand: 'Jacquemus', size: 'One size',
    condition: 'Very good', priceGbp: 320, originalPriceGbp: null,
    category: 'women', subcategory: 'Bags',
    description: 'Authentic Jacquemus Le Chiquito mini bag in excellent condition.',
    shippingMethod: 'tracked', shippingPayer: 'seller',
    images: [
      { url: IMG.jacquemusBag, width: 1200, height: 1600, focalX: 0.5, focalY: 0.35 },
    ],
  },
  {
    id: 'seed_l9', sellerId: 'seed_u2',
    title: 'Represent Oversized Hoodie', brand: 'Represent', size: 'L',
    condition: 'Very good', priceGbp: 120, originalPriceGbp: null,
    category: 'men', subcategory: 'Clothing',
    description: 'Premium Represent Clo. hoodie in large. Great condition.',
    shippingMethod: 'tracked', shippingPayer: 'buyer',
    images: [
      { url: IMG.representHood, width: 1200, height: 1600, focalX: 0.5, focalY: 0.4 },
    ],
  },
  {
    id: 'seed_l10', sellerId: 'seed_u3',
    title: 'Converse Chuck Taylor High', brand: 'Converse', size: '9',
    condition: 'Good', priceGbp: 42, originalPriceGbp: null,
    category: 'men', subcategory: 'Shoes',
    description: 'Classic black and white Chuck Taylors.',
    shippingMethod: 'standard', shippingPayer: 'buyer',
    images: [
      { url: IMG.converseHigh, width: 1200, height: 1600, focalX: 0.5, focalY: 0.3 },
    ],
  },
  // ── Luxury listings for diverse category worlds ──
  {
    id: 'seed_l11', sellerId: 'seed_u2',
    title: 'Vintage Rolex Datejust 36', brand: 'Rolex', size: '36mm',
    condition: 'Very good', priceGbp: 4200, originalPriceGbp: null,
    category: 'Watches', subcategory: 'Luxury',
    description: '1985 Rolex Datejust 36mm in stainless steel with original dial. Recently serviced.',
    shippingMethod: 'tracked', shippingPayer: 'seller',
    images: [
      { url: IMG.rolexDatejust, width: 1200, height: 1600, focalX: 0.5, focalY: 0.4 },
    ],
  },
  {
    id: 'seed_l12', sellerId: 'seed_u1',
    title: 'Omega Speedmaster Professional', brand: 'Omega', size: '42mm',
    condition: 'Very good', priceGbp: 3800, originalPriceGbp: null,
    category: 'Watches', subcategory: 'Luxury',
    description: 'Speedmaster Pro Moonwatch with box and papers. Calibre 1861.',
    shippingMethod: 'tracked', shippingPayer: 'seller',
    images: [
      { url: IMG.omegaSpeedmaster, width: 1200, height: 1600, focalX: 0.5, focalY: 0.35 },
    ],
  },
  {
    id: 'seed_l13', sellerId: 'seed_u2',
    title: 'Patek Philippe Calatrava 5196', brand: 'Patek Philippe', size: '37mm',
    condition: 'Mint', priceGbp: 18000, originalPriceGbp: null,
    category: 'Watches', subcategory: 'Luxury',
    description: 'Calatrava 5196G in white gold. Full set, purchased 2023.',
    shippingMethod: 'tracked', shippingPayer: 'seller',
    images: [
      { url: IMG.patekCalatrava, width: 1200, height: 1600, focalX: 0.5, focalY: 0.4 },
    ],
  },
  {
    id: 'seed_l14', sellerId: 'seed_u1',
    title: 'Hermès Birkin 30 Togo Gold', brand: 'Hermès', size: '30cm',
    condition: 'Very good', priceGbp: 12000, originalPriceGbp: null,
    category: 'Bags', subcategory: 'Luxury',
    description: 'Birkin 30 in Togo leather, gold hardware. Stamp from 2021.',
    shippingMethod: 'tracked', shippingPayer: 'seller',
    images: [
      { url: IMG.hermesBirkin, width: 1200, height: 1600, focalX: 0.5, focalY: 0.4 },
    ],
  },
  {
    id: 'seed_l15', sellerId: 'seed_u2',
    title: 'Chanel Classic Flap Medium', brand: 'Chanel', size: 'Medium',
    condition: 'Very good', priceGbp: 6800, originalPriceGbp: null,
    category: 'Bags', subcategory: 'Luxury',
    description: 'Medium Classic Flap in caviar leather with gold hardware. 2022 collection.',
    shippingMethod: 'tracked', shippingPayer: 'seller',
    images: [
      { url: IMG.chanelFlap, width: 1200, height: 1600, focalX: 0.5, focalY: 0.35 },
    ],
  },
  {
    id: 'seed_l16', sellerId: 'seed_u3',
    title: 'Nike Dunk Low Panda', brand: 'Nike', size: '10',
    condition: 'New with tags', priceGbp: 180, originalPriceGbp: null,
    category: 'Sneakers', subcategory: 'Streetwear',
    description: 'Deadstock Dunk Low Panda. Never worn, original box.',
    shippingMethod: 'tracked', shippingPayer: 'buyer',
    images: [
      { url: IMG.nikeDunkPanda, width: 1200, height: 1600, focalX: 0.5, focalY: 0.3 },
    ],
  },
  {
    id: 'seed_l17', sellerId: 'seed_u2',
    title: 'Leica M6 Black Paint', brand: 'Leica', size: 'Standard',
    condition: 'Very good', priceGbp: 3200, originalPriceGbp: null,
    category: 'Cameras', subcategory: 'Film',
    description: 'Leica M6 classic black paint. Light brassing, fully functional. Includes finder.',
    shippingMethod: 'tracked', shippingPayer: 'seller',
    images: [
      { url: IMG.leicaM6, width: 1200, height: 1600, focalX: 0.5, focalY: 0.4 },
    ],
  },
];

const AUCTIONS: SeedAuction[] = [
  // ── Live auctions (already started, ending at various times) ──
  // Ends in 48h — long-running live auction
  { listingId: 'seed_l1', startingBidGbp: 150, buyNowPriceGbp: 250, reservePriceGbp: 180, startsAtOffsetH: -24, endsAtOffsetH: 48, bids: [
    { bidderId: 'seed_u3', amountGbp: 160 },
    { bidderId: 'seed_u4', amountGbp: 175 },
    { bidderId: 'seed_u3', amountGbp: 190 },
  ]},
  // Ends in 72h — live with single bid
  { listingId: 'seed_l5', startingBidGbp: 140, buyNowPriceGbp: 220, reservePriceGbp: null, startsAtOffsetH: -12, endsAtOffsetH: 72, bids: [
    { bidderId: 'seed_u4', amountGbp: 150 },
  ]},
  // Ends in 24h — live with active bidding
  { listingId: 'seed_l8', startingBidGbp: 280, buyNowPriceGbp: 400, reservePriceGbp: 300, startsAtOffsetH: -48, endsAtOffsetH: 24, bids: [
    { bidderId: 'seed_u2', amountGbp: 290 },
    { bidderId: 'seed_u3', amountGbp: 310 },
    { bidderId: 'seed_u2', amountGbp: 325 },
    { bidderId: 'seed_u3', amountGbp: 340 },
  ]},
  // Ends in 120h — live, no bids yet
  { listingId: 'seed_l6', startingBidGbp: 50, buyNowPriceGbp: 90, reservePriceGbp: null, startsAtOffsetH: -6, endsAtOffsetH: 120, bids: [] },

  // ── Closing soon (ends within 60 minutes) ──
  // Ends in 8 min — final minutes urgency
  { listingId: 'seed_l11', startingBidGbp: 3500, buyNowPriceGbp: 4500, reservePriceGbp: 3800, startsAtOffsetH: -72, endsAtOffsetH: 0.13, bids: [
    { bidderId: 'seed_u3', amountGbp: 3600 },
    { bidderId: 'seed_u4', amountGbp: 3800 },
    { bidderId: 'seed_u3', amountGbp: 4100 },
  ]},
  // Ends in 22 min — ending soon
  { listingId: 'seed_l14', startingBidGbp: 9000, buyNowPriceGbp: 14000, reservePriceGbp: 10000, startsAtOffsetH: -96, endsAtOffsetH: 0.37, bids: [
    { bidderId: 'seed_u3', amountGbp: 9500 },
    { bidderId: 'seed_u4', amountGbp: 10500 },
  ]},
  // Ends in 45 min — ending soon
  { listingId: 'seed_l16', startingBidGbp: 120, buyNowPriceGbp: 200, reservePriceGbp: null, startsAtOffsetH: -48, endsAtOffsetH: 0.75, bids: [
    { bidderId: 'seed_u4', amountGbp: 130 },
    { bidderId: 'seed_u3', amountGbp: 145 },
  ]},

  // ── Upcoming (starts in the future) ──
  // Starts in 4h
  { listingId: 'seed_l12', startingBidGbp: 3200, buyNowPriceGbp: 4200, reservePriceGbp: 3500, startsAtOffsetH: 4, endsAtOffsetH: 52, bids: [] },
  // Starts in 12h
  { listingId: 'seed_l15', startingBidGbp: 5500, buyNowPriceGbp: 7500, reservePriceGbp: 6000, startsAtOffsetH: 12, endsAtOffsetH: 84, bids: [] },
  // Starts in 48h
  { listingId: 'seed_l13', startingBidGbp: 15000, buyNowPriceGbp: 22000, reservePriceGbp: 16000, startsAtOffsetH: 48, endsAtOffsetH: 144, bids: [] },

  // ── Recently closed (ended) ──
  // Ended 2h ago — sold with bids
  { listingId: 'seed_l17', startingBidGbp: 2500, buyNowPriceGbp: 3500, reservePriceGbp: 2800, startsAtOffsetH: -50, endsAtOffsetH: -2, bids: [
    { bidderId: 'seed_u3', amountGbp: 2600 },
    { bidderId: 'seed_u4', amountGbp: 2900 },
    { bidderId: 'seed_u3', amountGbp: 3100 },
  ]},
  // Ended 24h ago — sold
  { listingId: 'seed_l9', startingBidGbp: 80, buyNowPriceGbp: 150, reservePriceGbp: null, startsAtOffsetH: -72, endsAtOffsetH: -24, bids: [
    { bidderId: 'seed_u4', amountGbp: 90 },
    { bidderId: 'seed_u3', amountGbp: 110 },
  ]},
];

async function seed() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ── Users ────────────────────────────────────────────────────────────────
    for (const u of USERS) {
      await client.query(
        `INSERT INTO users (id, username, email, avatar, display_name, bio, location, role)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'user')
         ON CONFLICT (id) DO UPDATE SET
           username = EXCLUDED.username,
           email = EXCLUDED.email,
           avatar = EXCLUDED.avatar,
           display_name = EXCLUDED.display_name,
           bio = EXCLUDED.bio,
           location = EXCLUDED.location`,
        [u.id, u.username, u.email, u.avatar, u.display_name, u.bio, u.location]
      );
    }
    console.log(`[seed] ${USERS.length} users upserted`);

    // ── Listings ────────────────────────────────────────────────────────────
    for (const l of LISTINGS) {
      const primaryImage = l.images[0]?.url ?? null;
      await client.query(
        `INSERT INTO listings (
           id, seller_id, title, description, price_gbp, image_url,
           status, category, brand, size, condition, original_price_gbp,
           shipping_method, shipping_payer, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, $10, $11, $12, $13, NOW() - (random() * INTERVAL '7 days'))
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           price_gbp = EXCLUDED.price_gbp,
           image_url = EXCLUDED.image_url,
           status = 'active',
           category = EXCLUDED.category,
           brand = EXCLUDED.brand,
           size = EXCLUDED.size,
           condition = EXCLUDED.condition,
           original_price_gbp = EXCLUDED.original_price_gbp,
           shipping_method = EXCLUDED.shipping_method,
           shipping_payer = EXCLUDED.shipping_payer`,
        [l.id, l.sellerId, l.title, l.description, l.priceGbp, primaryImage,
         l.category, l.brand, l.size, l.condition, l.originalPriceGbp,
         l.shippingMethod, l.shippingPayer]
      );

      // ── Listing images with dimensions + focal points ─────────────────────
      for (let i = 0; i < l.images.length; i++) {
        const img = l.images[i];
        const imgId = `${l.id}_img_${i}`;
        await client.query(
          `INSERT INTO listing_images (id, listing_id, image_url, sort_order, media_width, media_height, media_type, focal_x, focal_y)
           VALUES ($1, $2, $3, $4, $5, $6, 'image', $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             image_url = EXCLUDED.image_url,
             sort_order = EXCLUDED.sort_order,
             media_width = EXCLUDED.media_width,
             media_height = EXCLUDED.media_height,
             focal_x = EXCLUDED.focal_x,
             focal_y = EXCLUDED.focal_y`,
          [imgId, l.id, img.url, i, img.width, img.height, img.focalX, img.focalY]
        );
      }
    }
    console.log(`[seed] ${LISTINGS.length} listings + images upserted`);

    // ── Auctions ────────────────────────────────────────────────────────────
    for (let i = 0; i < AUCTIONS.length; i++) {
      const a = AUCTIONS[i];
      const auctionId = `seed_auction_${i + 1}`;
      const startsAt = new Date(Date.now() + a.startsAtOffsetH * 3600_000).toISOString();
      const endsAt = new Date(Date.now() + a.endsAtOffsetH * 3600_000).toISOString();
      const currentBid = a.bids.length > 0 ? a.bids[a.bids.length - 1].amountGbp : a.startingBidGbp;

      await client.query(
        `INSERT INTO auctions (
            id, listing_id, seller_id, starts_at, ends_at,
            starting_bid_gbp, current_bid_gbp, buy_now_price_gbp,
            reserve_price_gbp, bid_count, status, min_increment_gbp
          )
          VALUES ($1, $2, (SELECT seller_id FROM listings WHERE id = $2), $3, $4, $5, $6, $7, $8, $9, 'live', 1.00)
          ON CONFLICT (id) DO UPDATE SET
            starts_at = EXCLUDED.starts_at,
            ends_at = EXCLUDED.ends_at,
            starting_bid_gbp = EXCLUDED.starting_bid_gbp,
            current_bid_gbp = EXCLUDED.current_bid_gbp,
            buy_now_price_gbp = EXCLUDED.buy_now_price_gbp,
            reserve_price_gbp = EXCLUDED.reserve_price_gbp,
            bid_count = EXCLUDED.bid_count,
            status = 'live'`,
        [auctionId, a.listingId, startsAt, endsAt, a.startingBidGbp, currentBid,
         a.buyNowPriceGbp, a.reservePriceGbp, a.bids.length]
      );

      // ── Bids ──────────────────────────────────────────────────────────────
      // Clean up old seed bids first to avoid duplicates on re-run.
      await client.query(
        `DELETE FROM auction_bids WHERE auction_id = $1 AND idempotency_key IS NULL`,
        [auctionId]
      );
      for (const bid of a.bids) {
        await client.query(
          `INSERT INTO auction_bids (auction_id, bidder_id, amount_gbp)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [auctionId, bid.bidderId, bid.amountGbp]
        );
      }

      // ── Watchlist (u1 watches all auctions) ───────────────────────────────
      await client.query(
        `INSERT INTO auction_watchlist (user_id, auction_id)
         VALUES ('seed_u1', $1)
         ON CONFLICT (user_id, auction_id) DO NOTHING`,
        [auctionId]
      );
    }
    console.log(`[seed] ${AUCTIONS.length} auctions + bids upserted`);

    // ── Co-Own assets with full trust fields ───────────────────────────────
    const coownAssets = [
      {
        id: 'seed_coown_1', listingId: 'seed_l8', issuerId: 'seed_u1',
        title: 'Jacquemus Le Chiquito — Fractional', totalUnits: 10, unitPriceGbp: 32,
        legalVehicleType: 'spv', legalVehicleName: 'Thryftverse SPV 001 Ltd',
        legalVehicleJurisdiction: 'United Kingdom',
        custodianName: 'SecureVault Custody Ltd', custodianLocation: 'London, UK',
        custodyInsured: true, custodyInsurer: "Lloyd's of London",
        custodyPolicyRef: 'POL-2026-001', custodyCoverageGbp: 5000,
        authenticityStatus: 'verified', authenticityMethod: 'Third-party appraisal by Sotheby\'s',
        appraisalValueGbp: 350, appraisalValuer: 'Sotheby\'s London',
        conditionGrade: 'A', provenance: 'Direct from designer boutique, 2025',
        buyerProtection: true, safeguarded: true,
        safeguardingPartner: 'Thryftverse Escrow',
      },
      {
        id: 'seed_coown_2', listingId: 'seed_l1', issuerId: 'seed_u1',
        title: 'YSL Vintage Sweater — Fractional', totalUnits: 20, unitPriceGbp: 10,
        legalVehicleType: 'spv', legalVehicleName: 'Thryftverse SPV 002 Ltd',
        legalVehicleJurisdiction: 'United Kingdom',
        custodianName: 'SecureVault Custody Ltd', custodianLocation: 'London, UK',
        custodyInsured: true, custodyInsurer: "Lloyd's of London",
        custodyPolicyRef: 'POL-2026-002', custodyCoverageGbp: 2000,
        authenticityStatus: 'verified', authenticityMethod: 'Authentication by Vestiaire Collective',
        appraisalValueGbp: 250, appraisalValuer: 'Vestiaire Collective',
        conditionGrade: 'A', provenance: 'Verified vintage, sourced 2025',
        buyerProtection: true, safeguarded: true,
        safeguardingPartner: 'Thryftverse Escrow',
      },
    ];

    for (const a of coownAssets) {
      await client.query(
        `INSERT INTO coOwn_assets (
            id, listing_id, issuer_id, title, image_url,
            total_units, available_units, unit_price_gbp, unit_price_stable,
            settlement_mode, is_open, holders, volume_24h_gbp, market_move_pct_24h,
            legal_vehicle_type, legal_vehicle_name, legal_vehicle_jurisdiction,
            custodian_name, custodian_location, custody_insured, custody_insurer,
            custody_policy_ref, custody_coverage_gbp,
            authenticity_status, authenticity_method, authenticity_verified_at,
            appraisal_value_gbp, appraisal_valuer,
            condition_grade, provenance,
            buyer_protection, safeguarded, safeguarding_partner,
            listing_tier
          )
          VALUES (
            $1, $2, $3, $4,
            (SELECT image_url FROM listings WHERE id = $2),
            $5, $5, $6, $6,
            'GBP', true, 0, 0, 0,
            $7, $8, $9,
            $10, $11, $12, $13,
            $14, $15,
            $16, $17, NOW(),
            $18, $19,
            $20, $21,
            $22, $23, $24,
            'listed'
          )
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            total_units = EXCLUDED.total_units,
            available_units = EXCLUDED.available_units,
            unit_price_gbp = EXCLUDED.unit_price_gbp,
            legal_vehicle_type = EXCLUDED.legal_vehicle_type,
            legal_vehicle_name = EXCLUDED.legal_vehicle_name,
            custodian_name = EXCLUDED.custodian_name,
            custody_insured = EXCLUDED.custody_insured,
            custody_insurer = EXCLUDED.custody_insurer,
            custody_policy_ref = EXCLUDED.custody_policy_ref,
            custody_coverage_gbp = EXCLUDED.custody_coverage_gbp,
            authenticity_status = EXCLUDED.authenticity_status,
            authenticity_method = EXCLUDED.authenticity_method,
            appraisal_value_gbp = EXCLUDED.appraisal_value_gbp,
            buyer_protection = EXCLUDED.buyer_protection,
            safeguarded = EXCLUDED.safeguarded,
            safeguarding_partner = EXCLUDED.safeguarding_partner,
            listing_tier = 'listed'`,
        [
          a.id, a.listingId, a.issuerId, a.title,
          a.totalUnits, a.unitPriceGbp,
          a.legalVehicleType, a.legalVehicleName, a.legalVehicleJurisdiction,
          a.custodianName, a.custodianLocation, a.custodyInsured, a.custodyInsurer,
          a.custodyPolicyRef, a.custodyCoverageGbp,
          a.authenticityStatus, a.authenticityMethod,
          a.appraisalValueGbp, a.appraisalValuer,
          a.conditionGrade, a.provenance,
          a.buyerProtection, a.safeguarded, a.safeguardingPartner,
        ]
      );

      // ── Co-Own rights ─────────────────────────────────────────────────────
      await client.query(
        `INSERT INTO coown_rights (asset_id, version, status, rights_type, jurisdiction, governing_law, summary_terms, transferable, min_holding_units, published_at,
           economic_rights, voting_rights, exit_rights, fee_rights)
         VALUES ($1, 1, 'published', 'fractional_ownership', 'United Kingdom', 'England and Wales',
           'Beneficial ownership of the underlying asset via an SPV. Pro-rata economic interest in resale proceeds.',
           true, 1, NOW(),
           'Pro-rata share of resale proceeds after custody and platform fees',
           'No voting rights — SPV beneficial interest only',
           'Secondary market via Thryftverse Co-Own exchange',
           '0% management fee, 5% platform fee on resale')
         ON CONFLICT (asset_id, version) DO UPDATE SET
           status = 'published',
           economic_rights = EXCLUDED.economic_rights,
           voting_rights = EXCLUDED.voting_rights,
           exit_rights = EXCLUDED.exit_rights,
           fee_rights = EXCLUDED.fee_rights`,
        [a.id]
      );

      // ── Co-Own risk disclosures ───────────────────────────────────────────
      await client.query(
        `INSERT INTO coown_risk_disclosures (asset_id, version, status, market_risk, liquidity_risk, custody_risk, regulatory_risk, counterparty_risk, other_risks, published_at)
         VALUES ($1, 1, 'published',
           'Appraisal values can fluctuate; past valuations do not guarantee future returns',
           'Fractional units may be illiquid — there is no guaranteed secondary market',
           'Custody by third-party custodian — risk of custodian failure',
           'Co-Own units are not regulated by the FCA and are not covered by the Financial Services Compensation Scheme',
           'SPV structure relies on the issuer and custodian performing their obligations',
           'Co-Own is a fractional ownership product. You own a beneficial interest in the underlying asset via an SPV. Units are illiquid and unregulated. Only invest what you can afford to lose.',
           NOW())
         ON CONFLICT (asset_id, version) DO UPDATE SET
           status = 'published',
           market_risk = EXCLUDED.market_risk,
           liquidity_risk = EXCLUDED.liquidity_risk,
           custody_risk = EXCLUDED.custody_risk,
           regulatory_risk = EXCLUDED.regulatory_risk,
           counterparty_risk = EXCLUDED.counterparty_risk,
           other_risks = EXCLUDED.other_risks`,
        [a.id]
      );
    }
    console.log(`[seed] ${coownAssets.length} co-own assets + rights + risk disclosures upserted`);

    // ── Issuer verification profiles for co-own issuers ─────────────────────
    await client.query(
      `INSERT INTO coown_issuer_verification_profile (user_id, verification_tier, verification_tier_set_at, seller_standards_met)
       VALUES ('seed_u1', 'id', NOW(), true)
       ON CONFLICT (user_id) DO UPDATE SET verification_tier = 'id', seller_standards_met = true`
    );
    console.log('[seed] issuer verification profile upserted');

    // ── Compliance profiles for all seed users ──────────────────────────────
    for (const u of USERS) {
      await client.query(
        `INSERT INTO user_compliance_profiles (user_id, country_code, kyc_status, kyc_level, document_status, liveness_status, sanctions_status, pep_status, aml_risk_tier, trading_enabled)
         VALUES ($1, 'GB', 'verified', 'enhanced', 'approved', 'passed', 'clear', 'clear', 'low', true)
         ON CONFLICT (user_id) DO UPDATE SET
           kyc_status = 'verified', kyc_level = 'enhanced',
           sanctions_status = 'clear', trading_enabled = true`,
        [u.id]
      );
    }
    console.log(`[seed] ${USERS.length} compliance profiles upserted`);

    // ── Jurisdiction rule for co-own market ─────────────────────────────────
    await client.query(
      `INSERT INTO jurisdiction_rules (market, scope, scope_code, is_enabled, min_kyc_level, require_sanctions_clear, max_order_notional_gbp, max_daily_notional_gbp, max_open_orders)
       SELECT 'co-own', 'global', 'GLOBAL', true, 'basic', false, 10000, 50000, 20
       WHERE NOT EXISTS (SELECT 1 FROM jurisdiction_rules WHERE market = 'co-own')`
    );
    console.log('[seed] jurisdiction rule ensured');

    // ── Risk disclosure document + consent for all users ────────────────────
    await client.query(
      `INSERT INTO legal_documents (id, doc_type, version, title, is_active, effective_at)
       VALUES ('risk_doc_seed', 'risk_disclosure', 'seed-v1', 'Co-Own Risk Disclosure', true, NOW())
       ON CONFLICT (id) DO UPDATE SET is_active = true, retired_at = NULL`
    );
    for (const u of USERS) {
      await client.query(
        `INSERT INTO user_consents (user_id, document_id, accepted, accepted_at)
         VALUES ($1, 'risk_doc_seed', true, NOW())
         ON CONFLICT DO NOTHING`,
        [u.id]
      );
    }
    console.log(`[seed] risk disclosure + ${USERS.length} consents ensured`);

    // ── Wallets for all users ───────────────────────────────────────────────
    for (const u of USERS) {
      await client.query(
        `INSERT INTO wallets (id, user_id, oneze_balance_mg, fiat_balance_minor, fiat_currency)
         VALUES ($1, $2, 5000000, 10000, 'GBP')
         ON CONFLICT (user_id) DO UPDATE SET oneze_balance_mg = 5000000`,
        [`wallet_${u.id}`, u.id]
      );
    }
    console.log(`[seed] ${USERS.length} wallets upserted`);

    // ── Looks (shoppable images) with product tags ──────────────────────────
    const seedLooks = [
      {
        id: 'seed_look_1', creatorId: 'seed_u1', title: 'Autumn Layering',
        caption: 'Vintage YSL sweater styled for crisp autumn days.', mediaUrl: IMG.yslSweater,
        status: 'published', visibility: 'public',
        tags: [
          { id: 't1', listingId: 'seed_l1', label: 'YSL Sweater', x: 0.5, y: 0.4 },
          { id: 't2', listingId: 'seed_l4', label: 'Stüssy Tee', x: 0.3, y: 0.7 },
        ],
      },
      {
        id: 'seed_look_2', creatorId: 'seed_u2', title: 'Parisian Stripes',
        caption: 'AMI striped shirt — effortless Parisian cool.', mediaUrl: IMG.amiShirt,
        status: 'published', visibility: 'public',
        tags: [
          { id: 't1', listingId: 'seed_l2', label: 'AMI Shirt', x: 0.5, y: 0.35 },
        ],
      },
      {
        id: 'seed_look_3', creatorId: 'seed_u3', title: 'Harrington Season',
        caption: 'Classic Ralph Lauren Harrington — timeless.', mediaUrl: IMG.ralphHarring,
        status: 'published', visibility: 'public',
        tags: [
          { id: 't1', listingId: 'seed_l3', label: 'RL Harrington', x: 0.5, y: 0.4 },
          { id: 't2', listingId: 'seed_l6', label: 'Air Max 90', x: 0.5, y: 0.85 },
        ],
      },
      {
        id: 'seed_look_4', creatorId: 'seed_u1', title: 'Streetwear Drop (Draft)',
        caption: 'Working on this one — not ready yet.', mediaUrl: IMG.stussyTee,
        status: 'draft', visibility: 'private',
        tags: [
          { id: 't1', listingId: 'seed_l4', label: 'Stüssy Tee', x: 0.5, y: 0.4 },
        ],
      },
      {
        id: 'seed_look_5', creatorId: 'seed_u2', title: 'Archive Hoodie (Archived)',
        caption: 'Old look, moved to archive.', mediaUrl: IMG.offwhiteHood,
        status: 'archived', visibility: 'public',
        tags: [
          { id: 't1', listingId: 'seed_l5', label: 'Off-White Hoodie', x: 0.5, y: 0.45 },
        ],
      },
    ];

    for (const look of seedLooks) {
      await client.query(
        `INSERT INTO looks (id, creator_id, title, caption, media_url, status, visibility)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           caption = EXCLUDED.caption,
           media_url = EXCLUDED.media_url,
           status = EXCLUDED.status,
           visibility = EXCLUDED.visibility`,
        [look.id, look.creatorId, look.title, look.caption, look.mediaUrl, look.status, look.visibility]
      );

      for (const tag of look.tags) {
        const tagId = `${look.id}_${tag.id}`;
        await client.query(
          `INSERT INTO look_tags (id, look_id, listing_id, label, x, y)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             listing_id = EXCLUDED.listing_id,
             label = EXCLUDED.label,
             x = EXCLUDED.x,
             y = EXCLUDED.y`,
          [tagId, look.id, tag.listingId, tag.label, tag.x, tag.y]
        );
      }
    }
    console.log(`[seed] ${seedLooks.length} looks + tags upserted`);

    // ── Look engagement (likes, saves, comments) ───────────────────────────
    const lookEngagement = [
      { lookId: 'seed_look_1', likes: ['seed_u2', 'seed_u3', 'seed_u4'], saves: ['seed_u2', 'seed_u4'], comments: [
        { authorId: 'seed_u3', body: 'Love this layering combo!' },
        { authorId: 'seed_u4', body: 'Where is the sweater from?' },
      ]},
      { lookId: 'seed_look_2', likes: ['seed_u1', 'seed_u3'], saves: ['seed_u3'], comments: [
        { authorId: 'seed_u1', body: 'Parisian perfection.' },
      ]},
      { lookId: 'seed_look_3', likes: ['seed_u1', 'seed_u2', 'seed_u4'], saves: ['seed_u1'], comments: [
        { authorId: 'seed_u2', body: 'Harrington is a staple.' },
        { authorId: 'seed_u4', body: 'Air Max completes it.' },
      ]},
    ];

    for (const eng of lookEngagement) {
      for (const userId of eng.likes) {
        await client.query(
          `INSERT INTO look_likes (look_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [eng.lookId, userId]
        );
      }
      for (const userId of eng.saves) {
        await client.query(
          `INSERT INTO look_saves (look_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [eng.lookId, userId]
        );
      }
      for (const c of eng.comments) {
        const commentId = `${eng.lookId}_c_${c.authorId}`;
        await client.query(
          `INSERT INTO look_comments (id, look_id, author_id, body)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body`,
          [commentId, eng.lookId, c.authorId, c.body]
        );
      }
    }
    console.log('[seed] look engagement (likes, saves, comments) upserted');

    // ── Poster stories with frames, stickers, views, reactions ────────────
    const seedPosterStories = [
      {
        storyId: 'seed_story_1', creatorId: 'seed_u1', frames: [
          { frameId: 'seed_poster_1', mediaUrl: IMG.yslSweater, caption: 'New drop — YSL vintage', sortOrder: 0, durationMs: 5000 },
          { frameId: 'seed_poster_2', mediaUrl: IMG.yslSweater2, caption: 'Detail shot', sortOrder: 1, durationMs: 5000 },
        ],
        stickers: [
          { stickerId: 'seed_sticker_1', frameId: 'seed_poster_1', type: 'text', x: 0.5, y: 0.2, scale: 1, rotation: 0, payload: { text: 'Swipe up!' }, sortOrder: 0 },
          { stickerId: 'seed_sticker_2', frameId: 'seed_poster_1', type: 'listing', x: 0.5, y: 0.7, scale: 1, rotation: 0, payload: { listingId: 'seed_l1' }, sortOrder: 1 },
        ],
        views: ['seed_u2', 'seed_u3', 'seed_u4'],
        reactions: [
          { frameId: 'seed_poster_1', userId: 'seed_u2', reaction: 'love' },
          { frameId: 'seed_poster_1', userId: 'seed_u3', reaction: 'fire' },
          { frameId: 'seed_poster_2', userId: 'seed_u4', reaction: 'style' },
        ],
      },
      {
        storyId: 'seed_story_2', creatorId: 'seed_u2', frames: [
          { frameId: 'seed_poster_3', mediaUrl: IMG.amiShirt, caption: 'AMI Paris — new in', sortOrder: 0, durationMs: 6000 },
        ],
        stickers: [
          { stickerId: 'seed_sticker_3', frameId: 'seed_poster_3', type: 'mention', x: 0.5, y: 0.15, scale: 1, rotation: 0, payload: { userId: 'seed_u2' }, sortOrder: 0 },
        ],
        views: ['seed_u1', 'seed_u3'],
        reactions: [
          { frameId: 'seed_poster_3', userId: 'seed_u1', reaction: 'want' },
          { frameId: 'seed_poster_3', userId: 'seed_u3', reaction: 'love' },
        ],
      },
      {
        storyId: 'seed_story_3', creatorId: 'seed_u3', frames: [
          { frameId: 'seed_poster_4', mediaUrl: IMG.ralphHarring, caption: 'Harrington season is here', sortOrder: 0, durationMs: 5000 },
          { frameId: 'seed_poster_5', mediaUrl: IMG.nikeAirMax, caption: 'And the shoes to match', sortOrder: 1, durationMs: 5000 },
        ],
        stickers: [
          { stickerId: 'seed_sticker_4', frameId: 'seed_poster_4', type: 'style_vote', x: 0.5, y: 0.5, scale: 1.2, rotation: 0, payload: { question: 'Which jacket?', options: ['Harrington', 'Bomber'] }, sortOrder: 0 },
        ],
        views: ['seed_u1', 'seed_u2', 'seed_u4'],
        reactions: [
          { frameId: 'seed_poster_4', userId: 'seed_u1', reaction: 'wow' },
          { frameId: 'seed_poster_5', userId: 'seed_u2', reaction: 'want' },
        ],
      },
    ];

    for (const story of seedPosterStories) {
      await client.query(
        `INSERT INTO poster_stories (id, creator_id, audience, allow_replies, allow_reactions, status, expires_at)
         VALUES ($1, $2, 'public', true, true, 'active', NOW() + INTERVAL '24 hours')
         ON CONFLICT (id) DO UPDATE SET
           status = 'active',
           expires_at = EXCLUDED.expires_at`,
        [story.storyId, story.creatorId]
      );

      for (const frame of story.frames) {
        await client.query(
          `INSERT INTO posters (id, creator_id, media_url, caption, layout, status, expiry_hours, story_id, media_type, sort_order, duration_ms, poster_caption)
           VALUES ($1, $2, $3, '', 'single', 'published', 24, $4, 'image', $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             media_url = EXCLUDED.media_url,
             story_id = EXCLUDED.story_id,
             sort_order = EXCLUDED.sort_order,
             duration_ms = EXCLUDED.duration_ms,
             poster_caption = EXCLUDED.poster_caption`,
          [frame.frameId, story.creatorId, frame.mediaUrl, story.storyId, frame.sortOrder, frame.durationMs, frame.caption]
        );
      }

      for (const sticker of story.stickers) {
        await client.query(
          `INSERT INTO poster_stickers (id, frame_id, type, x, y, scale, rotation, payload, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO UPDATE SET
             type = EXCLUDED.type,
             x = EXCLUDED.x,
             y = EXCLUDED.y,
             scale = EXCLUDED.scale,
             rotation = EXCLUDED.rotation,
             payload = EXCLUDED.payload,
             sort_order = EXCLUDED.sort_order`,
          [sticker.stickerId, sticker.frameId, sticker.type, sticker.x, sticker.y, sticker.scale, sticker.rotation, JSON.stringify(sticker.payload), sticker.sortOrder]
        );
      }

      for (const viewerId of story.views) {
        for (const frame of story.frames) {
          await client.query(
            `INSERT INTO poster_views (frame_id, viewer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [frame.frameId, viewerId]
          );
        }
      }

      for (const reaction of story.reactions) {
        await client.query(
          `INSERT INTO poster_reactions (frame_id, user_id, reaction)
           VALUES ($1, $2, $3)
           ON CONFLICT (frame_id, user_id) DO UPDATE SET reaction = EXCLUDED.reaction`,
          [reaction.frameId, reaction.userId, reaction.reaction]
        );
      }
    }
    console.log(`[seed] ${seedPosterStories.length} poster stories + frames + stickers + views + reactions upserted`);

    // ── Poster product tags ────────────────────────────────────────────────
    const seedPosterTags = [
      { id: 'seed_ptag_1', posterId: 'seed_poster_1', listingId: 'seed_l1', label: 'YSL Sweater', x: 0.5, y: 0.6 },
      { id: 'seed_ptag_2', posterId: 'seed_poster_3', listingId: 'seed_l2', label: 'AMI Shirt', x: 0.5, y: 0.5 },
      { id: 'seed_ptag_3', posterId: 'seed_poster_4', listingId: 'seed_l3', label: 'RL Harrington', x: 0.5, y: 0.4 },
    ];
    for (const tag of seedPosterTags) {
      await client.query(
        `INSERT INTO poster_tags (id, poster_id, listing_id, label, x, y, click_count, last_clicked_at)
         VALUES ($1, $2, $3, $4, $5, $6, 0, NULL)
         ON CONFLICT (id) DO UPDATE SET
           listing_id = EXCLUDED.listing_id,
           label = EXCLUDED.label,
           x = EXCLUDED.x,
           y = EXCLUDED.y`,
        [tag.id, tag.posterId, tag.listingId, tag.label, tag.x, tag.y]
      );
    }
    console.log(`[seed] ${seedPosterTags.length} poster product tags upserted`);

    // ── Creator analytics events (past 7 days) ──────────────────────────────
    // Generate views, likes, saves for the seeded looks and posters.
    const analyticsEvents: Array<{
      creatorId: string; contentType: string; contentId: string;
      eventType: string; viewerId: string; daysAgo: number;
    }> = [];

    // Views on looks — spread across 7 days
    for (let day = 6; day >= 0; day--) {
      const baseViews = 8 + Math.floor(Math.random() * 12);
      for (let v = 0; v < baseViews; v++) {
        const viewer = `seed_u${(v % 4) + 1}`;
        analyticsEvents.push({
          creatorId: 'seed_u1', contentType: 'look', contentId: 'seed_look_1',
          eventType: 'view', viewerId: viewer, daysAgo: day,
        });
      }
      analyticsEvents.push({
        creatorId: 'seed_u1', contentType: 'look', contentId: 'seed_look_1',
        eventType: 'like', viewerId: 'seed_u2', daysAgo: day,
      });
      analyticsEvents.push({
        creatorId: 'seed_u1', contentType: 'look', contentId: 'seed_look_1',
        eventType: 'save', viewerId: 'seed_u3', daysAgo: day,
      });
    }

    // Views on poster frames
    for (let day = 6; day >= 0; day--) {
      const baseViews = 5 + Math.floor(Math.random() * 8);
      for (let v = 0; v < baseViews; v++) {
        const viewer = `seed_u${(v % 4) + 1}`;
        analyticsEvents.push({
          creatorId: 'seed_u1', contentType: 'poster', contentId: 'seed_poster_1',
          eventType: 'view', viewerId: viewer, daysAgo: day,
        });
      }
      analyticsEvents.push({
        creatorId: 'seed_u1', contentType: 'poster', contentId: 'seed_poster_1',
        eventType: 'share', viewerId: 'seed_u2', daysAgo: day,
      });
    }

    // Product clicks on look tags
    for (let day = 6; day >= 0; day--) {
      if (day % 2 === 0) {
        analyticsEvents.push({
          creatorId: 'seed_u1', contentType: 'look', contentId: 'seed_look_1',
          eventType: 'product_click', viewerId: 'seed_u4', daysAgo: day,
        });
      }
    }

    // Profile visits
    for (let day = 6; day >= 0; day--) {
      analyticsEvents.push({
        creatorId: 'seed_u1', contentType: 'look', contentId: 'seed_look_1',
        eventType: 'profile_visit', viewerId: 'seed_u2', daysAgo: day,
      });
    }

    for (const evt of analyticsEvents) {
      await client.query(
        `INSERT INTO creator_analytics_events (creator_id, content_type, content_id, event_type, viewer_id, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() - ($7 || ' days')::INTERVAL)
         ON CONFLICT DO NOTHING`,
        [evt.creatorId, evt.contentType, evt.contentId, evt.eventType, evt.viewerId, JSON.stringify({}), evt.daysAgo]
      );
    }
    console.log(`[seed] ${analyticsEvents.length} creator analytics events inserted (past 7 days)`);

    await client.query('COMMIT');
    console.log('[seed] done — all data committed');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[seed] failed', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
