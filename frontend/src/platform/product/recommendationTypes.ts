import type { Listing } from '../../data/mockData';

export type RecommendationSectionKey =
  | 'similar_style'
  | 'same_brand'
  | 'same_size_condition'
  | 'better_price'
  | 'more_from_seller'
  | 'complete_the_look'
  | 'seen_in_looks'
  | 'inspired_by_saves'
  | 'continue_exploring';

export interface RecommendationSection {
  key: RecommendationSectionKey;
  title: string;
  subtitle?: string;
  reason?: string;
  personalised: boolean;
  items: Listing[];
  nextCursor?: string;
}

export interface RecommendationResponse {
  listingId: string;
  sections: RecommendationSection[];
}

export interface RecommendationRequest {
  listingId: string;
  sections?: RecommendationSectionKey[];
  limit?: number;
  cursor?: string;
  sessionId?: string;
}

export const RECOMMENDATION_REASON_CODES: Record<RecommendationSectionKey, string> = {
  similar_style: 'Same category and visual style',
  same_brand: 'Same brand',
  same_size_condition: 'Your size and condition',
  better_price: 'Lower price alternatives',
  more_from_seller: 'From the same seller',
  complete_the_look: 'Complementary categories',
  seen_in_looks: 'Tagged in community Looks',
  inspired_by_saves: 'Based on your saves',
  continue_exploring: 'Recently viewed and trending',
};

export const COMPLEMENTARY_CATEGORY_MAP: Record<string, string[]> = {
  tops: ['bottoms', 'outerwear', 'shoes', 'bags'],
  bottoms: ['tops', 'shoes', 'bags', 'outerwear'],
  dresses: ['shoes', 'bags', 'accessories', 'outerwear'],
  shoes: ['bottoms', 'dresses', 'bags'],
  bags: ['tops', 'bottoms', 'shoes', 'accessories'],
  outerwear: ['tops', 'bottoms', 'shoes', 'bags'],
  accessories: ['tops', 'dresses', 'bags'],
  jewellery: ['dresses', 'tops', 'bags'],
};

export function getComplementaryCategories(category: string | null | undefined): string[] {
  if (!category) return [];
  const normalized = category.toLowerCase().trim();
  return COMPLEMENTARY_CATEGORY_MAP[normalized] ?? [];
}
