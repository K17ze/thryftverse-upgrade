import { useMemo, useState } from 'react';

export interface ItemDetailOverlayVisibility {
  collection: boolean;
  sizeGuide: boolean;
  qa: boolean;
  purchaseDetails: boolean;
  overflow: boolean;
  makeOffer: boolean;
  conditionInfo: boolean;
}

export type ItemDetailOverlayName = keyof ItemDetailOverlayVisibility;

export interface ItemDetailOverlayControls {
  collection: () => void;
  sizeGuide: () => void;
  qa: () => void;
  purchaseDetails: () => void;
  overflow: () => void;
  makeOffer: () => void;
  conditionInfo: () => void;
}

export interface ItemDetailOverlaysResult {
  /** Per-overlay visibility flags (drives each sheet's `visible` prop and
   * the `anyOverlayVisible` accessibility aggregate). */
  visibility: ItemDetailOverlayVisibility;
  /** Open an overlay. */
  open: ItemDetailOverlayControls;
  /** Dismiss an overlay. */
  dismiss: ItemDetailOverlayControls;
}

/**
 * Owns the seven screen-owned overlay flags for the item detail screen:
 * save-to-collection modal, size guide, Q&A, purchase details, overflow,
 * make offer and condition info. (The share sheet flag is owned by
 * useItemDetailActions and the fullscreen viewer by useItemDetailMedia —
 * the screen aggregates all nine for the accessibility-hidden container.)
 *
 * The flags are independent booleans — deliberately NOT mutually
 * exclusive — matching the original screen state semantics exactly.
 */
export function useItemDetailOverlays(): ItemDetailOverlaysResult {
  const [collectionModalVisible, setCollectionModalVisible] = useState(false);
  const [sizeGuideVisible, setSizeGuideVisible] = useState(false);
  const [qaSheetVisible, setQaSheetVisible] = useState(false);
  const [purchaseDetailsVisible, setPurchaseDetailsVisible] = useState(false);
  const [overflowVisible, setOverflowVisible] = useState(false);
  const [makeOfferVisible, setMakeOfferVisible] = useState(false);
  const [conditionInfoVisible, setConditionInfoVisible] = useState(false);

  const open = useMemo<ItemDetailOverlayControls>(() => ({
    collection: () => setCollectionModalVisible(true),
    sizeGuide: () => setSizeGuideVisible(true),
    qa: () => setQaSheetVisible(true),
    purchaseDetails: () => setPurchaseDetailsVisible(true),
    overflow: () => setOverflowVisible(true),
    makeOffer: () => setMakeOfferVisible(true),
    conditionInfo: () => setConditionInfoVisible(true),
  }), []);

  const dismiss = useMemo<ItemDetailOverlayControls>(() => ({
    collection: () => setCollectionModalVisible(false),
    sizeGuide: () => setSizeGuideVisible(false),
    qa: () => setQaSheetVisible(false),
    purchaseDetails: () => setPurchaseDetailsVisible(false),
    overflow: () => setOverflowVisible(false),
    makeOffer: () => setMakeOfferVisible(false),
    conditionInfo: () => setConditionInfoVisible(false),
  }), []);

  const visibility: ItemDetailOverlayVisibility = {
    collection: collectionModalVisible,
    sizeGuide: sizeGuideVisible,
    qa: qaSheetVisible,
    purchaseDetails: purchaseDetailsVisible,
    overflow: overflowVisible,
    makeOffer: makeOfferVisible,
    conditionInfo: conditionInfoVisible,
  };

  return { visibility, open, dismiss };
}
