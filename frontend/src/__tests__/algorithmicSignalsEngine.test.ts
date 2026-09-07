import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  deriveDynamicSignals,
  matchesSignal,
  boostAlgorithmicSignal,
  CURATED_BASELINE_SIGNALS,
  normalizeFilterKey,
} from '../services/algorithmicSignalsService';
import * as algorithmApi from '../services/algorithmTransparencyApi';
import type { RecommendationItemVM } from '../domain/recommendation';
import type { TaxonomyNode } from '../contracts/taxonomy';

describe('Algorithmic Signals Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deriveDynamicSignals', () => {
    it('returns curated baseline signals when no personalized profile or recommendation items exist', () => {
      const signals = deriveDynamicSignals({
        profile: null,
        recommendationItems: [],
        taxonomyCategories: [],
      });

      expect(signals.length).toBeGreaterThan(0);
      expect(signals[0].id).toBe('all');
      expect(signals[0].filterKey).toBe('all');
      expect(signals[0].label).toBe('All');

      // Curated fallbacks
      const labels = signals.map((s) => s.label);
      expect(labels).toContain('Denim');
      expect(labels).toContain('Sneakers');
      expect(labels).toContain('Outerwear');
    });

    it('ranks high-weight algorithmic topics ahead of lower-weight and baseline signals', () => {
      const mockProfile = {
        topics: [
          {
            id: 'topic-denim',
            label: 'Vintage denim',
            category: 'Category preference',
            weight: 'high' as const,
            source: 'explicit' as const,
            removable: true,
            addedAt: new Date().toISOString(),
            isDemo: false,
          },
          {
            id: 'topic-brand-acne',
            label: 'Acne Studios',
            category: 'Brand affinity',
            weight: 'high' as const,
            source: 'explicit' as const,
            removable: true,
            addedAt: new Date().toISOString(),
            isDemo: false,
          },
          {
            id: 'topic-minimal',
            label: 'Minimalist style',
            category: 'Style preferences',
            weight: 'low' as const,
            source: 'inferred' as const,
            removable: true,
            addedAt: new Date().toISOString(),
            isDemo: false,
          },
        ],
        signals: [],
        recentInfluences: [],
        lastUpdated: new Date().toISOString(),
        isDemo: false,
      };

      const signals = deriveDynamicSignals({
        profile: mockProfile,
        recommendationItems: [],
      });

      expect(signals[0].filterKey).toBe('all');
      // High-weight topics should be ranked right at the top
      const topKeys = signals.slice(1, 4).map((s) => s.filterKey);
      expect(topKeys).toContain('vintage denim');
      expect(topKeys).toContain('acne studios');

      const denimSignal = signals.find((s) => s.filterKey === 'vintage denim');
      expect(denimSignal?.isPersonalized).toBe(true);
      expect(denimSignal?.weight).toBe('high');
      expect(denimSignal?.score).toBe(95);
    });

    it('extracts and elevates categories and brands from active recommendation items', () => {
      const mockRecommendationItems: RecommendationItemVM[] = [
        {
          listing: {
            id: 'item-1',
            title: 'Japanese Selvedge Denim',
            brand: 'Iron Heart',
            category: 'Denim',
            price: 180,
            likes: 12,
            sellerId: 'seller-1',
            images: ['https://example.com/1.jpg'],
          } as any,
          score: 0.95,
          scoreBand: 'high',
          model: 'champion_v2',
          policy: 'exploit',
          position: 1,
          reasonCodes: ['high_affinity'],
          componentScores: {},
          candidateSources: [],
          selectionPropensity: null,
          explanationToken: null,
        },
        {
          listing: {
            id: 'item-2',
            title: 'Heavy Flannel Overshirt',
            brand: 'Iron Heart',
            category: 'Outerwear',
            price: 220,
            likes: 8,
            sellerId: 'seller-2',
            images: ['https://example.com/2.jpg'],
          } as any,
          score: 0.88,
          scoreBand: 'high',
          model: 'champion_v2',
          policy: 'exploit',
          position: 2,
          reasonCodes: ['brand_affinity'],
          componentScores: {},
          candidateSources: [],
          selectionPropensity: null,
          explanationToken: null,
        },
      ];

      const signals = deriveDynamicSignals({
        profile: null,
        recommendationItems: mockRecommendationItems,
      });

      const ironHeart = signals.find((s) => s.filterKey === 'iron heart');
      expect(ironHeart).toBeDefined();
      expect(ironHeart?.kind).toBe('brand');
      expect(ironHeart?.isPersonalized).toBe(true);
    });

    it('ensures surface="discover" integrates root taxonomy categories', () => {
      const mockTaxonomy: TaxonomyNode[] = [
        { id: 'men', name: 'Men', displayKey: 'men', type: 'category', parentId: null, sortOrder: 1 },
        { id: 'women', name: 'Women', displayKey: 'women', type: 'category', parentId: null, sortOrder: 2 },
        { id: 'jeans', name: 'Jeans', displayKey: 'jeans', type: 'category', parentId: 'men', sortOrder: 1 },
      ];

      const signals = deriveDynamicSignals({
        taxonomyCategories: mockTaxonomy,
        surface: 'discover',
      });

      const keys = signals.map((s) => s.filterKey);
      expect(keys).toContain('men');
      expect(keys).toContain('women');
    });
  });

  describe('matchesSignal', () => {
    it('returns true when filterKey is "all"', () => {
      const item = { title: 'Vintage Leather Jacket', brand: 'Schott', category: 'Outerwear' };
      expect(matchesSignal(item, 'all')).toBe(true);
      expect(matchesSignal(item, { id: 'all', label: 'All', filterKey: 'all', kind: 'all', score: 100, isPersonalized: false })).toBe(true);
    });

    it('matches against item title, brand, category, subcategory, and tags', () => {
      const item = {
        title: '90s Relaxed Fit Trousers',
        brand: 'Our Legacy',
        category: 'Bottoms',
        subcategory: 'Pants',
        tags: ['vintage', 'relaxed', 'minimal'],
      };

      expect(matchesSignal(item, 'our legacy')).toBe(true);
      expect(matchesSignal(item, 'trousers')).toBe(true);
      expect(matchesSignal(item, 'bottoms')).toBe(true);
      expect(matchesSignal(item, 'pants')).toBe(true);
      expect(matchesSignal(item, 'vintage')).toBe(true);
      expect(matchesSignal(item, 'minimal')).toBe(true);
      expect(matchesSignal(item, 'sneakers')).toBe(false);
    });
  });

  describe('boostAlgorithmicSignal', () => {
    it('calls updateTopicWeight with high weight when a non-all signal is selected', async () => {
      const spy = vi.spyOn(algorithmApi, 'updateTopicWeight').mockResolvedValue(null);

      const chip = {
        id: 'topic-denim',
        label: 'Vintage Denim',
        filterKey: 'vintage denim',
        kind: 'style' as const,
        score: 95,
        isPersonalized: true,
        topicId: 'topic-denim',
      };

      await boostAlgorithmicSignal('user-123', chip);

      expect(spy).toHaveBeenCalledWith('topic-denim', 'high');
    });

    it('does not trigger mutation when chip is "all" or user is null', async () => {
      const spy = vi.spyOn(algorithmApi, 'updateTopicWeight').mockResolvedValue(null);

      const allChip = {
        id: 'all',
        label: 'All',
        filterKey: 'all',
        kind: 'all' as const,
        score: 100,
        isPersonalized: false,
      };

      await boostAlgorithmicSignal('user-123', allChip);
      expect(spy).not.toHaveBeenCalled();

      await boostAlgorithmicSignal(null, { ...allChip, filterKey: 'denim' });
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
