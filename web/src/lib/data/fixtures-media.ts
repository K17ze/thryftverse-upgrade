/**
 * Media-department fixtures — live shopping sessions, Galleria editorial
 * surfaces and poster slides. Kept separate from fixtures.ts (owned by
 * another department); same unsplash curation so media stays real.
 */

const img = (id: string, w = 1200) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

// ============================================================================
// LIVE SHOPPING
// ============================================================================

export type LiveSessionStatus = 'live' | 'upcoming' | 'ended';

export interface LiveSession {
  id: string;
  title: string;
  sellerId: string;
  coverUri: string;
  /** w/h */
  aspectRatio: number;
  status: LiveSessionStatus;
  viewers?: number;
  scheduledAt?: string;
  /** minutes — replays only */
  durationMinutes?: number;
  category?: string;
  // ── Live-mode extras (services/live.ts) — absent on fixture rows ──
  sellerName?: string;
  sellerAvatar?: string;
  sellerVerified?: boolean;
  likeCount?: number;
  startedAt?: string;
  endedAt?: string;
  currentItemTitle?: string;
  currentBid?: number;
  recordingUrl?: string | null;
  recordingEnabled?: boolean;
  isFollowing?: boolean;
  reminderSet?: boolean;
  isDemo?: boolean;
}

export const LIVE_SESSIONS: LiveSession[] = [
  {
    id: 'live-1',
    title: 'Archive designer drop — Margiela, Helmut Lang, early Raf',
    sellerId: 'u5',
    coverUri: img('photo-1441986300917-64674bd600d8'),
    aspectRatio: 16 / 10,
    status: 'live',
    viewers: 1284,
    category: 'Designer',
  },
  {
    id: 'live-2',
    title: 'Sunday sneaker heat — Jordan 1s, Sambas, 550s',
    sellerId: 'u3',
    coverUri: img('photo-1552346154-21d32810aba3'),
    aspectRatio: 16 / 10,
    status: 'live',
    viewers: 862,
    category: 'Sneakers',
  },
  {
    id: 'live-3',
    title: 'Quiet luxury knitwear — cashmere under £130',
    sellerId: 'u1',
    coverUri: img('photo-1434389677669-e08b4cac3105'),
    aspectRatio: 4 / 5,
    status: 'upcoming',
    scheduledAt: inHours(5),
    category: 'Women',
  },
  {
    id: 'live-4',
    title: 'Vintage tees & band merch — single stitch only',
    sellerId: 'u5',
    coverUri: img('photo-1523381210434-271e8be1f52b'),
    aspectRatio: 4 / 5,
    status: 'upcoming',
    scheduledAt: inHours(26),
    category: 'Vintage',
  },
  {
    id: 'live-5',
    title: 'Late-summer dresses — silk, linen, bias cuts',
    sellerId: 'u6',
    coverUri: img('photo-1496747611176-843222e1e57c'),
    aspectRatio: 4 / 5,
    status: 'upcoming',
    scheduledAt: inHours(52),
    category: 'Women',
  },
  {
    id: 'live-6',
    title: 'The coat edit — Max Mara, Toteme, The Row',
    sellerId: 'u6',
    coverUri: img('photo-1544022613-e87ca75a784a'),
    aspectRatio: 4 / 5,
    status: 'ended',
    durationMinutes: 47,
    category: 'Women',
  },
  {
    id: 'live-7',
    title: 'Bag evening — Chanel flap, Park tote, vintage finds',
    sellerId: 'u1',
    coverUri: img('photo-1584917865442-de89df76afd3'),
    aspectRatio: 4 / 5,
    status: 'ended',
    durationMinutes: 63,
    category: 'Bags',
  },
  {
    id: 'live-8',
    title: 'Workwear & denim — Carhartt, Levi\u2019s, Acne',
    sellerId: 'u2',
    coverUri: img('photo-1520975954732-35dd22299614'),
    aspectRatio: 4 / 5,
    status: 'ended',
    durationMinutes: 38,
    category: 'Men',
  },
  {
    id: 'live-9',
    title: 'Accessories hour — watches, scarves, eyewear',
    sellerId: 'u3',
    coverUri: img('photo-1523170335258-f5ed11844a49'),
    aspectRatio: 4 / 5,
    status: 'ended',
    durationMinutes: 52,
    category: 'Accessories',
  },
];

