import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  inferSlot,
  scoreOutfit,
  suggestCompletion,
  type CompatibilityResult,
  type OutfitSlot,
  type StyleItem } from '../../services/styleGraph';
import { haptics } from '../../utils/haptics';
import {
  emptyOutfitItems,
  filledSlotCount,
  type CompletionSuggestion,
  type OutfitItemsMap } from '../../components/outfitbuilder/outfitBuilderViewModels';

// A snapshot captures the outfit items + background color. We keep a
// pointer into the history array; undo moves the pointer back, redo
// moves it forward. New changes truncate any redo tail.
type OutfitSnapshot = {
  items: OutfitItemsMap;
  bg: string | undefined;
};

export interface UseOutfitBuilderSelectionResult {
  activeSlot: OutfitSlot;
  setActiveSlot: Dispatch<SetStateAction<OutfitSlot>>;
  outfitItems: OutfitItemsMap;
  backgroundColor: string | undefined;
  /** Select a background — records an undo snapshot (bg is part of history). */
  setBackgroundColor: (bg: string | undefined) => void;
  canUndo: boolean;
  canRedo: boolean;
  handleUndo: () => void;
  handleRedo: () => void;
  /** Toggle an item in/out of its inferred slot. */
  toggleItem: (item: StyleItem) => void;
  /** Items in the currently active slot (filtered from availableItems). */
  slotItems: StyleItem[];
  compatibility: CompatibilityResult;
  aiSuggestion: CompletionSuggestion | null;
  filledCount: number;
  /** Apply the heuristic completion suggestion (item + active slot). */
  handleAiSuggest: () => void;
  /** Remove all selected items + background, recording history. */
  clearSelection: () => void;
}

/**
 * Owns the builder's selection domain: active slot, per-slot item map,
 * background colour, the undo/redo snapshot history, and the derived
 * compatibility score + completion suggestion.
 */
export function useOutfitBuilderSelection(
  availableItems: StyleItem[],
): UseOutfitBuilderSelectionResult {
  const [activeSlot, setActiveSlot] = useState<OutfitSlot>('top');
  const [outfitItems, setOutfitItems] = useState<OutfitItemsMap>(emptyOutfitItems());
  const [backgroundColor, setBackgroundColor] = useState<string | undefined>(undefined);

  // ── Undo / Redo history ──
  const historyRef = useRef<OutfitSnapshot[]>([
    { items: emptyOutfitItems(), bg: undefined },
  ]);
  const historyIndexRef = useRef(0);
  // Force re-render when history pointers change (refs don't trigger renders).
  const [, setHistoryTick] = useState(0);
  const bumpHistory = useCallback(() => setHistoryTick((t) => t + 1), []);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const pushHistory = useCallback(
    (items: OutfitItemsMap, bg: string | undefined) => {
      const snapshot: OutfitSnapshot = {
        items: { ...items },
        bg };
      // Truncate any redo tail before pushing.
      historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
      historyRef.current.push(snapshot);
      historyIndexRef.current = historyRef.current.length - 1;
      bumpHistory();
    },
    [bumpHistory],
  );

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const snapshot = historyRef.current[historyIndexRef.current];
    setOutfitItems(snapshot.items);
    setBackgroundColor(snapshot.bg);
    haptics.tap();
    bumpHistory();
  }, [bumpHistory]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const snapshot = historyRef.current[historyIndexRef.current];
    setOutfitItems(snapshot.items);
    setBackgroundColor(snapshot.bg);
    haptics.tap();
    bumpHistory();
  }, [bumpHistory]);

  const slotItems = useMemo(() => {
    return availableItems.filter((it) => inferSlot(it) === activeSlot);
  }, [availableItems, activeSlot]);

  const compatibility = useMemo(() => scoreOutfit(outfitItems), [outfitItems]);

  const aiSuggestion = useMemo(() => {
    return suggestCompletion(outfitItems, availableItems);
  }, [outfitItems, availableItems]);

  const filledCount = filledSlotCount(outfitItems);

  const toggleItem = useCallback((item: StyleItem) => {
    const slot = inferSlot(item);
    setOutfitItems((prev) => {
      const current = prev[slot];
      const next = current?.id === item.id
        ? { ...prev, [slot]: undefined }
        : { ...prev, [slot]: item };
      pushHistory(next, backgroundColor);
      return next;
    });
    haptics.press();
  }, [backgroundColor, pushHistory]);

  const handleAiSuggest = useCallback(() => {
    if (!aiSuggestion) return;
    setOutfitItems((prev) => {
      const next = { ...prev, [aiSuggestion.slot]: aiSuggestion.item };
      pushHistory(next, backgroundColor);
      return next;
    });
    setActiveSlot(aiSuggestion.slot);
    haptics.success();
  }, [aiSuggestion, backgroundColor, pushHistory]);

  const clearSelection = useCallback(() => {
    const cleared = emptyOutfitItems();
    setOutfitItems(cleared);
    setBackgroundColor(undefined);
    pushHistory(cleared, undefined);
    haptics.error();
  }, [pushHistory]);

  // Snapshots capture `bg`, so a background change must record history —
  // otherwise undo silently reverts a later background-only change.
  const selectBackgroundColor = useCallback(
    (bg: string | undefined) => {
      setBackgroundColor(bg);
      pushHistory(outfitItems, bg);
    },
    [outfitItems, pushHistory],
  );

  return {
    activeSlot,
    setActiveSlot,
    outfitItems,
    backgroundColor,
    setBackgroundColor: selectBackgroundColor,
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
    toggleItem,
    slotItems,
    compatibility,
    aiSuggestion,
    filledCount,
    handleAiSuggest,
    clearSelection };
}
