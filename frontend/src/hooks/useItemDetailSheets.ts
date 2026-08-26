import { useState, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export type ItemDetailSheetName =
  | 'collection'
  | 'share'
  | 'fullscreen'
  | 'sizeGuide'
  | 'qa'
  | 'purchaseDetails'
  | 'overflow'
  | 'makeOffer'
  | 'conditionInfo';

export interface ItemDetailSheetsState {
  /** The currently open sheet, or null when none are open. */
  activeSheet: ItemDetailSheetName | null;
  /** True when any sheet is open — drives accessibility hiding on the scroll body. */
  anyVisible: boolean;
  /** Per-sheet visibility flags (derived from activeSheet). */
  isVisible: {
    collection: boolean;
    share: boolean;
    fullscreen: boolean;
    sizeGuide: boolean;
    qa: boolean;
    purchaseDetails: boolean;
    overflow: boolean;
    makeOffer: boolean;
    conditionInfo: boolean;
  };
  /** Current fullscreen image index (tracked independently of fullscreen visibility). */
  fullscreenIndex: number;
  /** Inline description disclosure state (not mutually exclusive with sheets). */
  descriptionExpanded: boolean;
  /** Inline price-history disclosure state (not mutually exclusive with sheets). */
  priceHistoryExpanded: boolean;
}

export interface UseItemDetailSheetsReturn {
  sheets: ItemDetailSheetsState;
  open: {
    collection: () => void;
    share: () => void;
    fullscreen: (index?: number) => void;
    sizeGuide: () => void;
    qa: () => void;
    purchaseDetails: () => void;
    overflow: () => void;
    makeOffer: () => void;
    conditionInfo: () => void;
  };
  close: {
    collection: () => void;
    share: () => void;
    fullscreen: () => void;
    sizeGuide: () => void;
    qa: () => void;
    purchaseDetails: () => void;
    overflow: () => void;
    makeOffer: () => void;
    conditionInfo: () => void;
  };
  setFullscreenIndex: Dispatch<SetStateAction<number>>;
  setDescriptionExpanded: Dispatch<SetStateAction<boolean>>;
  setPriceHistoryExpanded: Dispatch<SetStateAction<boolean>>;
}

/**
 * useItemDetailSheets — owns the sheet/visibility state for ItemDetailScreen.
 *
 * Modal sheets (collection, share, fullscreen, sizeGuide, qa,
 * purchaseDetails, overflow, makeOffer, conditionInfo) are mutually
 * exclusive: opening one closes any other. This matches the existing
 * screen behaviour where only one sheet is ever open at a time (each
 * open call site either opens from the main scroll body with no other
 * sheet visible, or explicitly closes the previous sheet before opening
 * the next).
 *
 * Inline disclosure toggles (descriptionExpanded, priceHistoryExpanded)
 * are NOT mutually exclusive with sheets — they are progressive-
 * disclosure expansions that coexist with any sheet state.
 *
 * fullscreenIndex is tracked independently of fullscreen visibility
 * because the media stage updates it via onActiveIndexChange even when
 * the fullscreen viewer is closed.
 */
export function useItemDetailSheets(): UseItemDetailSheetsReturn {
  const [activeSheet, setActiveSheet] = useState<ItemDetailSheetName | null>(null);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [priceHistoryExpanded, setPriceHistoryExpanded] = useState(false);

  const openCollection = useCallback(() => setActiveSheet('collection'), []);
  const openShare = useCallback(() => setActiveSheet('share'), []);
  const openFullscreen = useCallback((index?: number) => {
    if (index !== undefined) setFullscreenIndex(index);
    setActiveSheet('fullscreen');
  }, []);
  const openSizeGuide = useCallback(() => setActiveSheet('sizeGuide'), []);
  const openQa = useCallback(() => setActiveSheet('qa'), []);
  const openPurchaseDetails = useCallback(() => setActiveSheet('purchaseDetails'), []);
  const openOverflow = useCallback(() => setActiveSheet('overflow'), []);
  const openMakeOffer = useCallback(() => setActiveSheet('makeOffer'), []);
  const openConditionInfo = useCallback(() => setActiveSheet('conditionInfo'), []);

  const closeCollection = useCallback(
    () => setActiveSheet((prev) => (prev === 'collection' ? null : prev)),
    [],
  );
  const closeShare = useCallback(
    () => setActiveSheet((prev) => (prev === 'share' ? null : prev)),
    [],
  );
  const closeFullscreen = useCallback(
    () => setActiveSheet((prev) => (prev === 'fullscreen' ? null : prev)),
    [],
  );
  const closeSizeGuide = useCallback(
    () => setActiveSheet((prev) => (prev === 'sizeGuide' ? null : prev)),
    [],
  );
  const closeQa = useCallback(
    () => setActiveSheet((prev) => (prev === 'qa' ? null : prev)),
    [],
  );
  const closePurchaseDetails = useCallback(
    () => setActiveSheet((prev) => (prev === 'purchaseDetails' ? null : prev)),
    [],
  );
  const closeOverflow = useCallback(
    () => setActiveSheet((prev) => (prev === 'overflow' ? null : prev)),
    [],
  );
  const closeMakeOffer = useCallback(
    () => setActiveSheet((prev) => (prev === 'makeOffer' ? null : prev)),
    [],
  );
  const closeConditionInfo = useCallback(
    () => setActiveSheet((prev) => (prev === 'conditionInfo' ? null : prev)),
    [],
  );

  const sheets: ItemDetailSheetsState = {
    activeSheet,
    anyVisible: activeSheet !== null,
    isVisible: {
      collection: activeSheet === 'collection',
      share: activeSheet === 'share',
      fullscreen: activeSheet === 'fullscreen',
      sizeGuide: activeSheet === 'sizeGuide',
      qa: activeSheet === 'qa',
      purchaseDetails: activeSheet === 'purchaseDetails',
      overflow: activeSheet === 'overflow',
      makeOffer: activeSheet === 'makeOffer',
      conditionInfo: activeSheet === 'conditionInfo',
    },
    fullscreenIndex,
    descriptionExpanded,
    priceHistoryExpanded,
  };

  return {
    sheets,
    open: {
      collection: openCollection,
      share: openShare,
      fullscreen: openFullscreen,
      sizeGuide: openSizeGuide,
      qa: openQa,
      purchaseDetails: openPurchaseDetails,
      overflow: openOverflow,
      makeOffer: openMakeOffer,
      conditionInfo: openConditionInfo,
    },
    close: {
      collection: closeCollection,
      share: closeShare,
      fullscreen: closeFullscreen,
      sizeGuide: closeSizeGuide,
      qa: closeQa,
      purchaseDetails: closePurchaseDetails,
      overflow: closeOverflow,
      makeOffer: closeMakeOffer,
      conditionInfo: closeConditionInfo,
    },
    setFullscreenIndex,
    setDescriptionExpanded,
    setPriceHistoryExpanded,
  };
}
