/**
 * Fixture dataset — design-mode source of truth for the web app.
 * Mirrors frontend/src/data/mockData.ts shapes; curated media so every
 * surface renders at flagship quality offline.
 */

import type {
  AppNotification,
  Category,
  Conversation,
  ConversationParticipant,
  CuratedCollectionMeta,
  Listing,
  ListingQuestion,
  Look,
  Message,
  Moodboard,
  NewConversationInput,
  NotificationEntry,
  Order,
  Poster,
  Review,
  SizeGuide,
  Transaction,
  User,
  Address,
  PaymentMethod,
} from '@/lib/contracts/domain';

const img = (id: string, w = 800) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

// ============================================================================
// USERS
// ============================================================================

export const USERS: User[] = [
  {
    id: 'u1',
    username: 'mariefullery',
    avatar: img('photo-1494790108377-be9c29b29330', 200),
    rating: 4.8,
    reviewCount: 54,
    location: 'South Elmsall, United Kingdom',
    followers: 1240,
    following: 86,
    isVerified: true,
    badges: ['Frequent Uploads'],
    lastSeen: '2 hours ago',
    listingCount: 26,
    bio: 'Pre-loved designer pieces, carefully authenticated. Ship within 24h.',
    identityVerified: true,
    sellerVerified: true,
    trustLevel: 'seller',
  },
  {
    id: 'u2',
    username: 'scott_art',
    avatar: img('photo-1535713875002-d1d0cf377fde', 200),
    rating: 4.5,
    reviewCount: 32,
    location: 'London, United Kingdom',
    followers: 45,
    following: 12,
    isVerified: true,
    badges: [],
    lastSeen: 'Just now',
    listingCount: 15,
    bio: 'Menswear, archival workwear and the occasional grail.',
    trustLevel: 'identity',
    identityVerified: true,
  },
  {
    id: 'u3',
    username: 'dankdunksuk',
    avatar: img('photo-1599566150163-29194dcaad36', 200),
    rating: 4.9,
    reviewCount: 128,
    location: 'Manchester, United Kingdom',
    followers: 4230,
    following: 318,
    isVerified: true,
    badges: ['Top Seller', 'Frequent Uploads'],
    lastSeen: 'an hour ago',
    listingCount: 42,
    bio: 'Sneakers and streetwear. All pairs legit-checked before dispatch.',
    identityVerified: true,
    sellerVerified: true,
    trustLevel: 'seller',
  },
  {
    id: 'u4',
    username: 'lucygibson94',
    avatar: img('photo-1438761681033-6461ffad8d80', 200),
    rating: 4.7,
    reviewCount: 19,
    location: 'Bristol, United Kingdom',
    followers: 8,
    following: 3,
    isVerified: false,
    badges: [],
    lastSeen: '3 hours ago',
    listingCount: 8,
    trustLevel: 'email',
  },
  {
    id: 'u5',
    username: 'archive.thread',
    avatar: img('photo-1507003211169-0a1dd7228f2d', 200),
    rating: 4.9,
    reviewCount: 211,
    location: 'Leeds, United Kingdom',
    followers: 8900,
    following: 120,
    isVerified: true,
    badges: ['Top Seller'],
    lastSeen: '30 minutes ago',
    listingCount: 67,
    bio: 'Curated archive fashion. Margiela, Helmut Lang, early Raf.',
    identityVerified: true,
    sellerVerified: true,
    trustLevel: 'seller',
  },
  {
    id: 'u6',
    username: 'ellawears',
    avatar: img('photo-1544005313-94ddf0286df2', 200),
    rating: 4.6,
    reviewCount: 41,
    location: 'Brighton, United Kingdom',
    followers: 560,
    following: 203,
    isVerified: true,
    badges: [],
    lastSeen: '5 hours ago',
    listingCount: 19,
    bio: 'Vintage dresses and quiet luxury finds.',
    trustLevel: 'identity',
    identityVerified: true,
  },
  {
    id: 'me',
    username: 'you',
    avatar: img('photo-1524504388940-b1c1722653e1', 200),
    rating: 4.7,
    reviewCount: 12,
    location: 'London, United Kingdom',
    followers: 128,
    following: 214,
    isVerified: true,
    badges: [],
    lastSeen: 'Now',
    listingCount: 6,
    bio: 'Buying more than I sell.',
    trustLevel: 'identity',
    identityVerified: true,
  },
];

export const CURRENT_USER = USERS[USERS.length - 1];

// ============================================================================
// LISTINGS
// ============================================================================

