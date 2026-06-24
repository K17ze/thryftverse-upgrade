import { describe, it, expect } from 'vitest';
import {
  RECOMMENDATION_REASON_CODES,
  COMPLEMENTARY_CATEGORY_MAP,
  getComplementaryCategories,
  type RecommendationSectionKey,
} from '../platform/product/recommendationTypes';

describe('recommendationTypes', () => {
  describe('RECOMMENDATION_REASON_CODES', () => {
    it('has reason codes for all section keys', () => {
      const keys: RecommendationSectionKey[] = [
        'similar_style',
        'same_brand',
        'same_size_condition',
        'better_price',
        'more_from_seller',
        'complete_the_look',
        'seen_in_looks',
        'inspired_by_saves',
        'continue_exploring',
      ];
      for (const key of keys) {
        expect(RECOMMENDATION_REASON_CODES[key]).toBeDefined();
        expect(typeof RECOMMENDATION_REASON_CODES[key]).toBe('string');
        expect(RECOMMENDATION_REASON_CODES[key].length).toBeGreaterThan(0);
      }
    });
  });

  describe('COMPLEMENTARY_CATEGORY_MAP', () => {
    it('has entries for common categories', () => {
      expect(COMPLEMENTARY_CATEGORY_MAP.tops).toBeDefined();
      expect(COMPLEMENTARY_CATEGORY_MAP.bottoms).toBeDefined();
      expect(COMPLEMENTARY_CATEGORY_MAP.dresses).toBeDefined();
      expect(COMPLEMENTARY_CATEGORY_MAP.shoes).toBeDefined();
      expect(COMPLEMENTARY_CATEGORY_MAP.bags).toBeDefined();
    });

    it('tops complement bottoms', () => {
      expect(COMPLEMENTARY_CATEGORY_MAP.tops).toContain('bottoms');
    });

    it('shoes complement dresses', () => {
      expect(COMPLEMENTARY_CATEGORY_MAP.shoes).toContain('dresses');
    });
  });

  describe('getComplementaryCategories', () => {
    it('returns complementary categories for valid category', () => {
      const result = getComplementaryCategories('tops');
      expect(result).toContain('bottoms');
      expect(result).toContain('shoes');
    });

    it('handles case-insensitive input', () => {
      const result = getComplementaryCategories('TOPS');
      expect(result).toContain('bottoms');
    });

    it('handles whitespace', () => {
      const result = getComplementaryCategories('  tops  ');
      expect(result).toContain('bottoms');
    });

    it('returns empty array for null', () => {
      expect(getComplementaryCategories(null)).toEqual([]);
    });

    it('returns empty array for undefined', () => {
      expect(getComplementaryCategories(undefined)).toEqual([]);
    });

    it('returns empty array for unknown category', () => {
      expect(getComplementaryCategories('unknown_category')).toEqual([]);
    });
  });
});
