import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { Share } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { useStore } from '../../store/useStore';
import { createOutfit } from '../../services/styleGraph';
import { haptics } from '../../utils/haptics';
import {
  buildShareMessage,
  OUTFIT_SLOTS,
  type OutfitItemsMap } from '../../components/outfitbuilder/outfitBuilderViewModels';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export interface BuilderConfirmSheetState {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  confirmLabel?: string;
  variant?: 'default' | 'danger';
}

export interface UseOutfitBuilderActionsOptions {
  outfitItems: OutfitItemsMap;
  backgroundColor: string | undefined;
  filledCount: number;
  /** Clear-confirm callback — owned by the selection hook. */
  clearSelection: () => void;
}

export interface UseOutfitBuilderActionsResult {
  confirmSheet: BuilderConfirmSheetState;
  setConfirmSheet: Dispatch<SetStateAction<BuilderConfirmSheetState>>;
  handleSave: () => void;
  handleShare: () => Promise<void>;
  handleClear: () => void;
}

/**
 * Owns the builder's action domain: save-to-collection, share sheet, the
 * destructive clear-confirmation, and the confirmation-sheet state they
 * drive. Selection mechanics live in useOutfitBuilderSelection.
 */
export function useOutfitBuilderActions({
  outfitItems,
  backgroundColor,
  filledCount,
  clearSelection,
}: UseOutfitBuilderActionsOptions): UseOutfitBuilderActionsResult {
  const navigation = useNavigation<NavT>();
  const createCollectionFn = useStore((s) => s.createCollection);
  const addToCollection = useStore((s) => s.addToCollection);
  const addOutfitToStore = useStore((s) => s.addOutfit);

  const [confirmSheet, setConfirmSheet] = useState<BuilderConfirmSheetState>({
    visible: false, title: '', message: '', onConfirm: () => {} });

  const handleSave = useCallback(() => {
    if (filledCount < 2) {
      setConfirmSheet({
        visible: true,
        title: 'Need more items',
        message: 'Select at least 2 items to save an outfit.',
        confirmLabel: 'OK',
        onConfirm: () => {} });
      return;
    }

    const outfit = createOutfit(outfitItems);
    const collectionName = outfit.name;
    const collectionId = createCollectionFn(collectionName, `Outfit with ${filledCount} items — score ${outfit.score}`);

    OUTFIT_SLOTS.forEach((slot) => {
      const item = outfitItems[slot];
      if (item) addToCollection(collectionId, item.id);
    });

    const itemIds = OUTFIT_SLOTS.map((slot) => outfitItems[slot]?.id).filter(Boolean) as string[];
    addOutfitToStore({
      id: outfit.id,
      name: outfit.name,
      itemIds,
      backgroundColor,
      createdAt: outfit.createdAt,
      updatedAt: outfit.createdAt });

    haptics.success();
    setConfirmSheet({
      visible: true,
      title: 'Outfit Saved',
      message: `"${collectionName}" added to your outfits.`,
      confirmLabel: 'OK',
      onConfirm: () => navigation.goBack() });
  }, [filledCount, outfitItems, backgroundColor, createCollectionFn, addToCollection, addOutfitToStore, navigation]);

  const handleShare = useCallback(async () => {
    if (filledCount < 1) {
      setConfirmSheet({
        visible: true,
        title: 'No items',
        message: 'Add at least one item to share your outfit.',
        confirmLabel: 'OK',
        onConfirm: () => {} });
      return;
    }
    const outfit = createOutfit(outfitItems);
    try {
      await Share.share({
        message: buildShareMessage(outfit.name, outfitItems) });
    } catch { /* user cancelled */ }
  }, [filledCount, outfitItems]);

  const handleClear = useCallback(() => {
    setConfirmSheet({
      visible: true,
      title: 'Clear Outfit?',
      message: 'This will remove all selected items.',
      confirmLabel: 'Clear',
      variant: 'danger',
      onConfirm: clearSelection });
  }, [clearSelection]);

  return {
    confirmSheet,
    setConfirmSheet,
    handleSave,
    handleShare,
    handleClear };
}