// ============================================================================
// GALLERIA — editorial landing
// ============================================================================

export interface GalleriaHero {
  kicker: string;
  headline: string;
  subline: string;
  mediaUri: string;
  focalPoint?: { x: number; y: number };
}

export const GALLERIA_HERO: GalleriaHero = {
  kicker: 'The Galleria · Issue 04',
  headline: 'Worn well,\nworn again',
  subline:
    'A seasonal edit of the pieces our community keeps coming back to — archive tailoring, quiet knitwear and the bags that outlast trends.',
  mediaUri: img('photo-1490481651871-ab68de25d43d', 1800),
  focalPoint: { x: 0.5, y: 0.32 },
};

export interface GalleriaCollection {
  id: string;
  title: string;
  dek: string;
  coverUri: string;
  aspectRatio: number;
  focalPoint?: { x: number; y: number };
  listingIds: string[];
}

export const GALLERIA_COLLECTIONS: GalleriaCollection[] = [
  {
    id: 'gc-1',
    title: 'The Archive Rail',
    dek: 'Margiela-era minimalism and the tailoring that built it.',
    coverUri: img('photo-1469334031218-e382a71b716b'),
    aspectRatio: 4 / 5,
    listingIds: ['l15', 'l20', 'l16', 'l5', 'l26', 'l7'],
  },
  {
    id: 'gc-2',
    title: 'Quiet Luxury',
    dek: 'Cashmere, silk and wool in the tones that whisper.',
    coverUri: img('photo-1539533018447-63fcce2678e3'),
    aspectRatio: 4 / 5,
    focalPoint: { x: 0.5, y: 0.3 },
    listingIds: ['l9', 'l14', 'l6', 'l21', 'l23', 'l12'],
  },
  {
    id: 'gc-3',
    title: 'The Sneaker Shelf',
    dek: 'Grails and daily beaters, legit-checked and laced up.',
    coverUri: img('photo-1552346154-21d32810aba3'),
    aspectRatio: 4 / 5,
    focalPoint: { x: 0.5, y: 0.6 },
    listingIds: ['l4', 'l13', 'l24'],
  },
];

// ============================================================================
// GALLERIA — magazine depth: bylines, editorials, featured assets, archive
// Append-only extension of the landing fixtures above. The cover story reuses
// GALLERIA_HERO so the masthead never forks from the hero artwork.
// ============================================================================

export interface GalleriaByline {
  name: string;
  role: string;
  avatarUri: string;
}

export const GALLERIA_BYLINES: Record<string, GalleriaByline> = {
  style: {
    name: 'Margaux Ellison',
    role: 'Style Director',
    avatarUri: img('photo-1494790108377-be9c29b29330', 200),
  },
  features: {
    name: 'Jonah Reyes',
    role: 'Features Editor',
    avatarUri: img('photo-1535713875002-d1d0cf377fde', 200),
  },
  market: {
    name: 'Priya Nair',
    role: 'Market Editor',
    avatarUri: img('photo-1438761681033-6461ffad8d80', 200),
  },
  sneakers: {
    name: 'Theo Marchetti',
    role: 'Sneaker Desk',
    avatarUri: img('photo-1599566150163-29194dcaad36', 200),
  },
};

export interface GalleriaEditorial {
  id: string;
  issueLabel: string;
  kicker: string;
  title: string;
  dek: string;
  heroUri: string;
  focalPoint?: { x: number; y: number };
  author: GalleriaByline;
  /** ISO date */
  publishedAt: string;
  readMinutes: number;
  body: string[];
  /** Shoppable pieces referenced in the story. */
  listingIds: string[];
}

