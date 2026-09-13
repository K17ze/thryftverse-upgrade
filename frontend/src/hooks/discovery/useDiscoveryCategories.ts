import { useCallback, useMemo, useState } from 'react';

import { useDynamicAlgorithmSignals } from '../useDynamicAlgorithmSignals';
import type { DynamicSignalChip } from '../../services/algorithmicSignalsService';
import { getAlgorithmDemoMode } from '../../services/algorithmTransparencyApi';

// ── Category pills ──
export type CategoryPill = string;

/**
 * Owns the category pill rail state: the pill list is 'All' + 'New' +
 * dynamic intent signals, filtered for truthfulness when the algorithm
 * service is in demo mode, and selection boosts the chosen signal back into
 * the personalisation loop.
 */
export function useDiscoveryCategories() {
  const [activeCategory, setActiveCategory] = useState<CategoryPill>('All');
  const { signals: dynamicCategorySignals, selectSignal: boostCategorySignal } = useDynamicAlgorithmSignals({ surface: 'discovery' });

  const categoryPills = useMemo<DynamicSignalChip[]>(() => {
    // Truthful UI (AGENTS.md §11): when the intent profile could not be
    // fetched and the service fell back to illustrative topics, profile-
    // derived chips would fabricate personalization. Profile-derived chips
    // carry a `topicId`; chips derived from real local signals (recommendation
    // items, wishlist brands, recent searches) do not and stay visible.
    const algorithmIsDemo = getAlgorithmDemoMode();
    return [
      { id: 'all', label: 'All', filterKey: 'all', kind: 'all', score: 100, isPersonalized: false },
      { id: 'new', label: 'New', filterKey: 'new', kind: 'curated', score: 98, isPersonalized: false },
      ...dynamicCategorySignals.filter(
        (s) => s.filterKey !== 'all' && !(algorithmIsDemo && s.topicId != null),
      ),
    ];
  }, [dynamicCategorySignals]);

  const activeSignalChip = useMemo(() => {
    return (
      categoryPills.find(
        (p) => p.filterKey === activeCategory.toLowerCase() || p.label.toLowerCase() === activeCategory.toLowerCase(),
      ) || categoryPills[0]
    );
  }, [categoryPills, activeCategory]);

  const handleCategoryChange = useCallback(
    (pill: string) => {
      setActiveCategory(pill);
      const chip = categoryPills.find(
        (p) => p.label === pill || p.filterKey === pill.toLowerCase(),
      );
      if (chip) {
        boostCategorySignal(chip);
      }
    },
    [categoryPills, boostCategorySignal],
  );

  return {
    activeCategory,
    categoryPills,
    activeSignalChip,
    handleCategoryChange,
  };
}
