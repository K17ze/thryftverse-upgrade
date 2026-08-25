import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { useToast } from '../context/ToastContext';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, Elevation, Control, LetterSpacing, Stroke } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { CachedImage } from '../components/CachedImage';
import { useHaptic } from '../hooks/useHaptic';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import type { Listing } from '../domain';
import { DEFAULT_CURRENCY_CODE } from '../constants/currencies';

type NavT = NativeStackNavigationProp<RootStackParamList>;

const MOSAIC_SIZE = 72;

export default function CreateCollectionScreen() {
  const navigation = useNavigation<NavT>();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();
  const { formatFromFiat } = useFormattedPrice();
  const createCollectionOnApi = useStore((state) => state.createCollectionOnApi);
  const addToCollectionOnApi = useStore((state) => state.addToCollectionOnApi);
  const savedProducts = useStore((state) => state.savedProducts);
  const { listings } = useBackendData();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Saved listings available for selection
  const savedListings = useMemo(
    () => listings.filter((l) => savedProducts.includes(l.id)),
    [listings, savedProducts]
  );

  const selectedListings = useMemo(
    () => savedListings.filter((l) => selectedIds.has(l.id)),
    [savedListings, selectedIds]
  );

  // Cover mosaic images — first 2-4 selected items
  const mosaicImages = useMemo(
    () => selectedListings.slice(0, 4).map((l) => l.images?.[0]).filter(Boolean) as string[],
    [selectedListings]
  );

  const canSubmit = name.trim().length > 0 && !isSubmitting;

  const toggleItem = useCallback((itemId: string) => {
    haptic.light();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, [haptic]);

  const handleCreate = useCallback(async () => {
    if (!canSubmit) return;
    haptic.medium();
    setIsSubmitting(true);

    try {
      const trimmed = name.trim();
      const newId = await createCollectionOnApi(trimmed, description.trim() || undefined, isPrivate);
      // Add selected items to the collection via API
      for (const itemId of selectedIds) {
        try {
          await addToCollectionOnApi(newId, itemId);
        } catch {
          // Non-fatal — collection is created, items can be added later
        }
      }
      show('Collection created', 'success');
      setIsSubmitting(false);
      navigation.replace('CollectionDetail', { collectionId: newId });
    } catch {
      setIsSubmitting(false);
      show('Unable to create collection. Check your connection and try again.', 'error');
    }
  }, [canSubmit, haptic, name, description, isPrivate, selectedIds, createCollectionOnApi, addToCollectionOnApi, show, navigation]);

  const renderMosaic = () => {
    if (mosaicImages.length === 0) return null;
    const count = Math.min(mosaicImages.length, 4);
    if (count === 1) {
      return (
        <View style={[styles.mosaicTile, { width: MOSAIC_SIZE, height: MOSAIC_SIZE }]}>
          <CachedImage uri={mosaicImages[0]} style={styles.mosaicImg} contentFit="cover" />
        </View>
      );
    }
    // 2x2 grid
    const tiles = mosaicImages.slice(0, 4);
    const half = MOSAIC_SIZE / 2 - 1;
    return (
      <View style={[styles.mosaicGrid, { width: MOSAIC_SIZE, height: MOSAIC_SIZE }]}>
        {tiles.map((uri, i) => (
          <View key={uri + i} style={[styles.mosaicTileSmall, { width: half, height: half }]}>
            <CachedImage uri={uri} style={styles.mosaicImg} contentFit="cover" />
          </View>
        ))}
        {/* Fill empty slots */}
        {Array.from({ length: 4 - tiles.length }).map((_, i) => (
          <View key={`empty-${i}`} style={[styles.mosaicTileEmpty, { width: half, height: half, backgroundColor: colors.surfaceAlt }]} />
        ))}
      </View>
    );
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="New Collection"
          onBack={() => navigation.goBack()}
          rightAction={
            <AnimatedPressable
              onPress={handleCreate}
              disabled={!canSubmit}
              activeOpacity={0.7}
              scaleValue={0.95}
              hapticFeedback="light"
              accessibilityLabel="Create collection"
              accessibilityRole="button"
            >
              <Text style={[styles.headerAction, !canSubmit && styles.headerActionDisabled]}>
                Create
              </Text>
            </AnimatedPressable>
          }
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <KeyboardAwareScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* Cover mosaic preview — auto-generated from selected items */}
        <View style={styles.coverPreviewSection}>
          <View style={[styles.coverPreview, { backgroundColor: colors.surfaceAlt }]}>
            {mosaicImages.length > 0 ? (
              renderMosaic()
            ) : (
              <View style={[styles.coverPlaceholder, { width: MOSAIC_SIZE, height: MOSAIC_SIZE }]}>
                <Ionicons name="images-outline" size={28} color={colors.textMuted} />
              </View>
            )}
            <View style={styles.coverPreviewInfo}>
              <Text style={[styles.coverPreviewLabel, { color: colors.textMuted }]}>
                Cover preview
              </Text>
              <Text style={[styles.coverPreviewSub, { color: colors.textMuted }]}>
                {mosaicImages.length > 0
                  ? `Auto-generated from ${selectedListings.length} item${selectedListings.length > 1 ? 's' : ''}`
                  : 'Select items to auto-generate a cover'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.flatSection}>
          <Text style={styles.label}>Name</Text>
          <AppInput
            value={name}
            onChangeText={setName}
            placeholder="Collection name"
            autoFocus
            maxLength={40}
            accessibilityLabel="Collection name input"
          />
          <Text style={styles.charCount}>{name.length}/40</Text>
        </View>

        <View style={styles.flatSection}>
          <Text style={styles.label}>Description</Text>
          <AppInput
            value={description}
            onChangeText={setDescription}
            placeholder="Describe your collection"
            multiline
            maxLength={200}
            inputContainerStyle={styles.textArea}
            accessibilityLabel="Collection description input"
          />
          <Text style={styles.charCount}>{description.length}/200</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleIconWrap}>
              <Ionicons name={isPrivate ? 'lock-closed-outline' : 'lock-open-outline'} size={20} color={colors.textSecondary} />
            </View>
            <View style={styles.toggleText}>
              <Text style={styles.toggleLabel}>Private collection</Text>
              <Text style={styles.toggleSub}>Only you can see this collection</Text>
            </View>
            <AnimatedPressable
              onPress={() => {
                haptic.light();
                setIsPrivate((v) => !v);
              }}
              activeOpacity={0.7}
              scaleValue={0.92}
              accessibilityLabel="Toggle private collection"
              accessibilityRole="switch"
              accessibilityState={{ checked: isPrivate }}
            >
              <View style={[styles.togglePill, isPrivate && styles.togglePillActive]}>
                <View style={[styles.toggleKnob, isPrivate && styles.toggleKnobActive]} />
              </View>
            </AnimatedPressable>
          </View>
        </View>

        {/* Item selection from saved items */}
        <View>
          <View style={styles.itemSectionHeader}>
            <Text style={styles.label}>Select items</Text>
            {selectedIds.size > 0 && (
              <Text style={[styles.itemCount, { color: colors.textMuted }]}>
                {selectedIds.size} selected
              </Text>
            )}
          </View>

          {savedListings.length === 0 ? (
            <View style={[styles.emptyItemsCard, { backgroundColor: colors.surface }]}>
              <Ionicons name="bookmark-outline" size={28} color={colors.textMuted} />
              <Text style={[styles.emptyItemsTitle, { color: colors.textSecondary }]}>
                No saved items yet
              </Text>
              <Text style={[styles.emptyItemsSub, { color: colors.textMuted }]}>
                Save items from browse to add them to collections.
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.itemScrollContent}
            >
              {savedListings.map((item) => {
                const isSelected = selectedIds.has(item.id);
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => toggleItem(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${isSelected ? 'Remove' : 'Add'} ${item.title} ${isSelected ? 'from' : 'to'} collection`}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View style={[
                      styles.itemCard,
                      { backgroundColor: colors.surface, borderColor: isSelected ? colors.brand : colors.border },
                    ]}>
                      <View style={styles.itemThumbWrap}>
                        {item.images?.[0] ? (
                          <CachedImage uri={item.images[0]} style={styles.itemThumb} contentFit="cover" />
                        ) : (
                          <View style={[styles.itemThumb, { backgroundColor: colors.surfaceAlt }]}>
                            <Ionicons name="image-outline" size={20} color={colors.textMuted} />
                          </View>
                        )}
                        {isSelected && (
                          <View style={[styles.itemCheckBadge, { backgroundColor: colors.brand }]}>
                            <Ionicons name="checkmark" size={14} color={colors.textInverse} />
                          </View>
                        )}
                      </View>
                      <Text style={[styles.itemCardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={[styles.itemCardPrice, { color: colors.textMuted }]} numberOfLines={1}>
                        {formatFromFiat(item.price, DEFAULT_CURRENCY_CODE, { displayMode: 'fiat' })}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>

        <View style={styles.footer}>
          <AppButton
            title={isSubmitting ? 'Creating...' : 'Create Collection'}
            onPress={handleCreate}
            disabled={!canSubmit}
            variant="primary"
            size="lg"
            style={[!canSubmit && styles.btnDisabled]}
            hapticFeedback="medium"
            accessibilityLabel="Create collection"
          />
        </View>
      </KeyboardAwareScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: Space.md,
  },
  contentContainer: {
    paddingTop: Space.md,
    paddingBottom: Space.xl,
    gap: Space.md,
  },
  headerAction: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
  },
  headerActionDisabled: {
    color: colors.textMuted,
  },
  // ── Cover preview ──
  coverPreviewSection: {
    alignItems: 'center',
  },
  coverPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.md,
    borderRadius: Radius.lg,
    ...Elevation.subtle,
  },
  coverPlaceholder: {
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverPreviewInfo: {
    flex: 1,
  },
  coverPreviewLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    textTransform: 'uppercase',
    letterSpacing: LetterSpacing.caps + 0.38,
  },
  coverPreviewSub: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginTop: Space.xs / 2,
    letterSpacing: Type.caption.letterSpacing,
  },
  // ── Mosaic ──
  mosaicTile: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  mosaicGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: Radius.md,
    overflow: 'hidden',
    gap: 2,
  },
  mosaicTileSmall: {
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  mosaicTileEmpty: {
    borderRadius: Radius.sm,
  },
  mosaicImg: {
    width: '100%',
    height: '100%',
  },
  // ── Cards ──
  card: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    ...Elevation.subtle,
  },
  // Flat section — no card background, hairline separator.
  // Anti-AI-slop: avoids generic dashboard silhouette of stacked equal-weight cards.
  flatSection: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  label: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: LetterSpacing.caps + 0.38,
    marginBottom: Space.sm,
  },
  textArea: {
    minHeight: Space.xl + Space.xxl,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: Space.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.smMd,
  },
  toggleIconWrap: {
    width: Control.chrome,
    height: Control.chrome,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleText: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
  },
  toggleSub: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    marginTop: Space.xs / 2,
    letterSpacing: Type.caption.letterSpacing,
  },
  togglePill: {
    width: Space.xxl,
    height: Space.lg + Space.xs,
    borderRadius: Radius.xl,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    justifyContent: 'center',
    paddingHorizontal: Space.xs - 1,
  },
  togglePillActive: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  toggleKnob: {
    width: Space.lg - Space.xs,
    height: Space.lg - Space.xs,
    borderRadius: Radius.lg,
    backgroundColor: colors.background,
    ...Elevation.card,
  },
  toggleKnobActive: {
    alignSelf: 'flex-end',
  },
  // ── Item selection ──
  itemSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemCount: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
  itemScrollContent: {
    gap: Space.sm,
    paddingRight: Space.md,
    paddingVertical: Space.xs,
  },
  itemCard: {
    width: 110,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    padding: Space.xs + 2,
    gap: Space.xs / 2,
  },
  itemThumbWrap: {
    position: 'relative',
    width: '100%',
    height: 90,
  },
  itemThumb: {
    width: '100%',
    height: '100%',
    borderRadius: Radius.md,
  },
  itemCheckBadge: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    width: Space.xl - Space.xs,
    height: Space.xl - Space.xs,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemCardTitle: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    lineHeight: Type.meta.lineHeight,
  },
  itemCardPrice: {
    fontSize: Type.meta.size - 1,
    fontFamily: Typography.family.regular,
  },
  // ── Empty items ──
  emptyItemsCard: {
    alignItems: 'center',
    padding: Space.lg,
    borderRadius: Radius.lg,
    gap: Space.sm,
    ...Elevation.subtle,
  },
  emptyItemsTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  emptyItemsSub: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    lineHeight: Type.caption.lineHeight + 2,
  },
  footer: {
    marginTop: 'auto',
  },
  btnDisabled: {
    opacity: 0.45,
  },
  });
}
