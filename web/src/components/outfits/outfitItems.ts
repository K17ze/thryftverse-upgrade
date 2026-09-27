/**
 * Outfit domain helpers — slot presentation + garment→slot inference.
 * Port of frontend/src/services/styleGraph.ts slot logic, retargeted at the
 * web Listing contract: web `category` is a department (women/men/sneakers/
 * bags/accessories) and `subcategory` carries the garment type, so matching
 * runs subcategory → category, keyword-first like the mobile SLOT_BY_CATEGORY
 * map.
 */

import type { Listing } from '@/lib/contracts/domain';
import { listingById } from '@/lib/data/fixtures';
import { getListingCoverUri } from '@/lib/utils/media';
import {
  OUTFIT_SLOTS,
  MIN_OUTFIT_ITEMS,
  type OutfitItems,
  type OutfitSlot,
  type SavedOutfit,
} from '@/lib/store/outfits';

export const SLOT_LABEL: Record<OutfitSlot, string> = {
  top: 'Top',
  bottom: 'Bottom',
  shoes: 'Shoes',
  outerwear: 'Outerwear',
  accessory: 'Accessory',
};

export const SLOT_PLURAL: Record<OutfitSlot, string> = {
  top: 'Tops',
  bottom: 'Bottoms',
  shoes: 'Shoes',
  outerwear: 'Outerwear',
  accessory: 'Accessories',
};

/**
 * Keyword rules evaluated in order — order matters where keywords overlap:
 * shoes before top ('High tops'), outerwear before bottom ('Denim jackets'),
 * bottom before top, top before accessory (garment beats accessory).
 */
const SLOT_RULES: { slot: OutfitSlot; match: RegExp }[] = [
  {
    slot: 'shoes',
    match:
      /sneaker|trainer|shoe|boot|loafer|heel|sandal|mule|brogue|derby|oxford|footwear|(?:high|low|mid)[\s-]?top|slip[\s-]?on/,
  },
  {
    slot: 'outerwear',
    match:
      /jacket|coat|blazer|parka|trench|gilet|bomber|puffer|anorak|windbreaker|raincoat|harrington|overshirt|overcoat|denim\s*jacket|leather\s*jacket/,
  },
  {
    slot: 'bottom',
    match: /jean|trouser|pant|short|skirt|chino|cargo|legging|bottom/,
  },
  {
    slot: 'top',
    match:
      /t[\s-]?shirt|tee|shirt|top|blouse|polo|knit|sweater|jumper|hoodie|sweat|cardigan|camisole|tank|vest|dress|gown|bodysuit/,
  },
  {
    slot: 'accessory',
    match:
      /bag|tote|clutch|backpack|purse|watch|belt|hat|cap|beanie|scarf|sunglass|glasses|jewel|necklace|earring|bracelet|ring|tie|wallet|accessor/,
  },
];

/** Non-apparel departments — used for the fallback when nothing matched. */
const ACCESSORY_DEPARTMENTS = new Set(['bags', 'accessories', 'jewellery', 'jewelry', 'watches']);
const FOOTWEAR_DEPARTMENTS = new Set(['sneakers', 'shoes', 'footwear']);

/**
 * Infer the canvas slot for a listing — mirrors mobile inferSlot:
 * subcategory first, then category, then a heuristic fallback.
 */
export function inferListingSlot(
  listing: Pick<Listing, 'category' | 'subcategory'>,
): OutfitSlot {
  const sub = (listing.subcategory ?? '').toLowerCase();
  if (sub) {
    for (const { slot, match } of SLOT_RULES) {
      if (match.test(sub)) return slot;
    }
  }
  const cat = (listing.category ?? '').toLowerCase();
  for (const { slot, match } of SLOT_RULES) {
    if (match.test(cat)) return slot;
  }
  if (FOOTWEAR_DEPARTMENTS.has(cat)) return 'shoes';
  if (ACCESSORY_DEPARTMENTS.has(cat)) return 'accessory';
  // Apparel departments with an unmapped garment type read as a top —
  // the lead canvas slot (mobile defaults to accessory, but mobile's
  // category field is already a garment type, not a department).
  return 'top';
}

/** Resolve a saved outfit's slot→id map into slot→Listing, dropping dead ids. */
export function outfitListings(
  outfit: SavedOutfit,
): Partial<Record<OutfitSlot, Listing>> {
  const out: Partial<Record<OutfitSlot, Listing>> = {};
  for (const slot of OUTFIT_SLOTS) {
    const id = outfit.items[slot];
    if (!id) continue;
    const listing = listingById(id);
    if (listing) out[slot] = listing;
  }
  return out;
}

/** Slot-ordered items actually present — for counts, lists, collages. */
export function outfitItemsList(
  items: Partial<Record<OutfitSlot, Listing | undefined>>,
): Listing[] {
  return OUTFIT_SLOTS.map((s) => items[s]).filter(
    (l): l is Listing => Boolean(l),
  );
}

/** Up to `n` cover images for an outfit collage. */
export function outfitThumbs(
  items: Partial<Record<OutfitSlot, Listing | undefined>>,
  n = 4,
): string[] {
  return outfitItemsList(items)
    .map((l) => getListingCoverUri(l.images))
    .filter(Boolean)
    .slice(0, n);
}

/** CTA label — verbatim port of mobile saveCtaTitle. */
export function saveCtaLabel(filledCount: number): string {
  return filledCount >= MIN_OUTFIT_ITEMS
    ? 'Save outfit'
    : `Select ${MIN_OUTFIT_ITEMS - filledCount} more item${filledCount === MIN_OUTFIT_ITEMS - 1 ? '' : 's'}`;
}

/** Convert a working builder map (slot→Listing) into persistable ids. */
export function toOutfitItems(
  items: Partial<Record<OutfitSlot, Listing | undefined>>,
): OutfitItems {
  const out: OutfitItems = {};
  for (const slot of OUTFIT_SLOTS) {
    const listing = items[slot];
    if (listing) out[slot] = listing.id;
  }
  return out;
}