export const GALLERIA_EDITORIALS: GalleriaEditorial[] = [
  {
    id: 'ed-04-cover',
    issueLabel: 'Issue 04',
    kicker: 'Cover story',
    title: GALLERIA_HERO.headline,
    dek: GALLERIA_HERO.subline,
    heroUri: GALLERIA_HERO.mediaUri,
    focalPoint: GALLERIA_HERO.focalPoint,
    author: GALLERIA_BYLINES.style,
    publishedAt: '2026-10-02T09:00:00Z',
    readMinutes: 6,
    body: [
      'The best wardrobes are not bought twice — they are bought once, worn hard, and passed on intact. This issue is about the pieces that survive the cycle: tailoring cut before the trend, knitwear in fibres that outlast the season, and hardware that earns its patina.',
      'We asked our sellers what never stays listed for long. The answer was never the loudest piece on the rail. It was the Margiela-era blazer with the exact shoulder, the cashmere crew that has already survived three owners, the quilted flap that appreciates while it ages.',
      'Everything in this edit is second-hand, authenticated, and priced below what the same quality costs new. That is the point: buying well once is still the cheapest way to dress well forever.',
    ],
    listingIds: ['l15', 'l9', 'l8', 'l26', 'l14', 'l4'],
  },
  {
    id: 'ed-04-archive-rail',
    issueLabel: 'Issue 04',
    kicker: 'Seller profile',
    title: 'Inside the archive rail',
    dek: 'archive.thread has moved 200-plus pieces of Margiela, Helmut Lang and early Raf. We asked what makes a piece archive — and what never will be.',
    heroUri: img('photo-1441986300917-64674bd600d8', 1400),
    focalPoint: { x: 0.5, y: 0.4 },
    author: GALLERIA_BYLINES.features,
    publishedAt: '2026-09-28T09:00:00Z',
    readMinutes: 5,
    body: [
      'Archive is a word that gets spent carelessly. For the sellers who deal in it, the bar is simpler than the hype suggests: a piece that changed how clothes were cut, in a condition that still lets you wear the idea.',
      '"People think archive means museum," the seller behind the rail told us. "It means the opposite. These are the pieces that were worn the hardest because they were the best. A Helmut Lang denim jacket with the right fade tells you more than a deadstock tag."',
      'His rule for buyers: buy the era, not the logo. The listings below are the four he would keep if the rail ever closed.',
    ],
    listingIds: ['l15', 'l20', 'l16', 'l5'],
  },
  {
    id: 'ed-04-quiet-luxury',
    issueLabel: 'Issue 04',
    kicker: 'Style notes',
    title: 'The quiet-luxury formula',
    dek: 'Cashmere, silk and wool in tones that whisper. Why the most expensive-looking rail is also the most reworn.',
    heroUri: img('photo-1539533018447-63fcce2678e3', 1400),
    focalPoint: { x: 0.5, y: 0.3 },
    author: GALLERIA_BYLINES.market,
    publishedAt: '2026-09-24T09:00:00Z',
    readMinutes: 4,
    body: [
      'Quiet luxury is not a palette, it is a cost-per-wear argument. A £120 cashmere crew worn eighty times beats a £40 acrylic one worn four — and the resale market knows it, which is why the good neutrals move first.',
      'The formula our buyers use: natural fibre, no visible logo, a colour you can name a season for. Camel, charcoal, cream, navy. If it photographs boring, it probably wears beautifully.',
    ],
    listingIds: ['l9', 'l14', 'l21', 'l23'],
  },
  {
    id: 'ed-04-legit-check',
    issueLabel: 'Issue 04',
    kicker: 'Legit check',
    title: 'How to spot a grail',
    dek: 'The five-minute check our sneaker desk runs on every Jordan 1 before it reaches the shelf — stitching, shape and the smell test.',
    heroUri: img('photo-1549298916-b41d501d3772', 1400),
    focalPoint: { x: 0.5, y: 0.55 },
    author: GALLERIA_BYLINES.sneakers,
    publishedAt: '2026-09-19T09:00:00Z',
    readMinutes: 7,
    body: [
      'Every pair on the shelf gets the same five minutes. Shape first: the hourglass pinch at the heel that replicas never quite nail. Then the stitching — one clean line, no double tracks, no fraying at the swoosh root.',
      'The box matters less than people think; the insole print matters more. Wear on the tread is honest. Wear on the logo is suspicious. And yes, there is a smell test — factory glue reads different from leather that has lived.',
      'The three pairs below passed this week. Two will not be here next week.',
    ],
    listingIds: ['l4', 'l13', 'l24'],
  },
  {
    id: 'ed-04-care-manual',
    issueLabel: 'Issue 04',
    kicker: 'Keep it longer',
    title: 'The care manual',
    dek: 'Depilling cashmere, conditioning leather, washing denim less. The maintenance habits that make second-hand feel first-rate.',
    heroUri: img('photo-1523381210434-271e8be1f52b', 1400),
    focalPoint: { x: 0.5, y: 0.4 },
    author: GALLERIA_BYLINES.style,
    publishedAt: '2026-09-12T09:00:00Z',
    readMinutes: 4,
    body: [
      'The difference between pre-loved and worn out is usually about twenty minutes of maintenance. Cashmere depills once and then behaves. Leather drinks conditioner twice a year and repays you in decades.',
      'Wash denim cold, inside out, rarely. Spot-clean suede instead of soaking it. Store knitwear folded — always. The sellers with the best feedback scores are not selling better stock; they are selling better-maintained stock.',
    ],
    listingIds: ['l7', 'l18', 'l19'],
  },
];