export const LISTINGS: Listing[] = [
  {
    id: 'l1',
    title: 'Yves Saint Laurent Wool Sweater',
    brand: 'Yves Saint Laurent',
    size: 'M',
    condition: 'Very good',
    price: 200,
    originalPrice: 350,
    priceWithProtection: 210.7,
    images: [img('photo-1576871337622-98d48d1cf531'), img('photo-1434389677669-e08b4cac3105')],
    mediaAspectRatio: 0.8,
    likes: 40,
    views: 320,
    isBumped: true,
    sellerId: 'u1',
    seller: { id: 'u1', username: 'mariefullery', avatar: USERS[0].avatar, rating: 4.8, reviewCount: 54, verified: true, location: 'South Elmsall, United Kingdom' },
    category: 'women',
    subcategory: 'Knitwear',
    description:
      'Beautiful YSL wool sweater in great condition. Barely worn, no signs of wear. Ribbed cuffs and hem, classic fit. From a smoke-free home.',
    createdAt: '2026-09-18T10:00:00Z',
    shippingMethod: 'Royal Mail Tracked 48',
    sustainabilityGrade: 'A',
  },
  {
    id: 'l2',
    title: 'AMI Striped Cotton Shirt',
    brand: 'AMI',
    size: 'M',
    condition: 'Very good',
    price: 48,
    originalPrice: 90,
    priceWithProtection: 51.1,
    images: [img('photo-1596755094514-f87e34085b2c'), img('photo-1521572267360-ee0c2909d518'), img('photo-1602810318383-e386cc2a3ccf')],
    mediaAspectRatio: 0.75,
    likes: 14,
    views: 180,
    sellerId: 'u2',
    seller: { id: 'u2', username: 'scott_art', avatar: USERS[1].avatar, rating: 4.5, reviewCount: 32, verified: true, location: 'London, United Kingdom' },
    category: 'men',
    subcategory: 'Shirts',
    description: 'Pit to pit 20 in. Simple striped shirt from AMI Paris. Very good condition.',
    createdAt: '2026-09-19T10:00:00Z',
    sustainabilityGrade: 'B',
  },
  {
    id: 'l3',
    title: 'Polo Ralph Lauren Harrington Jacket',
    brand: 'Ralph Lauren',
    size: 'L',
    condition: 'Good',
    price: 85,
    originalPrice: 160,
    priceWithProtection: 89.9,
    images: [img('photo-1591047139829-d91aecb6caea'), img('photo-1520975954732-35dd22299614')],
    mediaAspectRatio: 0.82,
    likes: 63,
    views: 540,
    sellerId: 'u2',
    seller: { id: 'u2', username: 'scott_art', avatar: USERS[1].avatar, rating: 4.5, reviewCount: 32, verified: true, location: 'London, United Kingdom' },
    category: 'men',
    subcategory: 'Jackets',
    description: 'Classic Harrington in navy. Light fading at the collar, otherwise solid. Tartan lining intact.',
    createdAt: '2026-09-15T14:30:00Z',
  },
  {
    id: 'l4',
    title: 'Nike Air Jordan 1 Retro High OG',
    brand: 'Nike',
    size: 'UK 9',
    condition: 'Very good',
    price: 145,
    priceWithProtection: 152.5,
    images: [img('photo-1595341888016-a392ef81b7de'), img('photo-1552346154-21d32810aba3'), img('photo-1549298916-b41d501d3772')],
    mediaAspectRatio: 1.0,
    likes: 128,
    views: 1100,
    sellerId: 'u3',
    seller: { id: 'u3', username: 'dankdunksuk', avatar: USERS[2].avatar, rating: 4.9, reviewCount: 128, verified: true, location: 'Manchester, United Kingdom' },
    category: 'sneakers',
    subcategory: 'High tops',
    description: 'Chicago colourway. Worn a handful of times, minimal creasing. Box included, no lid.',
    createdAt: '2026-09-20T09:00:00Z',
    sustainabilityGrade: 'B',
  },
  {
    id: 'l5',
    title: 'Vintage Levi\'s 501 Jeans',
    brand: 'Levi\'s',
    size: 'W32 L32',
    condition: 'Good',
    price: 38,
    priceWithProtection: 41.2,
    images: [img('photo-1542272604-787c3835535d'), img('photo-1541099649105-f69ad21f3246')],
    mediaAspectRatio: 0.78,
    likes: 52,
    views: 430,
    sellerId: 'u5',
    seller: { id: 'u5', username: 'archive.thread', avatar: USERS[4].avatar, rating: 4.9, reviewCount: 211, verified: true, location: 'Leeds, United Kingdom' },
    category: 'men',
    subcategory: 'Jeans',
    description: '90s 501s, perfect wash and fade. Button fly, no repairs needed.',
    createdAt: '2026-09-12T16:00:00Z',
    sustainabilityGrade: 'A',
  },
  {
    id: 'l6',
    title: 'Silk Slip Dress',
    brand: 'Réalisation Par',
    size: 'S',
    condition: 'Very good',
    price: 95,
    originalPrice: 180,
    priceWithProtection: 100.3,
    images: [img('photo-1595777457583-95e059d581b8'), img('photo-1509631179647-0177331693ae')],
    mediaAspectRatio: 0.7,
    likes: 87,
    views: 620,
    sellerId: 'u6',
    seller: { id: 'u6', username: 'ellawears', avatar: USERS[5].avatar, rating: 4.6, reviewCount: 41, verified: true, location: 'Brighton, United Kingdom' },
    category: 'women',
    subcategory: 'Dresses',
    description: '100% silk bias-cut slip. Worn once to a wedding. Dry cleaned.',
    createdAt: '2026-09-21T11:00:00Z',
    sustainabilityGrade: 'A',
  },
  {
    id: 'l7',
    title: 'Leather Biker Jacket',
    brand: 'AllSaints',
    size: 'M',
    condition: 'Good',
    price: 110,
    originalPrice: 298,
    priceWithProtection: 116.2,
    images: [img('photo-1551028719-00167b16eac5')],
    mediaAspectRatio: 0.8,
    likes: 74,
    views: 510,
    sellerId: 'u5',
    seller: { id: 'u5', username: 'archive.thread', avatar: USERS[4].avatar, rating: 4.9, reviewCount: 211, verified: true, location: 'Leeds, United Kingdom' },
    category: 'men',
    subcategory: 'Leather jackets',
    description: 'Real leather, beautifully broken in. Zips and hardware all work.',
    createdAt: '2026-09-10T13:00:00Z',
  },
  {
    id: 'l8',
    title: 'Quilted Leather Shoulder Bag',
    brand: 'Chanel',
    size: null,
    condition: 'Very good',
    price: 2450,
    priceWithProtection: 2548.0,
    images: [img('photo-1584917865442-de89df76afd3'), img('photo-1548036328-c9fa89d128fa')],
    mediaAspectRatio: 0.9,
    likes: 203,
    views: 2400,
    promoted: true,
    disclosure: 'Sponsored',
    promotionId: 'promo-1',
    sellerId: 'u1',
    seller: { id: 'u1', username: 'mariefullery', avatar: USERS[0].avatar, rating: 4.8, reviewCount: 54, verified: true, location: 'South Elmsall, United Kingdom' },
    category: 'bags',
    subcategory: 'Shoulder bags',
    description: 'Classic flap in black caviar leather with gold hardware. Authenticated, comes with card and dust bag.',
    createdAt: '2026-09-22T08:00:00Z',
  },
  {
    id: 'l9',
    title: 'Oversized Wool Coat',
    brand: 'Max Mara',
    size: 'UK 10',
    condition: 'Very good',
    price: 320,
    originalPrice: 890,
    priceWithProtection: 333.4,
    images: [img('photo-1539533018447-63fcce2678e3'), img('photo-1544022613-e87ca75a784a')],
    mediaAspectRatio: 0.72,
    likes: 156,
    views: 890,
    sellerId: 'u6',
    seller: { id: 'u6', username: 'ellawears', avatar: USERS[5].avatar, rating: 4.6, reviewCount: 41, verified: true, location: 'Brighton, United Kingdom' },
    category: 'women',
    subcategory: 'Coats',
    description: 'Camel wool-cashmere blend. Iconic silhouette, immaculate lining.',
    createdAt: '2026-09-17T15:00:00Z',
    sustainabilityGrade: 'A',
  },
  {
    id: 'l10',
    title: 'Chronograph Watch 40mm',
    brand: 'Seiko',
    size: null,
    condition: 'Very good',
    price: 260,
    priceWithProtection: 271.6,
    images: [img('photo-1523170335258-f5ed11844a49'), img('photo-1524805444758-089113d48a6d')],
    mediaAspectRatio: 0.85,
    likes: 91,
    views: 720,
    sellerId: 'u3',
    seller: { id: 'u3', username: 'dankdunksuk', avatar: USERS[2].avatar, rating: 4.9, reviewCount: 128, verified: true, location: 'Manchester, United Kingdom' },
    category: 'accessories',
    subcategory: 'Watches',
    description: 'Solar chronograph, sapphire crystal. Full kit with papers.',
    createdAt: '2026-09-14T10:00:00Z',
  },
  {
    id: 'l11',
    title: 'Heavyweight Boxy Hoodie',
    brand: 'Essentials',
    size: 'L',
    condition: 'Very good',
    price: 65,
    priceWithProtection: 68.9,
    images: [img('photo-1556821840-3a63f95609a7'), img('photo-1571945153237-4929e783af4a')],
    mediaAspectRatio: 0.8,
    likes: 44,
    views: 380,
    sellerId: 'u3',
    seller: { id: 'u3', username: 'dankdunksuk', avatar: USERS[2].avatar, rating: 4.9, reviewCount: 128, verified: true, location: 'Manchester, United Kingdom' },
    category: 'men',
    subcategory: 'Hoodies',
    description: 'Fear of God Essentials, 380gsm fleece. Barely worn.',
    createdAt: '2026-09-19T18:00:00Z',
  },
  {
    id: 'l12',
    title: 'Pleated Midi Skirt',
    brand: 'Cos',
    size: 'S',
    condition: 'New without tags',
    price: 42,
    priceWithProtection: 45.4,
    images: [img('photo-1594633312681-425c7b97ccd1'), img('photo-1485968579580-b6d095142e6e')],
    mediaAspectRatio: 0.75,
    likes: 29,
    views: 210,
    sellerId: 'u6',
    seller: { id: 'u6', username: 'ellawears', avatar: USERS[5].avatar, rating: 4.6, reviewCount: 41, verified: true, location: 'Brighton, United Kingdom' },
    category: 'women',
    subcategory: 'Skirts',
    description: 'Never worn, tags removed. Fluid pleats, elastic waist.',
    createdAt: '2026-09-20T14:00:00Z',
  },
  {
    id: 'l13',
    title: 'New Balance 550',
    brand: 'New Balance',
    size: 'UK 8',
    condition: 'Good',
    price: 55,
    priceWithProtection: 58.5,
    images: [img('photo-1560769629-975ec94e6a86'), img('photo-1600185365483-26d7a4cc7519')],
    mediaAspectRatio: 1.0,
    likes: 67,
    views: 480,
    sellerId: 'u3',
    seller: { id: 'u3', username: 'dankdunksuk', avatar: USERS[2].avatar, rating: 4.9, reviewCount: 128, verified: true, location: 'Manchester, United Kingdom' },
    category: 'sneakers',
    subcategory: 'Low tops',
    description: 'White/green. Light wear, plenty of life left.',
    createdAt: '2026-09-11T09:00:00Z',
  },
  {
    id: 'l14',
    title: 'Cashmere Crew Neck Jumper',
    brand: 'Johnstons of Elgin',
    size: 'M',
    condition: 'Very good',
    price: 120,
    originalPrice: 275,
    priceWithProtection: 126.6,
    images: [img('photo-1578932750294-f5075e85f44a'), img('photo-1620799140408-edc6dcb6d633')],
    mediaAspectRatio: 0.8,
    likes: 38,
    views: 290,
    sellerId: 'u1',
    seller: { id: 'u1', username: 'mariefullery', avatar: USERS[0].avatar, rating: 4.8, reviewCount: 54, verified: true, location: 'South Elmsall, United Kingdom' },
    category: 'women',
    subcategory: 'Knitwear',
    description: 'Scottish cashmere, no pilling. Soft oatmeal tone.',
    createdAt: '2026-09-16T12:00:00Z',
    sustainabilityGrade: 'A',
  },
  {
    id: 'l15',
    title: 'Tailored Wool Blazer',
    brand: 'Theory',
    size: '40R',
    condition: 'Very good',
    price: 140,
    originalPrice: 425,
    priceWithProtection: 147.4,
    images: [img('photo-1594938298603-c8148c4dae35'), img('photo-1507680434567-5739c80be1ac')],
    mediaAspectRatio: 0.78,
    likes: 25,
    views: 190,
    sellerId: 'u2',
    seller: { id: 'u2', username: 'scott_art', avatar: USERS[1].avatar, rating: 4.5, reviewCount: 32, verified: true, location: 'London, United Kingdom' },
    category: 'men',
    subcategory: 'Blazers',
    description: 'Charcoal half-canvas blazer. Worn for a handful of meetings.',
    createdAt: '2026-09-13T10:00:00Z',
  },
  {
    id: 'l16',
    title: 'Vintage Band Tee — Joy Division',
    brand: null,
    size: 'M',
    condition: 'Good',
    price: 75,
    priceWithProtection: 79.4,
    images: [img('photo-1576566588028-4147f3842f27'), img('photo-1523381210434-271e8be1f52b')],
    mediaAspectRatio: 0.82,
    likes: 112,
    views: 640,
    sellerId: 'u5',
    seller: { id: 'u5', username: 'archive.thread', avatar: USERS[4].avatar, rating: 4.9, reviewCount: 211, verified: true, location: 'Leeds, United Kingdom' },
    category: 'men',
    subcategory: 'T-shirts',
    description: 'Unknown Pleasures print, single stitch. Faded black, fits boxy.',
    createdAt: '2026-09-08T11:00:00Z',
  },
  {
    id: 'l17',
    title: 'Cat-Eye Sunglasses',
    brand: 'Celine',
    size: null,
    condition: 'New with tags',
    price: 190,
    originalPrice: 280,
    priceWithProtection: 199.6,
    images: [img('photo-1511499767150-a48a237f0083'), img('photo-1572635196237-14b3f281503f')],
    mediaAspectRatio: 0.9,
    likes: 58,
    views: 340,
    sellerId: 'u1',
    seller: { id: 'u1', username: 'mariefullery', avatar: USERS[0].avatar, rating: 4.8, reviewCount: 54, verified: true, location: 'South Elmsall, United Kingdom' },
    category: 'accessories',
    subcategory: 'Sunglasses',
    description: 'Black acetate, comes with case and cloth. Unworn.',
    createdAt: '2026-09-21T16:00:00Z',
  },
  {
    id: 'l18',
    title: 'Straight Leg Cargo Trousers',
    brand: 'Carhartt WIP',
    size: 'W34',
    condition: 'Very good',
    price: 48,
    priceWithProtection: 51.1,
    images: [img('photo-1594633312681-425c7b97ccd1'), img('photo-1473966968600-fa801b869a1a')],
    mediaAspectRatio: 0.75,
    likes: 33,
    views: 220,
    sellerId: 'u2',
    seller: { id: 'u2', username: 'scott_art', avatar: USERS[1].avatar, rating: 4.5, reviewCount: 32, verified: true, location: 'London, United Kingdom' },
    category: 'men',
    subcategory: 'Trousers',
    description: 'Ripstop cargo, relaxed straight fit.',
    createdAt: '2026-09-18T09:00:00Z',
  },
  {
    id: 'l19',
    title: 'Suede Ankle Boots',
    brand: 'Isabel Marant',
    size: 'EU 38',
    condition: 'Good',
    price: 175,
    originalPrice: 480,
    priceWithProtection: 184.1,
    images: [img('photo-1520639888713-7851133b1ed0'), img('photo-1543163521-1bf539c55dd2')],
    mediaAspectRatio: 0.85,
    likes: 81,
    views: 460,
    isSold: true,
    status: 'sold',
    sellerId: 'u6',
    seller: { id: 'u6', username: 'ellawears', avatar: USERS[5].avatar, rating: 4.6, reviewCount: 41, verified: true, location: 'Brighton, United Kingdom' },
    category: 'women',
    subcategory: 'Boots',
    description: 'Taupe suede western boots. Some wear on the soles, uppers great.',
    createdAt: '2026-09-05T10:00:00Z',
  },
  {
    id: 'l20',
    title: 'Denim Trucker Jacket',
    brand: 'Acne Studios',
    size: 'M',
    condition: 'Very good',
    price: 150,
    originalPrice: 330,
    priceWithProtection: 157.9,
    images: [img('photo-1487222477894-8943e31ef7b2'), img('photo-1576995853123-5a10305d93c0')],
    mediaAspectRatio: 0.8,
    likes: 49,
    views: 350,
    sellerId: 'u5',
    seller: { id: 'u5', username: 'archive.thread', avatar: USERS[4].avatar, rating: 4.9, reviewCount: 211, verified: true, location: 'Leeds, United Kingdom' },
    category: 'men',
    subcategory: 'Denim jackets',
    description: 'Washed indigo trucker. Perfect fade, no damage.',
    createdAt: '2026-09-17T11:00:00Z',
  },
  {
    id: 'l21',
    title: 'Ribbed Knit Midi Dress',
    brand: 'Toteme',
    size: 'S',
    condition: 'Very good',
    price: 165,
    originalPrice: 390,
    priceWithProtection: 173.6,
    images: [img('photo-1594633312681-425c7b97ccd1'), img('photo-1554568218-0f1715e72254')],
    mediaAspectRatio: 0.7,
    likes: 93,
    views: 520,
    sellerId: 'u6',
    seller: { id: 'u6', username: 'ellawears', avatar: USERS[5].avatar, rating: 4.6, reviewCount: 41, verified: true, location: 'Brighton, United Kingdom' },
    category: 'women',
    subcategory: 'Dresses',
    description: 'Sculptural ribbed knit in cream. Worn twice.',
    createdAt: '2026-09-19T13:00:00Z',
    sustainabilityGrade: 'B',
  },
  {
    id: 'l22',
    title: 'Canvas Tote Bag',
    brand: 'A.P.C.',
    size: null,
    condition: 'Good',
    price: 55,
    priceWithProtection: 58.5,
    images: [img('photo-1591561954557-26941169b49e')],
    mediaAspectRatio: 0.9,
    likes: 21,
    views: 160,
    sellerId: 'u4',
    seller: { id: 'u4', username: 'lucygibson94', avatar: USERS[3].avatar, rating: 4.7, reviewCount: 19, verified: false, location: 'Bristol, United Kingdom' },
    category: 'bags',
    subcategory: 'Totes',
    description: 'Denim canvas tote. Light wear on the handles.',
    createdAt: '2026-09-15T10:00:00Z',
  },
  {
    id: 'l23',
    title: 'Mohair Blend Cardigan',
    brand: 'Marni',
    size: 'M',
    condition: 'Very good',
    price: 210,
    originalPrice: 520,
    priceWithProtection: 220.9,
    images: [img('photo-1620799139507-2a76f79a2f4d'), img('photo-1611312449408-fcece27cdbb7')],
    mediaAspectRatio: 0.78,
    likes: 66,
    views: 410,
    sellerId: 'u5',
    seller: { id: 'u5', username: 'archive.thread', avatar: USERS[4].avatar, rating: 4.9, reviewCount: 211, verified: true, location: 'Leeds, United Kingdom' },
    category: 'women',
    subcategory: 'Knitwear',
    description: 'Brushed mohair in sage. Oversized fit, statement buttons.',
    createdAt: '2026-09-16T15:00:00Z',
    sustainabilityGrade: 'A',
  },
  {
    id: 'l24',
    title: 'Adidas Samba OG',
    brand: 'Adidas',
    size: 'UK 7',
    condition: 'Very good',
    price: 70,
    priceWithProtection: 74.2,
    images: [img('photo-1608234807905-4466023792f5'), img('photo-1560343090-f0409e92791a')],
    mediaAspectRatio: 1.0,
    likes: 145,
    views: 980,
    sellerId: 'u3',
    seller: { id: 'u3', username: 'dankdunksuk', avatar: USERS[2].avatar, rating: 4.9, reviewCount: 128, verified: true, location: 'Manchester, United Kingdom' },
    category: 'sneakers',
    subcategory: 'Low tops',
    description: 'Cloud white/gum. Worn indoors mostly.',
    createdAt: '2026-09-20T17:00:00Z',
  },
  {
    id: 'l25',
    title: 'Silk Printed Scarf',
    brand: 'Hermès',
    size: null,
    condition: 'Very good',
    price: 240,
    originalPrice: 415,
    priceWithProtection: 251.5,
    images: [img('photo-1601924994987-69e26d50dc26'), img('photo-1584030373081-f37b7bb4fa8e')],
    mediaAspectRatio: 0.95,
    likes: 37,
    views: 280,
    sellerId: 'u1',
    seller: { id: 'u1', username: 'mariefullery', avatar: USERS[0].avatar, rating: 4.8, reviewCount: 54, verified: true, location: 'South Elmsall, United Kingdom' },
    category: 'accessories',
    subcategory: 'Scarves',
    description: 'Carré 90, hand-rolled edges. Comes with box.',
    createdAt: '2026-09-14T14:00:00Z',
  },
  {
    id: 'l26',
    title: 'Wide-Leg Wool Trousers',
    brand: 'The Row',
    size: 'UK 8',
    condition: 'Very good',
    price: 280,
    originalPrice: 790,
    priceWithProtection: 293.3,
    images: [img('photo-1594633312681-425c7b97ccd1'), img('photo-1509319117193-57bab727e09d')],
    mediaAspectRatio: 0.72,
    likes: 71,
    views: 390,
    sellerId: 'u5',
    seller: { id: 'u5', username: 'archive.thread', avatar: USERS[4].avatar, rating: 4.9, reviewCount: 211, verified: true, location: 'Leeds, United Kingdom' },
    category: 'women',
    subcategory: 'Trousers',
    description: 'Fluid wide leg in black virgin wool. Immaculate.',
    createdAt: '2026-09-18T16:00:00Z',
  },
  {
    id: 'l27',
    title: 'Graphic Print Tee',
    brand: 'Stüssy',
    size: 'L',
    condition: 'Good',
    price: 32,
    priceWithProtection: 34.9,
    images: [img('photo-1618354691373-d851c5c3a990'), img('photo-1562157873-818bc0726f68')],
    mediaAspectRatio: 0.8,
    likes: 26,
    views: 190,
    sellerId: 'u3',
    seller: { id: 'u3', username: 'dankdunksuk', avatar: USERS[2].avatar, rating: 4.9, reviewCount: 128, verified: true, location: 'Manchester, United Kingdom' },
    category: 'men',
    subcategory: 'T-shirts',
    description: '8-ball print, washed black. Soft hand feel.',
    createdAt: '2026-09-12T12:00:00Z',
  },
  {
    id: 'l28',
    title: 'Structured Leather Tote',
    brand: 'The Row',
    size: null,
    condition: 'Very good',
    price: 890,
    originalPrice: 1450,
    priceWithProtection: 924.6,
    images: [img('photo-1590874103328-eac38a683ce7'), img('photo-1611312449545-94176309c857')],
    mediaAspectRatio: 0.88,
    likes: 118,
    views: 760,
    sellerId: 'u1',
    seller: { id: 'u1', username: 'mariefullery', avatar: USERS[0].avatar, rating: 4.8, reviewCount: 54, verified: true, location: 'South Elmsall, United Kingdom' },
    category: 'bags',
    subcategory: 'Totes',
    description: 'Park tote in saddle leather. Corners clean, interior pristine.',
    createdAt: '2026-09-19T10:00:00Z',
  },
];

