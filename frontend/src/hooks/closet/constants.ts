import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import type { ClosetTabKey } from '../../domain/closet';

/** Tab render order — Saved, Wishlist, Closets, Outfits. */
export const CLOSET_TABS: ClosetTabKey[] = [
  'SAVED',
  'WISHLIST',
  'COLLECTIONS',
  'OUTFITS',
];

/** Icon shown in the header count pill for the active tab. */
export const CLOSET_TAB_ICONS: Record<
  ClosetTabKey,
  ComponentProps<typeof Ionicons>['name']
> = {
  SAVED: 'bookmark-outline',
  WISHLIST: 'heart-outline',
  COLLECTIONS: 'folder-open-outline',
  OUTFITS: 'shirt-outline',
};