export interface GalleriaFeaturedCollection extends GalleriaCollection {
  /** Theme kicker shown over the cover — the editorial lens, not a category. */
  theme: string;
  curator: GalleriaByline;
}

export const GALLERIA_FEATURED_COLLECTIONS: GalleriaFeaturedCollection[] = [
  { ...GALLERIA_COLLECTIONS[0], theme: 'Archive', curator: GALLERIA_BYLINES.features },
  { ...GALLERIA_COLLECTIONS[1], theme: 'Quiet luxury', curator: GALLERIA_BYLINES.style },
  { ...GALLERIA_COLLECTIONS[2], theme: 'Sneakers', curator: GALLERIA_BYLINES.sneakers },
  {
    id: 'gc-4',
    title: 'Carry Over',
    dek: 'The bags and totes that hold their value — and your whole life.',
    coverUri: img('photo-1584917865442-de89df76afd3'),
    aspectRatio: 4 / 5,
    focalPoint: { x: 0.5, y: 0.4 },
    listingIds: ['l8', 'l22', 'l28'],
    theme: 'Bags',
    curator: GALLERIA_BYLINES.market,
  },
];

export interface GalleriaFeaturedAsset {
  /** Resolves against fixtures.ts listings; links to /item/[id]. */
  listingId: string;
  /** Provenance — the edit this piece was pulled from. */
  fromCollection: string;
  /** One-line editor's note under the title. */
  note: string;
}

export const GALLERIA_FEATURED_ASSETS: GalleriaFeaturedAsset[] = [
  {
    listingId: 'l8',
    fromCollection: 'Carry Over',
    note: 'The quilted shoulder bag collectors quietly fight over.',
  },
  {
    listingId: 'l15',
    fromCollection: 'The Archive Rail',
    note: "Tailoring with the kind of shoulder you can't fake.",
  },
  {
    listingId: 'l4',
    fromCollection: 'The Sneaker Shelf',
    note: 'OG colourway, legit-checked twice this month.',
  },
  {
    listingId: 'l23',
    fromCollection: 'Quiet Luxury',
    note: 'Mohair that reads expensive from across the room.',
  },
  {
    listingId: 'l10',
    fromCollection: 'Accessories',
    note: 'A 40mm chronograph with a full service history.',
  },
  {
    listingId: 'l25',
    fromCollection: 'Quiet Luxury',
    note: 'Frame it, knot it, or wear it — silk forgives all three.',
  },
];