// ============================================================================
// CATEGORIES
// ============================================================================

export const CATEGORIES: Category[] = [
  { slug: 'women', name: 'Women', image: img('photo-1490481651871-ab68de25d43d', 400) },
  { slug: 'men', name: 'Men', image: img('photo-1520975954732-35dd22299614', 400) },
  { slug: 'sneakers', name: 'Sneakers', image: img('photo-1552346154-21d32810aba3', 400) },
  { slug: 'bags', name: 'Bags', image: img('photo-1584917865442-de89df76afd3', 400) },
  { slug: 'accessories', name: 'Accessories', image: img('photo-1523170335258-f5ed11844a49', 400) },
  { slug: 'vintage', name: 'Vintage', image: img('photo-1523205771623-e0faa4d2813d', 400) },
  { slug: 'designer', name: 'Designer', image: img('photo-1469334031218-e382a71b716b', 400) },
  { slug: 'streetwear', name: 'Streetwear', image: img('photo-1523398002811-999ca8dec234', 400) },
];

export const HOME_CATEGORY_PILLS = [
  'All',
  'Women',
  'Men',
  'Sneakers',
  'Bags',
  'Accessories',
  'Vintage',
  'Designer',
  'Streetwear',
];

// ============================================================================
// STORIES / LOOKS / POSTERS / MOODBOARDS
// ============================================================================

export const STORY_RAIL: { id: string; username: string; avatar: string; coverUri: string; seen?: boolean }[] = [
  { id: 's1', username: 'mariefullery', avatar: USERS[0].avatar, coverUri: img('photo-1445205170230-053b83016050', 400) },
  { id: 's2', username: 'dankdunksuk', avatar: USERS[2].avatar, coverUri: img('photo-1552346154-21d32810aba3', 400) },
  { id: 's3', username: 'archive.thread', avatar: USERS[4].avatar, coverUri: img('photo-1469334031218-e382a71b716b', 400) },
  { id: 's4', username: 'ellawears', avatar: USERS[5].avatar, coverUri: img('photo-1509631179647-0177331693ae', 400) },
  { id: 's5', username: 'scott_art', avatar: USERS[1].avatar, coverUri: img('photo-1520975954732-35dd22299614', 400), seen: true },
  { id: 's6', username: 'lucygibson94', avatar: USERS[3].avatar, coverUri: img('photo-1483985988355-763728e1935b', 400) },
];

export const LOOKS: Look[] = [
  {
    id: 'look-1',
    creatorId: 'u5',
    coverImageUri: img('photo-1485968579580-b6d095142e6e', 900),
    coverAspectRatio: 0.75,
    title: 'Quiet luxury, layered',
    itemIds: ['l9', 'l14', 'l26'],
    likeCount: 342,
    createdAt: '2026-09-20T10:00:00Z',
  },
  {
    id: 'look-2',
    creatorId: 'u3',
    coverImageUri: img('photo-1523398002811-999ca8dec234', 900),
    coverAspectRatio: 0.8,
    title: 'Street staples',
    itemIds: ['l4', 'l11', 'l27'],
    likeCount: 518,
    createdAt: '2026-09-19T14:00:00Z',
  },
  {
    id: 'look-3',
    creatorId: 'u6',
    coverImageUri: img('photo-1496747611176-843222e1e57c', 900),
    coverAspectRatio: 0.7,
    title: 'Late summer dresses',
    itemIds: ['l6', 'l12', 'l21'],
    likeCount: 224,
    createdAt: '2026-09-18T09:00:00Z',
  },
];

