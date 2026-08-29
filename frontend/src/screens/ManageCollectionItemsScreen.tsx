import React, { useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, AspectRatio, Stroke, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { EmptyState } from '../components/EmptyState';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { BodyEmphasis, Caption } from '../components/ui/Text';

type Props = NativeStackScreenProps<RootStackParamList, 'ManageCollectionItems'>;

export default function ManageCollectionItemsScreen({ navigation, route }: Props) {
  const { colors } = useAppTheme();
  const { collectionId } = route.params;
  const haptic = useHaptic();
  const { show } = useToast();
  const { currencyCode, formatFromFiat } = useFormattedPrice();

  const collections = useStore((state) => state.collections);
  const removeFromCollectionOnApi = useStore((state) => state.removeFromCollectionOnApi);
  const removeFromCollection = useStore((state) => state.removeFromCollection);
  const addToCollection = useStore((state) => state.addToCollection);
  const addToCollectionOnApi = useStore((state) => state.addToCollectionOnApi);
  const savedProducts = useStore((state) => state.savedProducts);
  const { listings } = useBackendData();

  const collection = useMemo(
    () => collections.find((c) => c.id === collectionId),
    [collections, collectionId]
  );

  const collectionItems = useMemo(() => {
    if (!collection?.itemIds?.length) return [];
    return collection.itemIds
      .map((id) => listings.find((l) => l.id === id))
      .filter((l): l is NonNullable<typeof l> => !!l);
  }, [collection, listings]);

  // Saved items not yet in this collection — available to add
  const availableToAdd = useMemo(
    () => listings.filter(
      (l) => savedProducts.includes(l.id) && !(collection?.itemIds?.includes(l.id) ?? false)
    ),
    [listings, savedProducts, collection]
  );

  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());

  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    variant: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', onConfirm: () => {}, variant: 'default' });

  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleRemove = useCallback((itemId: string, itemTitle: string) => {
    haptic.medium();
    setConfirmSheet({
      visible: true,
      title: 'Remove item?',
      message: `Remove "${itemTitle}" from this collection?`,
      confirmLabel: 'Remove',
      cancelLabel: 'Cancel',
      variant: 'danger',
      onConfirm: async () => {
        setRemovingIds((prev) => new Set(prev).add(itemId));
        // Optimistic removal
        removeFromCollection(collectionId, itemId);
        try {
          await removeFromCollectionOnApi(collectionId, itemId);
          show('Item removed', 'info');
        } catch {
          // Rollback: re-add the item since API call failed
          addToCollection(collectionId, itemId);
          show('Failed to remove item. Try again.', 'error');
        } finally {
          setRemovingIds((prev) => {
            const next = new Set(prev);
            next.delete(itemId);
            return next;
          });
        }
      } });
  }, [collectionId, haptic, addToCollection, removeFromCollection, removeFromCollectionOnApi, show]);

  const handleAdd = useCallback(async (itemId: string) => {
    if (addingIds.has(itemId)) return;
    haptic.light();
    // Optimistic add
    addToCollection(collectionId, itemId);
    setAddingIds((prev) => new Set(prev).add(itemId));
    try {
      await addToCollectionOnApi(collectionId, itemId);
      show('Item added to collection', 'success');
    } catch {
      // Rollback
      removeFromCollection(collectionId, itemId);
      show('Failed to add item. Try again.', 'error');
    } finally {
      setAddingIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  }, [addingIds, haptic, collectionId, addToCollection, addToCollectionOnApi, removeFromCollection, show]);

  if (!collection) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Manage Items" onBack={() => navigation.goBack()} />}
        scrollEnabled={false}
      >
        <EmptyState
          icon="alert-circle-outline"
          title="Collection not found"
          subtitle="This collection may have been deleted."
          ctaLabel="Go Back"
          onCtaPress={() => navigation.goBack()}
        />
      </FlagshipScreen>
    );
  }

  const renderItem = ({ item }: { item: typeof collectionItems[0] }) => {
    const isRemoving = removingIds.has(item.id);
    return (
      <AnimatedPressable
        style={[styles.row, isRemoving && styles.rowRemoving]}
        onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${formatFromFiat(item.price, currencyCode, { displayMode: 'fiat' })}${item.brand ? `, ${item.brand}` : ''}`}
      >
        {item.images?.[0] ? (
          <CachedImage uri={item.images[0]} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={styles.thumbEmpty}>
            <Ionicons name="image-outline" size={18} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.rowBody}>
          <BodyEmphasis numberOfLines={1}>{item.title}</BodyEmphasis>
          <Caption color={colors.textMuted}>{item.brand}</Caption>
        </View>
        <Text style={styles.rowPrice} numberOfLines={1}>
          {formatFromFiat(item.price, currencyCode, { displayMode: 'fiat' })}
        </Text>
        <AnimatedPressable
          style={styles.removeBtn}
          onPress={() => handleRemove(item.id, item.title)}
          activeOpacity={0.7}
          scaleValue={0.9}
          hapticFeedback="light"
          accessibilityLabel="Remove from collection"
          accessibilityRole="button"
        >
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
        </AnimatedPressable>
      </AnimatedPressable>
    );
  };

  const renderAvailableItem = ({ item }: { item: typeof availableToAdd[0] }) => {
    const isAdding = addingIds.has(item.id);
    return (
      <View style={styles.row}>
        <Pressable
          style={styles.availableInfo}
          onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}, ${formatFromFiat(item.price, currencyCode, { displayMode: 'fiat' })}`}
        >
          {item.images?.[0] ? (
            <CachedImage uri={item.images[0]} style={styles.thumb} contentFit="cover" />
          ) : (
            <View style={styles.thumbEmpty}>
              <Ionicons name="image-outline" size={18} color={colors.textMuted} />
            </View>
          )}
          <View style={styles.rowBody}>
            <BodyEmphasis numberOfLines={1}>{item.title}</BodyEmphasis>
            <Caption color={colors.textMuted}>{item.brand}</Caption>
          </View>
        </Pressable>
        <Text style={styles.rowPrice} numberOfLines={1}>
          {formatFromFiat(item.price, currencyCode, { displayMode: 'fiat' })}
        </Text>
        <AnimatedPressable
          style={[styles.addBtn, isAdding && styles.addBtnLoading]}
          onPress={() => void handleAdd(item.id)}
          activeOpacity={0.7}
          scaleValue={0.9}
          hapticFeedback="light"
          disabled={isAdding}
          accessibilityLabel={`Add ${item.title} to collection`}
          accessibilityRole="button"
        >
          <Ionicons name={isAdding ? 'hourglass-outline' : 'add-circle-outline'} size={20} color={colors.brand} />
        </AnimatedPressable>
      </View>
    );
  };

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Manage Items" onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Items in collection */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>In this collection</Text>
          <Text style={styles.sectionCount}>
            {collectionItems.length} {collectionItems.length === 1 ? 'item' : 'items'}
          </Text>
        </View>

        {collectionItems.length === 0 ? (
          <EmptyState
            icon="folder-open-outline"
            title="This collection is empty"
            subtitle="Add saved products to this collection from the section below."
          />
        ) : (
          <View style={styles.listContent}>
            {collectionItems.map((item, idx) => (
              <React.Fragment key={item.id}>
                {renderItem({ item })}
                {idx < collectionItems.length - 1 && <View style={styles.separator} />}
              </React.Fragment>
            ))}
          </View>
        )}

        {/* Available to add from saved items */}
        {availableToAdd.length > 0 && (
          <View style={styles.availableSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Add from saved</Text>
              <Text style={styles.sectionCount}>
                {availableToAdd.length} available
              </Text>
            </View>
            <View style={styles.listContent}>
              {availableToAdd.map((item, idx) => (
                <React.Fragment key={item.id}>
                  {renderAvailableItem({ item })}
                  {idx < availableToAdd.length - 1 && <View style={styles.separator} />}
                </React.Fragment>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel}
        cancelLabel={confirmSheet.cancelLabel}
        onConfirm={() => { confirmSheet.onConfirm(); setConfirmSheet((s) => ({ ...s, visible: false })); }}
        variant={confirmSheet.variant}
      />
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  // 3:4 portrait thumbnail — media-first scanning matches the closet mosaic
  // geometry so the management surface feels continuous with the collection
  // detail grid (AGENTS.md §4 media storytelling, §14 state completeness).
  const THUMB_W = Space.xxl + Space.sm; // 56pt
  const THUMB_H = Math.round(THUMB_W / AspectRatio.portrait); // ~75pt
  return StyleSheet.create({
    scroll: {
      flex: 1 },
    scrollContent: {
      paddingBottom: Space.xxl },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingTop: Space.md,
      paddingBottom: Space.sm },
    sectionTitle: {
      fontSize: TypographyV2.label.size,
      fontFamily: TypographyV2.label.fontFamily,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: TypographyV2.label.letterSpacing },
    sectionCount: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },
    listContent: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.lg },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      paddingVertical: Space.smMd,
      minHeight: Control.hit },
    rowRemoving: {
      opacity: 0.5 },
    availableInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      flex: 1 },
    thumb: {
      width: THUMB_W,
      height: THUMB_H,
      borderRadius: Radius.sm,
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden' },
    thumbEmpty: {
      width: THUMB_W,
      height: THUMB_H,
      borderRadius: Radius.sm,
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border },
    rowBody: {
      flex: 1,
      gap: Space.xs / 2 },
    rowPrice: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary,
      letterSpacing: TypographyV2.body.letterSpacing },
    removeBtn: {
      width: Space.xl + Space.sm,
      height: Space.xl + Space.sm,
      borderRadius: Radius.md,
      backgroundColor: 'transparent',
      justifyContent: 'center',
      alignItems: 'center' },
    addBtn: {
      width: Space.xl + Space.sm,
      height: Space.xl + Space.sm,
      borderRadius: Radius.md,
      backgroundColor: 'transparent',
      justifyContent: 'center',
      alignItems: 'center' },
    addBtnLoading: {
      opacity: 0.5 },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginLeft: THUMB_W + Space.md },
    availableSection: {
      paddingTop: Space.lg,
      flex: 1 } });
}
