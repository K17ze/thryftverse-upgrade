import { useCallback, useMemo, useState } from 'react';
import type { FilterPreset } from '../../preferences/settingsPreferences';
import type { ConditionOption, SortOption } from '../../components/filters/filterTypes';

/** Structural mirror of the store's BrowseFilterState — the hook only reads
 *  it once to seed the draft selection. */
interface BrowseFiltersSnapshot {
  sort: SortOption;
  brands: string[];
  sizes: string[];
  condition: ConditionOption;
  sustainableOnly: boolean;
  priceMin: number | null;
  priceMax: number | null;
}

// Draft filter selection for the sheet: seeded from the persisted
// browseFilters, edited locally, and committed only via Apply. Also owns the
// collapsible-section expansion state and the derived active-selection
// counts consumed by the header badge and footer.
export function useFilterScreenState(browseFilters: BrowseFiltersSnapshot) {
  const [activeSort, setActiveSort] = useState<SortOption>(browseFilters.sort);
  const [selectedBrands, setSelectedBrands] = useState<string[]>(browseFilters.brands);
  const [selectedSizes, setSelectedSizes] = useState<string[]>(browseFilters.sizes);
  const [selectedCondition, setSelectedCondition] = useState<ConditionOption>(browseFilters.condition);
  const [sustainableOnly, setSustainableOnly] = useState<boolean>(browseFilters.sustainableOnly);
  const [priceMin, setPriceMin] = useState<string>(browseFilters.priceMin != null ? String(browseFilters.priceMin) : '');
  const [priceMax, setPriceMax] = useState<string>(browseFilters.priceMax != null ? String(browseFilters.priceMax) : '');

  // Collapsible section state — progressive disclosure per 2026 mobile filter UX
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['sort', 'price']));
  const toggleSection = useCallback((section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }, []);

  const toggleBrand = useCallback((b: string) => {
    setSelectedBrands(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]);
  }, []);

  const toggleSize = useCallback((s: string) => {
    setSelectedSizes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }, []);

  const toggleSustainableOnly = useCallback(() => {
    setSustainableOnly((prev) => !prev);
  }, []);

  const handleClear = useCallback(() => {
    setActiveSort('Recommended');
    setSelectedBrands([]);
    setSelectedSizes([]);
    setSelectedCondition('Any');
    setSustainableOnly(false);
    setPriceMin('');
    setPriceMax('');
  }, []);

  // Applies a saved preset's sort/brand/size/condition values to the draft.
  const applyPresetSelection = useCallback((preset: FilterPreset) => {
    setActiveSort(preset.sort as SortOption);
    setSelectedBrands(preset.brands);
    setSelectedSizes(preset.sizes);
    setSelectedCondition(preset.condition as ConditionOption);
  }, []);

  // Snapshot of the fields a preset persists — passed to FilterPresets.
  const presetSelection = useMemo(() => ({
    sort: activeSort,
    brands: selectedBrands,
    sizes: selectedSizes,
    condition: selectedCondition }),
  [activeSort, selectedBrands, selectedSizes, selectedCondition]);

  const hasActiveSelection =
    selectedBrands.length > 0 || selectedSizes.length > 0 || selectedCondition !== 'Any' || activeSort !== 'Recommended' || sustainableOnly || priceMin.trim() !== '' || priceMax.trim() !== '';

  const activeFilterCount =
    selectedBrands.length
    + selectedSizes.length
    + (selectedCondition !== 'Any' ? 1 : 0)
    + (activeSort !== 'Recommended' ? 1 : 0)
    + (sustainableOnly ? 1 : 0)
    + (priceMin.trim() !== '' ? 1 : 0)
    + (priceMax.trim() !== '' ? 1 : 0);

  return {
    activeSort,
    setActiveSort,
    selectedBrands,
    toggleBrand,
    selectedSizes,
    toggleSize,
    selectedCondition,
    setSelectedCondition,
    sustainableOnly,
    toggleSustainableOnly,
    priceMin,
    setPriceMin,
    priceMax,
    setPriceMax,
    expandedSections,
    toggleSection,
    handleClear,
    applyPresetSelection,
    presetSelection,
    hasActiveSelection,
    activeFilterCount,
  };
}
