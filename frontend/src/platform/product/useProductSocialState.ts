/**
 * PRODUCT-01 — Shared social state for the unified product-detail shell.
 *
 * Gives all three listing families one consistent source of truth for
 * like/wishlist, save-to-collection and share, with optimistic update +
 * rollback semantics. Auction watchlist is intentionally NOT handled here —
 * it remains an auction-specific action because it controls participation /
 * notifications, not social saving.
 *
 * The wishlist is now backed by React Query (see `useWishlist.ts`) with
 * optimistic mutation + rollback. The Zustand wishlist state is kept in
 * sync as a mirror so legacy consumers continue to work during migration.
 */
import { useCallback, useState } from 'react';
import { useStore } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import { useHaptic } from '../../hooks/useHaptic';
import { useIsWishlisted, useToggleWishlist } from '../../hooks/useWishlist';
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
  const isItemSavedAnywhere = useStore((s) => s.isItemSavedAnywhere);
  const { show } = useToast();
  const haptic = useHaptic();

  const objectId = vm?.objectId ?? '';
  const isLiked = useIsWishlisted(objectId);
  const toggleWishlistMutation = useToggleWishlist(objectId);

  const [collectionModalVisible, setCollectionModalVisible] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);

  const isSavedToCollection = vm ? isItemSavedAnywhere(objectId) : false;

  const toggleLike = useCallback(() => {
    if (!vm || !objectId) return;
    const wasLiked = isLiked;
    toggleWishlistMutation.mutate(undefined, {
      onSuccess: () => {
        options?.onLikeAnalytics?.();
      },
      onError: () => {
        haptic.error();
        show('Could not update wishlist. Please try again.', 'error');
      },
    });
    haptic.medium();
    show(wasLiked ? 'Removed from wishlist' : 'Added to wishlist', 'success');
  }, [vm, objectId, isLiked, toggleWishlistMutation, haptic, show, options]);

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
