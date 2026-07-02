/**
 * PRODUCT-01 — Shared social state for the unified product-detail shell.
 *
 * Gives all three listing families one consistent source of truth for
 * like/wishlist, save-to-collection and share, with optimistic update +
 * rollback semantics. Auction watchlist is intentionally NOT handled here —
 * it remains an auction-specific action because it controls participation /
 * notifications, not social saving.
 */
import { useCallback, useState } from 'react';
import { useStore } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import { useHaptic } from '../../hooks/useHaptic';
import type { ProductDetailViewModel } from './productDetailViewModel';

export interface ProductSocialState {
  isLiked: boolean;
  isSavedToCollection: boolean;
  collectionModalVisible: boolean;
  shareVisible: boolean;
  openCollectionPicker: () => void;
  closeCollectionPicker: () => void;
  toggleLike: () => void;
  openShare: () => void;
  closeShare: () => void;
}

/**
 * Wires like/save/share for any product detail view model. The `objectId` is
 * the canonical id used for wishlist + collection membership (the listing id
 * for direct, the auction id for auction, the asset id for co-own) so that
 * state persists per object across the app.
 */
export function useProductSocialState(
  vm: ProductDetailViewModel | null,
  options?: {
    onLikeAnalytics?: () => void;
    onShareAnalytics?: () => void;
  }
): ProductSocialState {
  const isWishlisted = useStore((s) => s.isWishlisted);
  const toggleWishlist = useStore((s) => s.toggleWishlist);
  const isItemSavedAnywhere = useStore((s) => s.isItemSavedAnywhere);
  const { show } = useToast();
  const haptic = useHaptic();

  const [collectionModalVisible, setCollectionModalVisible] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);

  const objectId = vm?.objectId ?? '';
  const isLiked = vm ? isWishlisted(objectId) : false;
  const isSavedToCollection = vm ? isItemSavedAnywhere(objectId) : false;

  const toggleLike = useCallback(() => {
    if (!vm || !objectId) return;
    const wasLiked = isWishlisted(objectId);
    // Optimistic update via store; store is the source of truth so rollback
    // is simply re-toggling on failure — here the store action is synchronous
    // and local-persisted, so no network failure path exists for wishlist.
    toggleWishlist(objectId);
    haptic.medium();
    options?.onLikeAnalytics?.();
    show(wasLiked ? 'Removed from wishlist' : 'Added to wishlist', 'success');
  }, [vm, objectId, isWishlisted, toggleWishlist, haptic, show, options]);

  const openCollectionPicker = useCallback(() => {
    if (!vm || !objectId) return;
    haptic.light();
    setCollectionModalVisible(true);
  }, [vm, objectId, haptic]);

  const closeCollectionPicker = useCallback(() => {
    setCollectionModalVisible(false);
  }, []);

  const openShare = useCallback(() => {
    if (!vm) return;
    setShareVisible(true);
    options?.onShareAnalytics?.();
  }, [vm, options]);

  const closeShare = useCallback(() => {
    setShareVisible(false);
  }, []);

  return {
    isLiked,
    isSavedToCollection,
    collectionModalVisible,
    shareVisible,
    openCollectionPicker,
    closeCollectionPicker,
    toggleLike,
    openShare,
    closeShare,
  };
}
