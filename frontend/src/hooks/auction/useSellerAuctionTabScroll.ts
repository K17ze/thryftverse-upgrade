import { useCallback, useEffect, useRef } from 'react';
import type { ScrollView } from 'react-native';
import type { FlashListRef } from '@shopify/flash-list';
import type { FlatListItem, SellerTab } from '../../components/auction/sellerAuctionCentreViewModels';

export interface UseSellerAuctionTabScrollResult {
  listRef: React.RefObject<FlashListRef<FlatListItem> | null>;
  tabScrollRef: React.RefObject<ScrollView | null>;
  tabLayoutsRef: React.RefObject<Record<string, { x: number; width: number }>>;
  handleTabPress: (key: SellerTab) => void;
}

// Sticky-tab scroll architecture: owns the list ref, the horizontal tab
// ScrollView ref, and per-tab layout measurements so the selected tab can be
// auto-scrolled into view and the list reset to top on tab switch.
export function useSellerAuctionTabScroll(
  activeTab: SellerTab,
  setActiveTab: React.Dispatch<React.SetStateAction<SellerTab>>,
): UseSellerAuctionTabScrollResult {
  const listRef = useRef<FlashListRef<FlatListItem>>(null);
  const tabScrollRef = useRef<ScrollView>(null);
  const tabLayoutsRef = useRef<Record<string, { x: number; width: number }>>({});

  // Tab press: switch tab + scroll list to top for predictable positioning
  const handleTabPress = useCallback((key: SellerTab) => {
    setActiveTab(key);
    // Scroll to top so summary reappears — predictable on tab switch
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    });
  }, [setActiveTab]);

  // Auto-scroll selected tab into view when it changes
  useEffect(() => {
    const layout = tabLayoutsRef.current[activeTab];
    if (layout && tabScrollRef.current) {
      tabScrollRef.current.scrollTo({
        x: Math.max(0, layout.x - 40),
        animated: false });
    }
  }, [activeTab]);

  return { listRef, tabScrollRef, tabLayoutsRef, handleTabPress };
}
