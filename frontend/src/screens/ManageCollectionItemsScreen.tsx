import React, { useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, AspectRatio } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { EmptyState } from '../components/EmptyState';
import { BodyEmphasis, Caption } from '../components/ui/Text';

type Props = NativeStackScreenProps<RootStackParamList, 'ManageCollectionItems'>;

export default function ManageCollectionItemsScreen({ navigation, route }: Props) {
  const { colors } = useAppTheme();
  const { collectionId } = route.params;
  const haptic = useHaptic();
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();

  const collections = useStore((state) => state.collections);
  const removeFromCollectionOnApi = useStore((state) => state.removeFromCollectionOnApi);
  const removeFromCollection = useStore((state) => state.removeFromCollection);
  const addToCollection = useStore((state) => state.addToCollection);
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

  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleRemove = useCallback((itemId: string, itemTitle: string) => {
    haptic.medium();
    Alert.alert(
      'Remove item?',
      `Remove "${itemTitle}" from this collection?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
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
          },
        },
      ]
    );
  }, [collectionId, haptic, addToCollection, removeFromCollection, removeFromCollectionOnApi, show]);

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
        accessibilityLabel={`${item.title}, ${formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}${item.brand ? `, ${item.brand}` : ''}`}
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
          {formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}
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

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Manage Items" onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
    >
      {collectionItems.length === 0 ? (
        <EmptyState
          icon="folder-open-outline"
          title="No items in this collection"
          subtitle="Add saved products to this collection to manage them here."
          ctaLabel="Browse"
          onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })}
        />
      ) : (
        <FlashList
          data={collectionItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
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
    listContent: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.xxl,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      paddingVertical: Space.smMd,
    },
    rowRemoving: {
      opacity: 0.5,
    },
    thumb: {
      width: THUMB_W,
      height: THUMB_H,
      borderRadius: Radius.sm,
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden',
    },
    thumbEmpty: {
      width: THUMB_W,
      height: THUMB_H,
      borderRadius: Radius.sm,
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    rowBody: {
      flex: 1,
      gap: Space.xs / 2,
    },
    rowPrice: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      letterSpacing: Type.body.letterSpacing,
    },
    removeBtn: {
      width: Space.xl + Space.sm,
      height: Space.xl + Space.sm,
      borderRadius: Radius.md,
      backgroundColor: 'transparent',
      justifyContent: 'center',
      alignItems: 'center',
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginLeft: THUMB_W + Space.md,
    },
  });
}