export const POSTERS: Poster[] = [
  {
    id: 'p1',
    authorId: 'u1',
    coverUri: img('photo-1445205170230-053b83016050', 800),
    aspectRatio: 0.75,
    caption: 'New drop — designer knitwear from £45',
    createdAt: '2026-09-21T10:00:00Z',
  },
  {
    id: 'p2',
    authorId: 'u5',
    coverUri: img('photo-1469334031218-e382a71b716b', 800),
    aspectRatio: 0.8,
    caption: 'Archive sale this weekend',
    createdAt: '2026-09-20T16:00:00Z',
  },
];

export const MOODBOARDS: Moodboard[] = [
  {
    id: 'mb1',
    ownerId: 'me',
    title: 'Autumn capsule',
    coverUri: img('photo-1544022613-e87ca75a784a', 800),
    aspectRatio: 0.8,
    itemCount: 12,
    createdAt: '2026-09-15T10:00:00Z',
  },
  {
    id: 'mb2',
    ownerId: 'me',
    title: 'Grails',
    coverUri: img('photo-1584917865442-de89df76afd3', 800),
    aspectRatio: 0.9,
    itemCount: 5,
    createdAt: '2026-09-10T10:00:00Z',
  },
];

// ============================================================================
// INBOX / CONVERSATIONS
// ============================================================================

export const CONVERSATIONS: Conversation[] = [
  {
    id: 'c1',
    participantId: 'u3',
    participantName: 'dankdunksuk',
    participantAvatar: USERS[2].avatar,
    participantVerified: true,
    lastMessage: 'Can do £135 if you take it today',
    lastMessageTime: '2m',
    unread: true,
    isOnline: true,
    listing: {
      id: 'l4',
      title: 'Nike Air Jordan 1 Retro High OG',
      price: 145,
      image: img('photo-1595341888016-a392ef81b7de', 200),
    },
    messages: [
      { id: 'm1', senderId: 'me', text: 'Hi — is the box included?', timestamp: '2026-09-25T09:12:00Z', sender: 'me', readStatus: 'read' },
      { id: 'm2', senderId: 'u3', text: 'Hey! Yes box included, no lid though', timestamp: '2026-09-25T09:14:00Z', sender: 'other' },
      { id: 'm3', senderId: 'me', text: 'Would you take £130?', timestamp: '2026-09-25T09:20:00Z', sender: 'me', type: 'offer', offerPrice: 130, originalPrice: 145, offerStatus: 'countered', readStatus: 'read' },
      { id: 'm4', senderId: 'u3', text: 'Can do £135 if you take it today', timestamp: '2026-09-25T09:22:00Z', sender: 'other' },
    ],
  },
  {
    id: 'c2',
    participantId: 'u6',
    participantName: 'ellawears',
    participantAvatar: USERS[5].avatar,
    participantVerified: true,
    lastMessage: 'Posted this morning — tracking in the order',
    lastMessageTime: '1h',
    unread: true,
    listing: {
      id: 'l6',
      title: 'Silk Slip Dress',
      price: 95,
      image: img('photo-1595777457583-95e059d581b8', 200),
    },
    messages: [
      { id: 'm5', senderId: 'u6', text: 'Thanks for your order!', timestamp: '2026-09-24T18:00:00Z', sender: 'other' },
      { id: 'm6', senderId: 'u6', text: 'Posted this morning — tracking in the order', timestamp: '2026-09-25T08:30:00Z', sender: 'other' },
    ],
  },
  {
    id: 'c3',
    participantId: 'u5',
    participantName: 'archive.thread',
    participantAvatar: USERS[4].avatar,
    participantVerified: true,
    lastMessage: 'The Margiela listing goes live Sunday',
    lastMessageTime: '3h',
    unread: false,
    messages: [
      { id: 'm7', senderId: 'me', text: 'Any more Margiela coming?', timestamp: '2026-09-25T06:40:00Z', sender: 'me', readStatus: 'read' },
      { id: 'm8', senderId: 'u5', text: 'The Margiela listing goes live Sunday', timestamp: '2026-09-25T06:52:00Z', sender: 'other' },
    ],
  },
  {
    id: 'c4',
    participantId: 'u2',
    participantName: 'scott_art',
    participantAvatar: USERS[1].avatar,
    lastMessage: 'Is the Harrington still available?',
    lastMessageTime: '1d',
    unread: false,
    isRequest: true,
    listing: {
      id: 'l3',
      title: 'Polo Ralph Lauren Harrington Jacket',
      price: 85,
      image: img('photo-1591047139829-d91aecb6caea', 200),
    },
    messages: [
      { id: 'm9', senderId: 'u2', text: 'Is the Harrington still available?', timestamp: '2026-09-24T11:00:00Z', sender: 'other' },
    ],
  },
];

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export const NOTIFICATIONS: AppNotification[] = [
  { id: 'n1', itemImage: img('photo-1595341888016-a392ef81b7de', 200), text: 'dankdunksuk sent you a counter-offer on Nike Air Jordan 1', time: '2m', type: 'offer' },
  { id: 'n2', itemImage: img('photo-1595777457583-95e059d581b8', 200), text: 'Your order of Silk Slip Dress has been shipped', time: '1h', type: 'order' },
  { id: 'n3', itemImage: img('photo-1548036328-c9fa89d128fa', 200), text: 'mariefullery favourited your Quilted Leather Shoulder Bag', time: '4h', type: 'favourite' },
  { id: 'n4', itemImage: USERS[4].avatar, text: 'archive.thread started following you', time: '6h', type: 'follow' },
  { id: 'n5', itemImage: img('photo-1539533018447-63fcce2678e3', 200), text: 'Price drop: Oversized Wool Coat is now £320', time: '1d', type: 'new_item' },
  { id: 'n6', itemImage: img('photo-1523170335258-f5ed11844a49', 200), text: 'New items in Accessories match your saved search', time: '2d', type: 'system' },
];

/**
 * Extended activity feed — covers the full per-kind grammar (likes, offers,
 * price drops, follows, orders, reviews, new items, system) with explicit
 * deep links and an honest read cursor. The notifications surface merges
 * this with the legacy NOTIFICATIONS rows.
 */
export const NOTIFICATION_FEED: NotificationEntry[] = [
  { id: 'nf1', kind: 'offer', text: 'scott_art sent you an offer of £110 on Cashmere Crew Neck Jumper', time: '12m', image: img('photo-1578932750294-f5075e85f44a', 200), href: '/offers', unread: true },
  { id: 'nf2', kind: 'order', text: 'Your order of Graphic Print Tee was delivered — leave a review', time: '38m', image: img('photo-1618354691373-d851c5c3a990', 200), href: '/orders', unread: true },
  { id: 'nf3', kind: 'like', text: 'ellawears and 3 others liked your Oversized Denim Shirt', time: '2h', image: USERS[5].avatar, isActor: true, href: '/item/ml1', unread: true },
  { id: 'nf4', kind: 'price_drop', text: 'Price drop: Vintage Levi\u2019s 501 Jeans is now £38', time: '5h', image: img('photo-1542272604-787c3835535d', 200), href: '/item/l5' },
  { id: 'nf5', kind: 'follow', text: 'mariefullery started following you', time: 'Yesterday', image: USERS[0].avatar, isActor: true, href: '/u/mariefullery' },
  { id: 'nf6', kind: 'review', text: 'dankdunksuk left you a 5-star review', time: 'Yesterday', image: USERS[2].avatar, isActor: true, href: '/profile' },
  { id: 'nf7', kind: 'new_item', text: 'archive.thread listed Vintage Band Tee — Joy Division', time: '2d', image: img('photo-1576566588028-4147f3842f27', 200), href: '/item/l16' },
  { id: 'nf8', kind: 'offer', text: 'Your offer on Suede Ankle Boots was accepted — complete checkout', time: '3d', image: img('photo-1520639888713-7851133b1ed0', 200), href: '/offers' },
  { id: 'nf9', kind: 'order', text: 'Payout of £34.90 is on its way to your bank', time: '4d', href: '/wallet' },
  { id: 'nf10', kind: 'system', text: 'New items in Sneakers match your saved search', time: '1w', image: img('photo-1560343090-f0409e92791a', 200), href: '/category/sneakers' },
];

// ============================================================================
// ORDERS / WALLET
// ============================================================================

export const ORDERS: Order[] = [
  {
    id: 'ord-1042',
    listingId: 'l6',
    buyerId: 'me',
    sellerId: 'u6',
    status: 'shipped',
    totalPrice: 100.3,
    trackingNumber: 'RM482910374GB',
    createdAt: '2026-09-24T18:00:00Z',
  },
  {
    id: 'ord-1038',
    listingId: 'l19',
    buyerId: 'me',
    sellerId: 'u6',
    status: 'delivered',
    totalPrice: 184.1,
    createdAt: '2026-09-10T11:00:00Z',
  },
  {
    id: 'ord-1021',
    listingId: 'ml3',
    buyerId: 'u4',
    sellerId: 'me',
    status: 'delivered',
    totalPrice: 34.9,
    createdAt: '2026-08-28T09:00:00Z',
  },
];

export const TRANSACTIONS: Transaction[] = [
  { id: 't1', type: 'sale', amount: 34.9, status: 'completed', date: '2026-09-02', description: 'Sale — Graphic Print Tee' },
  { id: 't2', type: 'purchase', amount: -184.1, status: 'completed', date: '2026-09-10', description: 'Purchase — Suede Ankle Boots' },
  { id: 't3', type: 'purchase', amount: -100.3, status: 'completed', date: '2026-09-24', description: 'Purchase — Silk Slip Dress' },
  { id: 't4', type: 'withdrawal', amount: -120.0, status: 'completed', date: '2026-09-05', description: 'Withdrawal to bank •••• 4521' },
  { id: 't5', type: 'sale', amount: 210.7, status: 'pending', date: '2026-09-23', description: 'Sale — YSL Wool Sweater (pending delivery)' },
];

export const WALLET_BALANCE = { available: 214.9, pending: 210.7, currency: 'GBP' };