export interface GalleriaArchiveIssue {
  id: string;
  issueLabel: string;
  title: string;
  coverUri: string;
  focalPoint?: { x: number; y: number };
  /** ISO date */
  publishedAt: string;
}

export const GALLERIA_ARCHIVE: GalleriaArchiveIssue[] = [
  {
    id: 'iss-03',
    issueLabel: 'Issue 03',
    title: 'The winter edit',
    coverUri: img('photo-1544022613-e87ca75a784a', 800),
    focalPoint: { x: 0.5, y: 0.35 },
    publishedAt: '2025-12-05T09:00:00Z',
  },
  {
    id: 'iss-02',
    issueLabel: 'Issue 02',
    title: 'Second skin',
    coverUri: img('photo-1496747611176-843222e1e57c', 800),
    focalPoint: { x: 0.5, y: 0.4 },
    publishedAt: '2025-10-03T09:00:00Z',
  },
  {
    id: 'iss-01',
    issueLabel: 'Issue 01',
    title: 'Begin again',
    coverUri: img('photo-1445205170230-053b83016050', 800),
    focalPoint: { x: 0.5, y: 0.4 },
    publishedAt: '2025-08-08T09:00:00Z',
  },
  {
    id: 'iss-00',
    issueLabel: 'Issue 00',
    title: 'The pilot',
    coverUri: img('photo-1483985988355-763728e1935b', 800),
    focalPoint: { x: 0.5, y: 0.4 },
    publishedAt: '2025-06-06T09:00:00Z',
  },
];

/**
 * Listings a seller pinned during a show — session id → listing ids
 * (resolved through listingById in fixtures.ts). Order is the pin order;
 * the first entry is the lot currently on the table.
 */
export const LIVE_SESSION_PRODUCTS: Record<string, string[]> = {
  'live-1': ['l20', 'l5', 'l16', 'l7', 'l26'],
  'live-2': ['l4', 'l24', 'l13', 'l11', 'l27'],
  'live-6': ['l9', 'l21', 'l19', 'l12'],
  'live-7': ['l8', 'l28', 'l25', 'l17'],
  'live-8': ['l3', 'l18', 'l15', 'l2'],
  'live-9': ['l10', 'l24', 'l13'],
};

/**
 * Live chat fixture lines — the deterministic transcript keyed by session.
 * Live sessions stream these in on a tick; replays render the whole
 * transcript read-only. `seller` renders the SELLER mark (mirrors mobile's
 * isSeller chat treatment); `system` renders an italic meta line.
 */
export interface LiveChatLine {
  id: string;
  user: string;
  text: string;
  kind?: 'chat' | 'system';
  seller?: boolean;
}

