import { useMemo } from 'react';
import { ListingMediaDraftItem } from '../utils/mediaUploadAsset';

/**
 * Suggested fields for listing autofill.
 * All fields are optional — only fields with confident matches are populated.
 */
export interface ListingAutofillSuggestion {
  title: string | null;
  brand: string | null;
  category: string | null;
  condition: string | null;
  /** Whether any suggestions were found */
  hasSuggestions: boolean;
}

// Curated brand → category mapping (top brands on resale platforms)
const BRAND_CATEGORY_MAP: Record<string, string> = {
  nike: 'Sportswear',
  adidas: 'Sportswear',
  puma: 'Sportswear',
  reebok: 'Sportswear',
  new_balance: 'Sportswear',
  asics: 'Sportswear',
  gucci: 'Luxury',
  prada: 'Luxury',
  louis_vuitton: 'Luxury',
  burberry: 'Luxury',
  balenciaga: 'Luxury',
  givenchy: 'Luxury',
  valentino: 'Luxury',
  saint_laurent: 'Luxury',
  zara: 'Women',
  h_m: 'Women',
  uniqlo: 'Women',
  mango: 'Women',
  asos: 'Women',
  topshop: 'Women',
  levi: 'Men',
  wrangler: 'Men',
  carhartt: 'Men',
  patagonia: 'Men',
  north_face: 'Men',
  supreme: 'Men',
  stussy: 'Men',
  palace: 'Men',
};

// Brands with common filename aliases
const BRAND_ALIASES: Record<string, string> = {
  nb: 'New Balance',
  lv: 'Louis Vuitton',
  ysl: 'Saint Laurent',
  tnf: 'North Face',
};

const KNOWN_BRANDS = [
  'Nike', 'Adidas', 'Zara', 'H&M', 'Gucci', 'Prada', 'Uniqlo',
  "Levi's", 'ASOS', 'Puma', 'Reebok', 'New Balance', 'Asics',
  'Louis Vuitton', 'Burberry', 'Balenciaga', 'Givenchy', 'Valentino',
  'Saint Laurent', 'Carhartt', 'Patagonia', 'North Face', 'Supreme',
  'Stussy', 'Palace', 'Mango', 'Topshop', 'Wrangler',
];

// Category keywords that might appear in filenames
const CATEGORY_KEYWORDS: Record<string, string> = {
  dress: 'Women',
  skirt: 'Women',
  blouse: 'Women',
  heel: 'Women',
  handbag: 'Women',
  purse: 'Women',
  sneaker: 'Sportswear',
  trainer: 'Sportswear',
  boot: 'Sportswear',
  jersey: 'Sportswear',
  hoodie: 'Men',
  jacket: 'Men',
  jeans: 'Men',
  denim: 'Men',
  tee: 'Men',
  shirt: 'Men',
  watch: 'Accessories',
  bag: 'Accessories',
  belt: 'Accessories',
  hat: 'Accessories',
  cap: 'Accessories',
  sunglasses: 'Accessories',
  vintage: 'Vintage',
  retro: 'Vintage',
};

/**
 * Extracts a brand name from a filename by matching against known brands.
 * Filenames like "IMG_Nike_AirMax.jpg" or "nike-sneaker-blue.png" will match "Nike".
 */
function extractBrandFromFilename(filename: string): string | null {
  const lower = filename.toLowerCase();

  // Check aliases first (e.g. "nb" → "New Balance")
  for (const [alias, fullName] of Object.entries(BRAND_ALIASES)) {
    if (lower.includes(alias)) {
      return fullName;
    }
  }

  // Check known brands
  for (const brand of KNOWN_BRANDS) {
    const normalized = brand.toLowerCase().replace(/[^a-z]/g, '');
    if (lower.includes(normalized)) {
      return brand;
    }
  }

  return null;
}

/**
 * Extracts a category from a filename by matching against category keywords.
 */
function extractCategoryFromFilename(filename: string): string | null {
  const lower = filename.toLowerCase();

  for (const [keyword, category] of Object.entries(CATEGORY_KEYWORDS)) {
    if (lower.includes(keyword)) {
      return category;
    }
  }

  return null;
}

/**
 * Builds a suggested title from brand + category hints.
 */
function buildSuggestedTitle(brand: string | null, category: string | null): string | null {
  if (!brand && !category) return null;
  if (brand && category) return `${brand} ${category.toLowerCase()} item`;
  if (brand) return `${brand} item`;
  return `${category} item`;
}

/**
 * Hook that generates listing autofill suggestions from the first photo's filename.
 *
 * This is a client-side heuristic — it extracts hints from the photo filename
 * (e.g. "IMG_Nike_sneaker.jpg" → brand: Nike, category: Sportswear) and uses
 * a curated brand→category mapping. It does NOT perform image recognition.
 */
export function useListingAutofill(
  mediaDraftItems: ListingMediaDraftItem[]
): ListingAutofillSuggestion {
  return useMemo(() => {
    const firstItem = mediaDraftItems[0];
    if (!firstItem) {
      return { title: null, brand: null, category: null, condition: null, hasSuggestions: false };
    }

    // Extract filename from URI (handles both local and remote URIs)
    const uri = firstItem.uri || firstItem.publicUrl || '';
    const filename = uri.split('/').pop() || uri.split('\\').pop() || '';

    const brand = extractBrandFromFilename(filename);
    const categoryFromFilename = extractCategoryFromFilename(filename);
    const categoryFromBrand = brand
      ? BRAND_CATEGORY_MAP[brand.toLowerCase().replace(/[^a-z]/g, '')]
      : null;
    const category = categoryFromFilename ?? categoryFromBrand ?? null;
    const title = buildSuggestedTitle(brand, category);

    const hasSuggestions = !!(brand || category || title);

    return {
      title,
      brand,
      category,
      condition: null, // Condition can't be inferred from filename
      hasSuggestions,
    };
  }, [mediaDraftItems]);
}