export const ADDRESSES: Address[] = [
  { id: 'a1', name: 'Home', street: '14 Redchurch Street', city: 'London', postcode: 'E2 7DD', isDefault: true },
  { id: 'a2', name: 'Work', street: '1 Oxford Street', city: 'London', postcode: 'W1D 2HX', isDefault: false },
];

export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'pm1', type: 'card', last4: '4521', brand: 'visa', expiry: '09/28', isDefault: true },
  { id: 'pm2', type: 'card', last4: '8703', brand: 'mastercard', expiry: '02/27', isDefault: false },
];

// ============================================================================
// REVIEWS
// ============================================================================

export const REVIEWS: Review[] = [
  { id: 'r1', userId: 'me', reviewerId: 'u3', reviewerName: 'dankdunksuk', reviewerAvatar: USERS[2].avatar, rating: 5, text: 'Perfect condition, shipped same day. Great seller.', date: '2026-09-12', isAutomatic: false },
  { id: 'r2', userId: 'u3', reviewerId: 'u6', reviewerName: 'ellawears', reviewerAvatar: USERS[5].avatar, rating: 5, text: 'Item exactly as described. Beautiful packaging too.', date: '2026-09-08', isAutomatic: false },
  { id: 'r3', userId: 'u3', reviewerId: 'u2', reviewerName: 'scott_art', reviewerAvatar: USERS[1].avatar, rating: 4, text: 'Good comms, item as pictured.', date: '2026-08-30', isAutomatic: false },
  { id: 'r4', userId: 'me', reviewerId: 'system', reviewerName: 'Automatic review', reviewerAvatar: '', rating: 5, text: 'The order was completed without a review left in time.', date: '2026-08-22', isAutomatic: true },
];

// ============================================================================
// DERIVED COLLECTIONS
// ============================================================================

export const MY_LISTINGS: Listing[] = [
  {
    id: 'ml1',
    title: 'Oversized Denim Shirt',
    brand: 'Weekday',
    size: 'M',
    condition: 'Very good',
    price: 28,
    images: [img('photo-1596755094514-f87e34085b2c')],
    mediaAspectRatio: 0.78,
    likes: 12,
    sellerId: 'me',
    seller: { id: 'me', username: 'you', avatar: CURRENT_USER.avatar, verified: true },
    category: 'women',
    subcategory: 'Shirts',
    description: 'Relaxed denim shirt, worn a few times.',
    createdAt: '2026-09-10T10:00:00Z',
    status: 'active',
  },
  {
    id: 'ml2',
    title: 'Pleated Trousers',
    brand: 'Cos',
    size: 'W30',
    condition: 'Good',
    price: 35,
    images: [img('photo-1594633312681-425c7b97ccd1')],
    mediaAspectRatio: 0.75,
    likes: 8,
    sellerId: 'me',
    seller: { id: 'me', username: 'you', avatar: CURRENT_USER.avatar, verified: true },
    category: 'men',
    subcategory: 'Trousers',
    description: 'Navy pleated trousers.',
    createdAt: '2026-09-02T10:00:00Z',
    status: 'active',
  },
  {
    id: 'ml3',
    title: 'Graphic Print Tee',
    brand: 'Stüssy',
    size: 'L',
    condition: 'Good',
    price: 32,
    images: [img('photo-1618354691373-d851c5c3a990')],
    mediaAspectRatio: 0.8,
    likes: 26,
    isSold: true,
    status: 'sold',
    sellerId: 'me',
    seller: { id: 'me', username: 'you', avatar: CURRENT_USER.avatar, verified: true },
    category: 'men',
    subcategory: 'T-shirts',
    description: 'Sold — 8-ball print.',
    createdAt: '2026-08-20T10:00:00Z',
  },
];

export function listingById(id: string): Listing | undefined {
  return [...LISTINGS, ...MY_LISTINGS].find((l) => l.id === id);
}

export function userById(id: string): User | undefined {
  return USERS.find((u) => u.id === id);
}

export function listingsBySeller(sellerId: string): Listing[] {
  return [...LISTINGS, ...MY_LISTINGS].filter((l) => l.sellerId === sellerId);
}

// ============================================================================
// PDP EVIDENCE — public Q&A threads, curated-collection chrome, size guides
// ============================================================================

/**
 * Public questions & answers per listing, keyed implicitly by listingId.
 * Seller answers carry responderName so the thread can label "Seller · name".
 */
export const LISTING_QA: ListingQuestion[] = [
  {
    id: 'q-l1-1',
    listingId: 'l1',
    askerId: 'u3',
    askerName: 'dankdunksuk',
    askerAvatar: USERS[2].avatar,
    text: 'Hi — could you share the pit-to-pit measurement? Want to check the fit before buying.',
    createdAt: '2026-09-23T14:20:00Z',
    answer: {
      text: 'Of course — 54cm pit to pit and 66cm shoulder to hem. Fits like a true M.',
      responderName: 'mariefullery',
      createdAt: '2026-09-23T16:05:00Z',
    },
  },
  {
    id: 'q-l1-2',
    listingId: 'l1',
    askerId: 'u6',
    askerName: 'ellawears',
    askerAvatar: USERS[5].avatar,
    text: 'Is the wool itchy at all? Sensitive skin over here.',
    createdAt: '2026-09-24T09:12:00Z',
    answer: null,
  },
  {
    id: 'q-l4-1',
    listingId: 'l4',
    askerId: 'u2',
    askerName: 'scott_art',
    askerAvatar: USERS[1].avatar,
    text: 'Any heel drag on the soles?',
    createdAt: '2026-09-22T18:40:00Z',
    answer: {
      text: 'None — worn a handful of times indoors. Tread is clean, check the last photo.',
      responderName: 'dankdunksuk',
      createdAt: '2026-09-22T19:02:00Z',
    },
  },
  {
    id: 'q-l4-2',
    listingId: 'l4',
    askerId: 'u4',
    askerName: 'lucygibson94',
    askerAvatar: USERS[3].avatar,
    text: 'Would you post next day if I buy tonight?',
    createdAt: '2026-09-24T21:15:00Z',
    answer: {
      text: 'Yes — Royal Mail Tracked 24, out the door next working day.',
      responderName: 'dankdunksuk',
      createdAt: '2026-09-24T22:01:00Z',
    },
  },
  {
    id: 'q-l4-3',
    listingId: 'l4',
    askerId: 'u1',
    askerName: 'mariefullery',
    askerAvatar: USERS[0].avatar,
    text: 'Any yellowing on the midsole?',
    createdAt: '2026-09-25T08:30:00Z',
    answer: null,
  },
  {
    id: 'q-l9-1',
    listingId: 'l9',
    askerId: 'u2',
    askerName: 'scott_art',
    askerAvatar: USERS[1].avatar,
    text: 'Which season is this from? The tag photo is a bit blurry.',
    createdAt: '2026-09-21T11:45:00Z',
    answer: {
      text: 'AW19 — I can send a clearer tag shot if you message me.',
      responderName: 'archive.thread',
      createdAt: '2026-09-21T13:20:00Z',
    },
  },
  {
    id: 'q-l6-1',
    listingId: 'l6',
    askerId: 'u4',
    askerName: 'lucygibson94',
    askerAvatar: USERS[3].avatar,
    text: 'How long is it on you? Trying to gauge the hem on someone 5\'4".',
    createdAt: '2026-09-20T16:10:00Z',
    answer: {
      text: 'I\'m 5\'6" and it sits just above the knee — should be a touch longer on you.',
      responderName: 'ellawears',
      createdAt: '2026-09-20T17:48:00Z',
    },
  },
  {
    id: 'q-l3-1',
    listingId: 'l3',
    askerId: 'u6',
    askerName: 'ellawears',
    askerAvatar: USERS[5].avatar,
    text: 'Is the ribbing on the cuffs still tight or has it relaxed?',
    createdAt: '2026-09-24T10:05:00Z',
    answer: null,
  },
];

/**
 * Editorial chrome for the saved collections that can feature a PDP item.
 * Membership itself is derived from each collection's own itemIds — this
 * only carries the rail-facing subtitle and cover art. Ids must exist in
 * the collections fixture so /collection/[id] resolves.
 */
export const CURATED_COLLECTION_META: CuratedCollectionMeta[] = [
  {
    id: 'col-tailoring',
    subtitle: 'Sharp shoulders and clean lines — the modern tailoring edit',
    coverImageUri: img('photo-1594938298603-c8148c4dae35', 800),
  },
  {
    id: 'col-rotation',
    subtitle: 'Light layers and easy pieces for warmer days',
    coverImageUri: img('photo-1445205170230-053b83016050', 800),
  },
  {
    id: 'col-watchlist',
    subtitle: 'Investment pieces our editors would buy twice',
    coverImageUri: img('photo-1490481651871-ab68de25d43d', 800),
  },
];

/**
 * Standard retail measurement tables — reference charts, not listing data.
 * Ported from the mobile SizeGuideSheet for clothing and shoe categories.
 */