export const LIVE_CHAT_LINES: Record<string, LiveChatLine[]> = {
  'live-1': [
    { id: 'l1c1', user: 'mia.k', text: 'the margiela tabs on that jacket are insane' },
    { id: 'l1c2', user: 'jodielouise', text: 'size on the helmut knit?' },
    { id: 'l1c3', user: 'archive.thread', text: 'IT48 — fits like a men’s S/M', seller: true },
    { id: 'l1c4', user: 'thriftgoblin', text: 'just bagged the 501s, gone in seconds' },
    { id: 'l1c5', user: 'felixr', text: 'any raf coming up tonight?' },
    { id: 'l1c6', user: 'archive.thread', text: 'raf bomber is lot 4 — stay close', seller: true },
    { id: 'l1c7', user: 'sandra_m', text: 'do you ship to dublin?' },
    { id: 'l1c8', user: 'archive.thread', text: 'worldwide, tracked and insured', seller: true },
    { id: 'l1c9', user: 'benny.h', text: 'this chat moves fast' },
    { id: 'l1c10', user: 'koko', text: 'pinned the acne trucker — grab it before it goes' },
    { id: 'l1c11', user: 'archive.thread', text: 'two minutes on this lot then we move', seller: true },
    { id: 'l1c12', user: 'nia.v', text: 'condition notes on the row trousers?' },
  ],
  'live-2': [
    { id: 'l2c1', user: 'retro.rick', text: 'are the chicagos legit checked?' },
    { id: 'l2c2', user: 'dankdunksuk', text: 'every pair checked twice before it goes up', seller: true },
    { id: 'l2c3', user: 'laceswap', text: 'size run on the 550s?' },
    { id: 'l2c4', user: 'dankdunksuk', text: 'uk 7 to 11, half sizes are gone', seller: true },
    { id: 'l2c5', user: 'olive.j', text: 'just copped the sambas!!' },
    { id: 'l2c6', user: 'grailsngames', text: 'price on the jordan 1s?' },
    { id: 'l2c7', user: 'dankdunksuk', text: '145 on the card — box, no lid', seller: true },
    { id: 'l2c8', user: 'steph.curry30', text: 'stream quality is crispy today' },
    { id: 'l2c9', user: 'marniboy', text: 'do you ship to the eu?' },
    { id: 'l2c10', user: 'dankdunksuk', text: 'uk only on this drop, sorry', seller: true },
    { id: 'l2c11', user: 'laceswap', text: ' essentials hoodie next pls' },
  ],
  'live-6': [
    { id: 'l6c1', user: 'coatcheck', text: 'the camel max mara is the one' },
    { id: 'l6c2', user: 'ellawears', text: 'immaculate lining, dry cleaned last month', seller: true },
    { id: 'l6c3', user: 'petit.pois', text: 'does the toteme run small?' },
    { id: 'l6c4', user: 'ellawears', text: 'true to size, I’m an 8 and it skims', seller: true },
    { id: 'l6c5', user: 'woolandworn', text: 'sold already?? that was fast' },
    { id: 'l6c6', user: 'ellawears', text: 'marant boots went early — more coats coming', seller: true },
  ],
  'live-7': [
    { id: 'l7c1', user: 'birkinornot', text: 'is the chanel authenticated?' },
    { id: 'l7c2', user: 'mariefullery', text: 'card, dust bag and third-party auth on every bag', seller: true },
    { id: 'l7c3', user: 'toteally', text: 'the park tote corners look clean' },
    { id: 'l7c4', user: 'mariefullery', text: 'pristine inside — saddle leather barely broken in', seller: true },
    { id: 'l7c5', user: 'hermes.hour', text: 'carré 90 with box is rare at that price' },
    { id: 'l7c6', user: 'nadia.m', text: 'can we see the celine on?' },
  ],
  'live-8': [
    { id: 'l8c1', user: 'denim.dan', text: 'any fade shots of the harrington?' },
    { id: 'l8c2', user: 'scott_art', text: 'light fading at the collar only — tartan lining intact', seller: true },
    { id: 'l8c3', user: 'workwear.will', text: 'carhartt cargos my size, bagging' },
    { id: 'l8c4', user: 'mia.k', text: 'the ami shirt is a steal at 48' },
    { id: 'l8c5', user: 'scott_art', text: 'pit to pit 20 on the ami — classic fit', seller: true },
  ],
  'live-9': [
    { id: 'l9c1', user: 'chrono.cross', text: 'does the seiko have papers?' },
    { id: 'l9c2', user: 'dankdunksuk', text: 'full kit — box, papers, spare links', seller: true },
    { id: 'l9c3', user: 'wristcheck', text: 'sapphire crystal on a solar chrono, decent' },
    { id: 'l9c4', user: 'dankdunksuk', text: 'scarves and eyewear after this lot', seller: true },
    { id: 'l9c5', user: 'oclock.oclock', text: 'just bagged it — checkout smooth' },
  ],
};

// ============================================================================
// POSTER SLIDES — optional multi-frame extension keyed by poster id
// ============================================================================

export const POSTER_SLIDES: Record<string, string[]> = {
  p1: [
    img('photo-1445205170230-053b83016050', 1200),
    img('photo-1483985988355-763728e1935b', 1200),
  ],
};