export const SIZE_GUIDES: SizeGuide[] = [
  {
    key: 'tops',
    title: 'Tops — Chest & Length',
    columns: ['Size', 'Chest (cm)', 'Length (cm)'],
    rows: [
      { size: 'XS', measurements: { chest: '81–86', length: '66' } },
      { size: 'S', measurements: { chest: '86–91', length: '68' } },
      { size: 'M', measurements: { chest: '91–96', length: '70' } },
      { size: 'L', measurements: { chest: '96–101', length: '72' } },
      { size: 'XL', measurements: { chest: '101–106', length: '74' } },
      { size: 'XXL', measurements: { chest: '106–111', length: '76' } },
    ],
  },
  {
    key: 'bottoms',
    title: 'Bottoms — Waist & Inseam',
    columns: ['Size', 'Waist (cm)', 'Inseam (cm)'],
    rows: [
      { size: 'XS', measurements: { waist: '64–69', inseam: '76' } },
      { size: 'S', measurements: { waist: '69–74', inseam: '78' } },
      { size: 'M', measurements: { waist: '74–79', inseam: '80' } },
      { size: 'L', measurements: { waist: '79–84', inseam: '82' } },
      { size: 'XL', measurements: { waist: '84–89', inseam: '84' } },
      { size: 'XXL', measurements: { waist: '89–94', inseam: '86' } },
    ],
  },
  {
    key: 'dresses',
    title: 'Dresses — Bust & Waist',
    columns: ['Size', 'Bust (cm)', 'Waist (cm)'],
    rows: [
      { size: 'XS', measurements: { bust: '78–82', waist: '60–64' } },
      { size: 'S', measurements: { bust: '82–86', waist: '64–68' } },
      { size: 'M', measurements: { bust: '86–90', waist: '68–72' } },
      { size: 'L', measurements: { bust: '90–94', waist: '72–76' } },
      { size: 'XL', measurements: { bust: '94–98', waist: '76–80' } },
      { size: 'XXL', measurements: { bust: '98–102', waist: '80–84' } },
    ],
  },
  {
    key: 'shoes',
    title: 'Shoes — UK / EU / US',
    columns: ['UK', 'EU', 'US (M)', 'US (F)', 'Foot (cm)'],
    rows: [
      { size: '4', measurements: { eu: '37', usm: '5', usf: '6.5', foot: '23.5' } },
      { size: '5', measurements: { eu: '38', usm: '6', usf: '7.5', foot: '24.1' } },
      { size: '6', measurements: { eu: '39', usm: '7', usf: '8.5', foot: '24.7' } },
      { size: '7', measurements: { eu: '40', usm: '8', usf: '9.5', foot: '25.4' } },
      { size: '8', measurements: { eu: '41', usm: '9', usf: '10.5', foot: '26.0' } },
      { size: '9', measurements: { eu: '42', usm: '10', usf: '11.5', foot: '26.7' } },
      { size: '10', measurements: { eu: '43', usm: '11', usf: '12.5', foot: '27.3' } },
      { size: '11', measurements: { eu: '44', usm: '12', usf: '13.5', foot: '27.9' } },
    ],
  },
  {
    key: 'outerwear',
    title: 'Outerwear — Chest & Shoulder',
    columns: ['Size', 'Chest (cm)', 'Shoulder (cm)'],
    rows: [
      { size: 'XS', measurements: { chest: '84–89', shoulder: '42' } },
      { size: 'S', measurements: { chest: '89–94', shoulder: '44' } },
      { size: 'M', measurements: { chest: '94–99', shoulder: '46' } },
      { size: 'L', measurements: { chest: '99–104', shoulder: '48' } },
      { size: 'XL', measurements: { chest: '104–109', shoulder: '50' } },
      { size: 'XXL', measurements: { chest: '109–114', shoulder: '52' } },
    ],
  },
];

// ============================================================================
// BUNDLES — multi-item pricing rule + per-seller grouping
// ============================================================================

/**
 * Bundle rule — the web fixture-mode pricing contract for multi-item
 * purchases from a single seller.
 *
 * Provenance: the mobile app ships no percentage bundle discount — its
 * BundleBagScreen explicitly declines to fabricate tiers, and the only
 * seller control is a "bundle discount on postage" toggle
 * (postagePreferences.bundleDiscount). For the web fixture build we adopt
 * one honest, Vinted-style tier: 10% off item prices when a seller group
 * reaches 3+ in-bag items. The discount applies to that group's item
 * subtotal only — Buyer Protection and shipping are untouched — and is
 * rounded to pence.
 */
export const BUNDLE_RULE = {
  /** Minimum in-bag items from one seller before the discount applies. */
  minItems: 3,
  /** Fraction off the seller group's item subtotal (0.10 = 10%). */
  discountPct: 0.1,
} as const;

/** Rule rendered in UI copy — one source so the number never drifts. */
export const BUNDLE_RULE_LABEL = `${Math.round(BUNDLE_RULE.discountPct * 100)}% off ${BUNDLE_RULE.minItems}+ items`;

export interface SellerGroup {
  sellerId: string;
  seller: Listing['seller'];
  items: Listing[];
  /** Sum of item prices before any bundle discount. */
  subtotal: number;
  /** True when items.length >= BUNDLE_RULE.minItems. */
  qualifies: boolean;
  /** £ discount for this group — 0 unless it qualifies. */
  discount: number;
}

/**
 * Group bag/checkout items by seller in first-appearance order. This is the
 * single source for "does this seller qualify" — the PDP upsell, the bag
 * groups and checkout totals all read through it so the numbers agree.
 */
export function sellerGroups(listings: Listing[]): SellerGroup[] {
  const bySeller = new Map<string, Listing[]>();
  for (const l of listings) {
    const group = bySeller.get(l.sellerId);
    if (group) group.push(l);
    else bySeller.set(l.sellerId, [l]);
  }
  return [...bySeller.entries()].map(([sellerId, items]) => {
    const subtotal = items.reduce((sum, l) => sum + l.price, 0);
    const qualifies = items.length >= BUNDLE_RULE.minItems;
    return {
      sellerId,
      seller: items[0]?.seller ?? null,
      items,
      subtotal,
      qualifies,
      discount: qualifies
        ? Math.round(subtotal * BUNDLE_RULE.discountPct * 100) / 100
        : 0,
    };
  });
}

/** Total bundle discount across every qualifying seller group. */
export function bundleDiscountFor(listings: Listing[]): number {
  return sellerGroups(listings).reduce((sum, g) => sum + g.discount, 0);
}

// ============================================================================
// GROUP CONVERSATIONS — mirrors mobile domain Conversation (type: 'group')
// ============================================================================

/**
 * Two authored group threads:
 *  - g1 "Archive grails" — no group photo so the 2×2 member mosaic renders;
 *    carries a description (the dismissible in-thread bar), a system row,
 *    an image message and an unread count.
 *  - g2 "London kilo sale" — has an uploaded group photo that overrides the
 *    mosaic, plus a cover photo for the info surface.
 */
const GROUP_CONVERSATIONS: Conversation[] = [
  {
    id: 'g1',
    type: 'group',
    title: 'Archive grails',
    description: 'Early links, fit checks and first dibs on archive drops.',
    participantId: '',
    participantName: 'Archive grails',
    participantAvatar: '',
    participantIds: ['me', 'u5', 'u3', 'u1', 'u2', 'u6'],
    participantProfiles: [
      { id: 'me', username: 'you', displayName: 'You', avatar: CURRENT_USER.avatar, identityVerified: true },
      { id: 'u5', username: 'archive.thread', avatar: USERS[4].avatar, identityVerified: true },
      { id: 'u3', username: 'dankdunksuk', avatar: USERS[2].avatar, identityVerified: true },
      { id: 'u1', username: 'mariefullery', avatar: USERS[0].avatar, identityVerified: true },
      { id: 'u2', username: 'scott_art', avatar: USERS[1].avatar, identityVerified: true },
      { id: 'u6', username: 'ellawears', avatar: USERS[5].avatar, identityVerified: true },
    ],
    lastMessage: '📷 Photo',
    lastMessageTime: '34m',
    unread: true,
    unreadCount: 3,
    messages: [
      { id: 'g1-m1', senderId: 'system', sender: 'system', isSystem: true, systemTitle: 'You created the group', timestamp: '2026-09-23T09:00:00Z' },
      { id: 'g1-m2', senderId: 'u5', sender: 'other', text: 'Sunday drop preview — this chat gets first dibs', timestamp: '2026-09-25T07:40:00Z' },
      { id: 'g1-m3', senderId: 'u3', sender: 'other', text: 'If the Margiela is a 50 I want it', timestamp: '2026-09-25T07:58:00Z' },
      { id: 'g1-m4', senderId: 'me', sender: 'me', text: 'Saving the Helmut for me, hands off', timestamp: '2026-09-25T08:05:00Z', readStatus: 'read' },
      { id: 'g1-m5', senderId: 'u1', sender: 'other', text: 'The knitwear edit is unfair this week', timestamp: '2026-09-25T08:31:00Z' },
      { id: 'g1-m6', senderId: 'u5', sender: 'other', type: 'media', mediaType: 'image', mediaUri: img('photo-1469334031218-e382a71b716b', 640), text: '', timestamp: '2026-09-25T08:44:00Z' },
    ],
  },
  {
    id: 'g2',
    type: 'group',
    title: 'London kilo sale',
    avatar: img('photo-1523398002811-999ca8dec234', 400),
    coverPhoto: img('photo-1445205170230-053b83016050', 1200),
    participantId: '',
    participantName: 'London kilo sale',
    participantAvatar: '',
    participantIds: ['me', 'u2', 'u6'],
    participantProfiles: [
      { id: 'me', username: 'you', displayName: 'You', avatar: CURRENT_USER.avatar, identityVerified: true },
      { id: 'u2', username: 'scott_art', avatar: USERS[1].avatar, identityVerified: true },
      { id: 'u6', username: 'ellawears', avatar: USERS[5].avatar, identityVerified: true },
    ],
    lastMessage: 'Meet outside the east entrance at 10?',
    lastMessageTime: '1d',
    unread: false,
    messages: [
      { id: 'g2-m1', senderId: 'system', sender: 'system', isSystem: true, systemTitle: 'ellawears was added to the group', timestamp: '2026-09-24T10:12:00Z' },
      { id: 'g2-m2', senderId: 'u6', sender: 'other', text: 'Kilo sale this Saturday — who is in?', timestamp: '2026-09-24T10:14:00Z' },
      { id: 'g2-m3', senderId: 'me', sender: 'me', text: 'In. Bringing a tote and a vague plan', timestamp: '2026-09-24T10:20:00Z', readStatus: 'read' },
      { id: 'g2-m4', senderId: 'u2', sender: 'other', text: 'Meet outside the east entrance at 10?', timestamp: '2026-09-24T10:26:00Z' },
    ],
  },
];

// Slot g1 between the 2m and 1h DMs and g2 at the tail so the All tab reads
// in honest recency order (requests stay filtered into their own tab).
CONVERSATIONS.splice(1, 0, GROUP_CONVERSATIONS[0]);
CONVERSATIONS.push(GROUP_CONVERSATIONS[1]);

// ── Session mutations — the fixture store mirrors the mobile store's
//    conversation slice: new threads and appended messages mutate the module
//    dataset so they survive in-app navigation for the session. ──

let localConversationSeq = 0;

/** Existing 1:1 thread with a user, if any (groups are never returned). */
export function findDmWith(userId: string): Conversation | undefined {
  return CONVERSATIONS.find(
    (c) => (c.type ?? 'dm') === 'dm' && c.participantId === userId,
  );
}

/**
 * Create a conversation in the fixture store — one member yields a DM
 * (reusing an existing thread when present), two or more yields a group.
 * Returns the conversation so the caller can navigate to /inbox/[id].
 */
export function createFixtureConversation(input: NewConversationInput): Conversation {
  const memberIds = [...new Set(input.memberIds)].filter((id) => id && id !== 'me');
  if (memberIds.length === 0) {
    throw new Error('Select at least one person.');
  }
  if (memberIds.length === 1) {
    const existing = findDmWith(memberIds[0]);
    if (existing) return existing;
  }

  const now = new Date().toISOString();
  const id = `local-c${++localConversationSeq}-${Date.now().toString(36)}`;
  const profiles: ConversationParticipant[] = [
    { id: 'me', username: CURRENT_USER.username, displayName: 'You', avatar: CURRENT_USER.avatar, identityVerified: true },
    ...memberIds.map((memberId) => {
      const u = userById(memberId);
      return {
        id: memberId,
        username: u?.username ?? memberId,
        displayName: u?.username ?? memberId,
        avatar: u?.avatar ?? null,
        identityVerified: u?.identityVerified ?? false,
      };
    }),
  ];

  let convo: Conversation;
  if (memberIds.length === 1) {
    const other = profiles[1];
    convo = {
      id,
      type: 'dm',
      participantId: other.id,
      participantName: other.username,
      participantAvatar: other.avatar ?? '',
      participantVerified: other.identityVerified,
      participantIds: ['me', other.id],
      participantProfiles: profiles,
      lastMessage: '',
      lastMessageTime: 'now',
      unread: false,
      messages: [],
    };
  } else {
    const title = input.title?.trim() || 'Group chat';
    convo = {
      id,
      type: 'group',
      title,
      description: input.description?.trim() || undefined,
      participantId: '',
      participantName: title,
      participantAvatar: '',
      participantIds: ['me', ...memberIds],
      participantProfiles: profiles,
      lastMessage: 'You created the group',
      lastMessageTime: 'now',
      unread: false,
      messages: [
        {
          id: `${id}-sys-1`,
          senderId: 'system',
          sender: 'system',
          isSystem: true,
          systemTitle: 'You created the group',
          timestamp: now,
        },
      ],
    };
  }
  CONVERSATIONS.unshift(convo);
  return convo;
}

/**
 * Append a message to a fixture conversation — mirrors the mobile store's
 * appendConversationMessage: the row preview falls through text → media →
 * systemTitle → offer ('Offer 135') so the list never shows a blank line.
 * `text` is '' (not undefined) for media-only payloads, so truthiness — not
 * `??` — is required to reach the media fallbacks.
 */
export function appendFixtureMessage(conversationId: string, message: Message): boolean {
  const convo = CONVERSATIONS.find((c) => c.id === conversationId);
  if (!convo) return false;
  convo.messages.push(message);
  convo.lastMessage =
    message.text ||
    (message.mediaType === 'image'
      ? '📷 Photo'
      : message.mediaType === 'video'
        ? '🎥 Video'
        : undefined) ||
    message.systemTitle ||
    (message.offerPrice != null ? `Offer ${message.offerPrice}` : 'New message');
  convo.lastMessageTime = 'now';
  return true;
}

// ============================================================================
// PDP MARKET EVIDENCE — sold comparables, derived price history, liker offers
// ============================================================================

/**
 * A completed sale used as pricing evidence — the "sold comps" signal the
 * mobile PDP's ListingSoldComparables endpoint reports per listing.
 * `soldAt` is the date the sale completed, not the date it was listed.
 */
export interface SoldComparable {
  id: string;
  title: string;
  brand: string | null;
  image: string;
  /** Final sale price in GBP — what the item actually transacted at. */
  soldPrice: number;
  /** ISO date the sale completed. Omitted when unknown. */
  soldAt?: string;
  category: string;
  subcategory?: string | null;
}

/**
 * Authored sold comparables — completed marketplace sales across the
 * categories the listing dataset covers. Prices sit at realistic market
 * points near the catalogue's asking prices; dates trail the fixture
 * "today" (late September 2026) the same way ORDER_DETAILS timelines do.
 */
export const SOLD_COMPARABLES: SoldComparable[] = [
  // Women
  {
    id: 'sc-w1',
    title: 'Linen Wrap Dress',
    brand: 'Reformation',
    image: img('photo-1595777457583-95e059d581b8', 400),
    soldPrice: 68,
    soldAt: '2026-09-22T15:00:00Z',
    category: 'women',
    subcategory: 'Dresses',
  },
  {
    id: 'sc-w2',
    title: 'Wool Blend Cardigan',
    brand: '& Other Stories',
    image: img('photo-1578932750294-f5075e85f44a', 400),
    soldPrice: 42,
    soldAt: '2026-09-15T11:00:00Z',
    category: 'women',
    subcategory: 'Knitwear',
  },
  {
    id: 'sc-w3',
    title: 'Classic Trench Coat',
    brand: 'Aquascutum',
    image: img('photo-1539533018447-63fcce2678e3', 400),
    soldPrice: 210,
    soldAt: '2026-09-08T17:00:00Z',
    category: 'women',
    subcategory: 'Coats',
  },
  {
    id: 'sc-w4',
    title: 'Pleated Satin Midi Skirt',
    brand: 'Whistles',
    image: img('photo-1594633312681-425c7b97ccd1', 400),
    soldPrice: 35,
    soldAt: '2026-08-30T10:00:00Z',
    category: 'women',
    subcategory: 'Skirts',
  },
  // Men
  {
    id: 'sc-m1',
    title: 'Selvedge Denim Jacket',
    brand: 'Levi\'s',
    image: img('photo-1487222477894-8943e31ef7b2', 400),
    soldPrice: 72,
    soldAt: '2026-09-20T12:00:00Z',
    category: 'men',
    subcategory: 'Denim jackets',
  },
  {
    id: 'sc-m2',
    title: 'Oxford Button-Down Shirt',
    brand: 'Ralph Lauren',
    image: img('photo-1596755094514-f87e34085b2c', 400),
    soldPrice: 30,
    soldAt: '2026-09-12T09:00:00Z',
    category: 'men',
    subcategory: 'Shirts',
  },
  {
    id: 'sc-m3',
    title: 'Crew Neck Sweatshirt',
    brand: 'Champion',
    image: img('photo-1556821840-3a63f95609a7', 400),
    soldPrice: 24,
    soldAt: '2026-09-05T18:00:00Z',
    category: 'men',
    subcategory: 'Sweatshirts',
  },
  {
    id: 'sc-m4',
    title: 'Straight Chino Trousers',
    brand: 'Dockers',
    image: img('photo-1473966968600-fa801b869a1a', 400),
    soldPrice: 26,
    soldAt: '2026-08-29T14:00:00Z',
    category: 'men',
    subcategory: 'Trousers',
  },
  // Sneakers
  {
    id: 'sc-s1',
    title: 'Air Force 1 \'07',
    brand: 'Nike',
    image: img('photo-1549298916-b41d501d3772', 400),
    soldPrice: 58,
    soldAt: '2026-09-23T19:00:00Z',
    category: 'sneakers',
    subcategory: 'Low tops',
  },
  {
    id: 'sc-s2',
    title: 'Gazelle Indoor',
    brand: 'Adidas',
    image: img('photo-1600185365483-26d7a4cc7519', 400),
    soldPrice: 64,
    soldAt: '2026-09-17T13:00:00Z',
    category: 'sneakers',
    subcategory: 'Low tops',
  },
  {
    id: 'sc-s3',
    title: 'Air Jordan 4 Retro',
    brand: 'Nike',
    image: img('photo-1552346154-21d32810aba3', 400),
    soldPrice: 165,
    soldAt: '2026-09-09T16:00:00Z',
    category: 'sneakers',
    subcategory: 'High tops',
  },
  {
    id: 'sc-s4',
    title: 'Old Skool',
    brand: 'Vans',
    image: img('photo-1560343090-f0409e92791a', 400),
    soldPrice: 35,
    soldAt: '2026-09-01T10:00:00Z',
    category: 'sneakers',
    subcategory: 'Low tops',
  },
  // Bags
  {
    id: 'sc-b1',
    title: 'Leather Crossbody Bag',
    brand: 'Coach',
    image: img('photo-1548036328-c9fa89d128fa', 400),
    soldPrice: 145,
    soldAt: '2026-09-19T15:00:00Z',
    category: 'bags',
    subcategory: 'Crossbody',
  },
  {
    id: 'sc-b2',
    title: 'Nylon Shoulder Bag',
    brand: 'Prada',
    image: img('photo-1584917865442-de89df76afd3', 400),
    soldPrice: 390,
    soldAt: '2026-09-06T11:00:00Z',
    category: 'bags',
    subcategory: 'Shoulder bags',
  },
  {
    id: 'sc-b3',
    title: 'Canvas Shopper Tote',
    brand: 'L.L.Bean',
    image: img('photo-1591561954557-26941169b49e', 400),
    soldPrice: 18,
    soldAt: '2026-08-27T12:00:00Z',
    category: 'bags',
    subcategory: 'Totes',
  },
  // Accessories
  {
    id: 'sc-a1',
    title: 'Automatic Watch 38mm',
    brand: 'Orient',
    image: img('photo-1523170335258-f5ed11844a49', 400),
    soldPrice: 120,
    soldAt: '2026-09-18T14:00:00Z',
    category: 'accessories',
    subcategory: 'Watches',
  },
  {
    id: 'sc-a2',
    title: 'Silk Twill Scarf',
    brand: 'Ferragamo',
    image: img('photo-1584030373081-f37b7bb4fa8e', 400),
    soldPrice: 85,
    soldAt: '2026-09-11T10:00:00Z',
    category: 'accessories',
    subcategory: 'Scarves',
  },
  {
    id: 'sc-a3',
    title: 'Acetate Sunglasses',
    brand: 'Ray-Ban',
    image: img('photo-1511499767150-a48a237f0083', 400),
    soldPrice: 62,
    soldAt: '2026-09-02T16:00:00Z',
    category: 'accessories',
    subcategory: 'Sunglasses',
  },
];

/**
 * Real sold listings in the dataset folded into comparables — the sale date
 * comes from the matching ORDERS record (an item's `createdAt` is its list
 * date, never its sale date, so unsold-ordered rows keep `soldAt` unset).
 */
const REAL_SOLD_COMPS: SoldComparable[] = [...LISTINGS, ...MY_LISTINGS]
  .filter((l) => l.isSold)
  .map((l) => ({
    id: l.id,
    title: l.title,
    brand: l.brand ?? null,
    image: l.images[0] ?? '',
    soldPrice: l.price,
    soldAt: ORDERS.find((o) => o.listingId === l.id)?.createdAt,
    category: l.category,
    subcategory: l.subcategory ?? null,
  }));

/**
 * Sold comparables for a listing — same-category completed sales, the
 * current listing excluded, subcategory matches ranked first then most
 * recent sale first. Returns up to `count` (a PDP strip shows 3–4); the
 * caller hides the section when fewer than 2 come back.
 */
export function soldComparablesFor(listing: Listing, count = 4): SoldComparable[] {
  return [...REAL_SOLD_COMPS, ...SOLD_COMPARABLES]
    .filter((c) => c.id !== listing.id && c.category === listing.category)
    .sort((a, b) => {
      const aSub = a.subcategory && a.subcategory === listing.subcategory ? 1 : 0;
      const bSub = b.subcategory && b.subcategory === listing.subcategory ? 1 : 0;
      if (aSub !== bSub) return bSub - aSub;
      return (b.soldAt ?? '').localeCompare(a.soldAt ?? '');
    })
    .slice(0, count);
}

/**
 * One price-change event — mirrors the mobile ListingPriceEvent contract.
 * `changedAt` is optional: the fixture record can't always say when the
 * price moved, and an invented timestamp is worse than none.
 */
export interface ListingPriceEvent {
  previousPrice: number;
  newPrice: number;
  changedAt?: string;
}

/**
 * Per-listing price history, honestly derived. The fixture listing record
 * carries `price` and `originalPrice` — that supports exactly one event
 * ("was originalPrice, now price") and nothing more. Listings without a
 * reduction return empty; the section renders "no reductions recorded"
 * rather than a fabricated timeline.
 */
export function priceHistoryFor(listing: Listing): ListingPriceEvent[] {
  if (
    typeof listing.originalPrice === 'number' &&
    listing.originalPrice > listing.price
  ) {
    return [{ previousPrice: listing.originalPrice, newPrice: listing.price }];
  }
  return [];
}

// ── Liker offers — the seller's private discount blast (mobile ─────────────
//    OfferToLikersSheet → POST /listings/:id/offers-to-likers). Fixture mode
//    keeps the sent batch in a module map so the PDP reflects it for the
//    session, the same honesty model as OFFERS/recordSentOffer. ─────────────

export interface SentLikerOffer {
  listingId: string;
  /** Whole-percent discount off the asking price (0 for a custom price). */
  discountPercent: number;
  /** The offer price each liker receives, GBP. */
  offerPrice: number;
  includeFreeShipping: boolean;
  expiryHours: number;
  likerCount: number;
  sentAt: string;
}

const SENT_LIKER_OFFERS = new Map<string, SentLikerOffer>();

/** Fixture-mode send — records the batch so the PDP shows the sent state. */
export function recordLikerOffer(
  input: Omit<SentLikerOffer, 'sentAt'>,
): SentLikerOffer {
  const offer: SentLikerOffer = { ...input, sentAt: new Date().toISOString() };
  SENT_LIKER_OFFERS.set(input.listingId, offer);
  return offer;
}

/** The standing liker offer for a listing this session, if any. */
export function likerOfferFor(listingId: string): SentLikerOffer | undefined {
  return SENT_LIKER_OFFERS.get(listingId);
}

// ============================================================================
// LISTING MANAGEMENT — seller engagement stats + drafts (append-only)
// ============================================================================

/**
 * Per-listing engagement for the seller's own items — the views and
 * watchers the /seller-hub/listings management table reports, keyed by
 * listing id. Fixture-mode truth; in live mode these come from the
 * listing engagement endpoint. Sold rows keep their lifetime numbers.
 */
export const MY_LISTING_STATS: Record<string, { views: number; watchers: number }> = {
  ml1: { views: 184, watchers: 5 },
  ml2: { views: 121, watchers: 3 },
  ml3: { views: 342, watchers: 0 },
};

/**
 * The seller's unpublished drafts. Kept out of MY_LISTINGS on purpose:
 * that array backs the public closet, PDP and discovery surfaces, and a
 * draft must never leak there. Only the management table reads this.
 */
export const MY_DRAFT_LISTINGS: Listing[] = [
  {
    id: 'draft-1',
    title: 'Ribbed Merino Roll Neck',
    brand: 'Arket',
    size: 'S',
    condition: 'Very good',
    price: 34,
    images: [img('photo-1571945153237-4929e783af4a')],
    mediaAspectRatio: 0.8,
    likes: 0,
    views: 0,
    sellerId: 'me',
    seller: { id: 'me', username: 'you', avatar: CURRENT_USER.avatar, verified: true },
    category: 'women',
    description: 'Soft merino roll neck — photos done, description to finish.',
    createdAt: '2026-09-22T18:30:00Z',
    status: 'draft',
  },
  {
    id: 'draft-2',
    title: 'Leather Crossbody Bag',
    brand: null,
    size: null,
    condition: 'Good',
    price: 22,
    images: [img('photo-1548036328-c9fa89d128fa')],
    mediaAspectRatio: 0.78,
    likes: 0,
    views: 0,
    sellerId: 'me',
    seller: { id: 'me', username: 'you', avatar: CURRENT_USER.avatar, verified: true },
    category: 'women',
    description: 'Tan leather crossbody — needs measurements before publishing.',
    createdAt: '2026-09-25T09:15:00Z',
    status: 'draft',
  },
];

// ============================================================================
// PAYOUTS — withdrawal destinations + request history. Mirrors the mobile
// PayoutAccountPayload / PayoutRequestPayload contract (services/walletApi.ts):
// only display-safe data is ever stored — bank name, formatted sort code and
// the account number's last four digits, never the full account number.
// ============================================================================

export interface PayoutAccount {
  id: string;
  /** Account holder name as entered at onboarding. */
  holderName: string;
  bankName: string;
  /** UK sort code, stored formatted `XX-XX-XX`. */
  sortCode: string;
  /** Account number last four digits — the only digits we ever keep. */
  last4: string;
  currency: string;
  isDefault: boolean;
  createdAt: string;
}

export const PAYOUT_ACCOUNTS: PayoutAccount[] = [
  { id: 'pa-1', holderName: 'Alex Morgan', bankName: 'Barclays', sortCode: '20-41-50', last4: '4521', currency: 'GBP', isDefault: true, createdAt: '2026-07-02T10:24:00Z' },
  { id: 'pa-2', holderName: 'Alex Morgan', bankName: 'Monzo', sortCode: '04-00-04', last4: '8813', currency: 'GBP', isDefault: false, createdAt: '2026-08-19T14:32:00Z' },
];

/** Payout lifecycle vocabulary — mirrors PayoutRequestPayload.status. A
 *  request is never "paid" until the bank confirms it: `requested` sits in
 *  review, `processing` means the transfer was initiated but not confirmed. */
export type PayoutRequestStatus = 'requested' | 'processing' | 'paid' | 'failed' | 'cancelled';

export interface PayoutRequest {
  id: string;
  /** Display reference shown on receipts (providerPayoutRef on mobile). */
  reference: string;
  /** PayoutAccount id the request targets. */
  accountId: string;
  /** Display-safe destination label — `Bank •••• last4`. */
  destinationLabel: string;
  amountGbp: number;
  currency: string;
  status: PayoutRequestStatus;
  createdAt: string;
}

export const PAYOUT_REQUESTS: PayoutRequest[] = [
  { id: 'po-1001', reference: 'PO-7KF3A9Q2', accountId: 'pa-1', destinationLabel: 'Barclays •••• 4521', amountGbp: 120, currency: 'GBP', status: 'paid', createdAt: '2026-09-05T09:12:00Z' },
  { id: 'po-1002', reference: 'PO-9LM2C7RD', accountId: 'pa-1', destinationLabel: 'Barclays •••• 4521', amountGbp: 60, currency: 'GBP', status: 'paid', createdAt: '2026-09-15T16:40:00Z' },
  { id: 'po-1003', reference: 'PO-4XT8N1VB', accountId: 'pa-2', destinationLabel: 'Monzo •••• 8813', amountGbp: 45, currency: 'GBP', status: 'processing', createdAt: '2026-09-22T11:05:00Z' },
];

// ============================================================================
// PULSE — short-form creator posts (append-only)
// ============================================================================

/**
 * Authored creator posts backing the /pulse feed. The feed merges these
 * with live events derived from LISTINGS + AUCTIONS (fresh drops, price
 * drops, live auctions) — the same model the mobile PulseFeedScreen
 * renders as rows, reshaped into full-bleed media cards. `itemIds` must
 * resolve through listingById — they power the shoppable chips.
 */
export interface PulsePostEntry {
  id: string;
  authorId: string;
  mediaUri: string;
  /** width/height ratio — portrait media leads the snap column. */
  aspectRatio?: number;
  caption: string;
  itemIds: string[];
  likeCount: number;
  createdAt: string;
}

export const PULSE_POSTS: PulsePostEntry[] = [
  {
    id: 'pp1',
    authorId: 'u5',
    mediaUri: img('photo-1523398002811-999ca8dec234', 900),
    aspectRatio: 0.75,
    caption: 'Archive rail is live — leather, denim and mohair, priced to move.',
    itemIds: ['l7', 'l20', 'l23'],
    likeCount: 412,
    createdAt: '2026-09-22T09:00:00Z',
  },
  {
    id: 'pp2',
    authorId: 'u6',
    mediaUri: img('photo-1496747611176-843222e1e57c', 900),
    aspectRatio: 0.8,
    caption: 'Three ways to wear silk past summer.',
    itemIds: ['l6', 'l21', 'l19'],
    likeCount: 268,
    createdAt: '2026-09-21T15:00:00Z',
  },
  {
    id: 'pp3',
    authorId: 'u3',
    mediaUri: img('photo-1552346154-21d32810aba3', 900),
    aspectRatio: 0.75,
    caption: "Sneaker rotation plus the tee that started it all — everything's listed.",
    itemIds: ['l4', 'l13', 'l24', 'l27'],
    likeCount: 731,
    createdAt: '2026-09-20T18:00:00Z',
  },
  {
    id: 'pp4',
    authorId: 'u1',
    mediaUri: img('photo-1483985988355-763728e1935b', 900),
    aspectRatio: 0.75,
    caption: 'Quiet-luxury staples: cashmere, a silk scarf, one structured tote.',
    itemIds: ['l14', 'l25', 'l28'],
    likeCount: 356,
    createdAt: '2026-09-19T12:00:00Z',
  },
  {
    id: 'pp5',
    authorId: 'u2',
    mediaUri: img('photo-1520975954732-35dd22299614', 900),
    aspectRatio: 0.8,
    caption: 'Menswear drop — harrington, blazer, cargos. All one owner.',
    itemIds: ['l3', 'l15', 'l18'],
    likeCount: 189,
    createdAt: '2026-09-18T16:00:00Z',
  },
];
