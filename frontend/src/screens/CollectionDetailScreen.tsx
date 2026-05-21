import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  RefreshControl,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, {
  FadeInDown,
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { ActiveTheme, Colors } from '../constants/colors';
import { Type, Space, Radius } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { EmptyState } from '../components/EmptyState';
import { RefreshIndicator } from '../components/RefreshIndicator';
import { MasonryGrid } from '../components/ProductCardV2';
import { AppCard } from '../components/ui/AppCard';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { AppInput } from '../components/ui/AppInput';
import { AppButton } from '../components/ui/AppButton';
const { width: SCREEN_W } = Dimensions.get('window');
const COVER_H = 180;
type NavT = StackNavigationProp<RootStackParamList>;

export default function CollectionDetailScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<any>();
  const haptic = useHaptic();
  const { show } = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const scrollY = useSharedValue(0);

  const collectionId = route.params?.collectionId;

  const collections = useStore((state) => state.collections);
  const deleteCollection = useStore((state) => state.deleteCollection);
  const renameCollection = useStore((state) => state.renameCollection);
  const { listings, refreshListings } = useBackendData();

  const collection = useMemo(
    () => collections.find((c) => c.id === collectionId),
    [collections, collectionId]
  );

  const collectionItems = useMemo(
    () => listings.filter((l) => collection?.itemIds?.includes(l.id) ?? false),
    [listings, collection]
  );

  const coverImage = useMemo(() => {
    if (!collection?.itemIds?.length) return null;
    const firstItem = listings.find((l) => l.id === collection.itemIds[0]);
    return firstItem?.images?.[0] ?? null;
  }, [collection, listings]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshListings();
    setTimeout(() => setRefreshing(false), 350);
  };

  const handleGoBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Closet');
    }
  }, [navigation]);

  const handleDelete = useCallback(() => {
    haptic.heavy();
    Alert.alert(
      'Delete Collection',
      `Are you sure you want to delete "${collection?.name}"? Items will remain in your Saved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (collectionId) {
              deleteCollection(collectionId);
              show('Collection deleted', 'info');
              handleGoBack();
            }
          },
        },
      ]
    );
  }, [collection, collectionId, deleteCollection, haptic, show, handleGoBack]);

  const openRename = useCallback(() => {
    haptic.medium();
    setNewName(collection?.name ?? '');
    setRenameModalVisible(true);
  }, [collection, haptic]);

  const handleRename = useCallback(() => {
    const trimmed = newName.trim();
    if (trimmed && collectionId) {
      renameCollection(collectionId, trimmed);
      show('Collection renamed', 'success');
    }
    setRenameModalVisible(false);
  }, [newName, collectionId, renameCollection, show]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const headerBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [0, COVER_H - 60],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  if (!collection) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <EmptyState
          icon="alert-circle-outline"
          title="Collection not found"
          subtitle="This collection may have been deleted."
          ctaLabel="Go Back"
          onCtaPress={handleGoBack}
        />
      </SafeAreaView>
    );
  }

  const count = collectionItems.length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      {/* Floating Header with scroll fade */}
      <Reanimated.View style={[styles.floatingHeader, headerBgStyle]}>
        <View style={styles.headerInner}>
          <AnimatedPressable style={styles.backBtn} onPress={handleGoBack} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.floatingTitle} numberOfLines={1}>{collection.name}</Text>
          <View style={{ width: 40 }} />
        </View>
      </Reanimated.View>

      {/* Top-left back button (always visible over cover) */}
      <View style={styles.absoluteBack} pointerEvents="box-none">
        <AnimatedPressable style={[styles.backBtn, { backgroundColor: 'rgba(0,0,0,0.35)', borderColor: 'transparent' }]} onPress={handleGoBack} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </AnimatedPressable>
      </View>

      <RefreshIndicator scrollY={scrollY} isRefreshing={refreshing} topInset={20} />

      <Reanimated.ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="transparent"
            colors={['transparent']}
            progressBackgroundColor="transparent"
          />
        }
      >
        {/* Cover Image Hero */}
        {coverImage && (
          <View style={styles.coverWrap}>
            <CachedImage uri={coverImage} style={styles.coverImage} contentFit="cover" />
            <View style={styles.coverGradient} />
            <View style={styles.coverInfo}>
              <Text style={styles.coverTitle} numberOfLines={1}>{collection.name}</Text>
              <Text style={styles.coverMeta}>{count} {count === 1 ? 'item' : 'items'}</Text>
            </View>
            {/* Actions overlay */}
            <View style={styles.coverActions} pointerEvents="box-none">
              <View style={{ width: 40 }} />
              <View style={styles.actionRow}>
                <AnimatedPressable style={styles.actionBtnOverlay} onPress={openRename} activeOpacity={0.85} accessibilityLabel="Rename collection">
                  <Ionicons name="pencil-outline" size={18} color="#fff" />
                </AnimatedPressable>
                <AnimatedPressable style={styles.actionBtnOverlay} onPress={handleDelete} activeOpacity={0.85} accessibilityLabel="Delete collection">
                  <Ionicons name="trash-outline" size={18} color="#fff" />
                </AnimatedPressable>
              </View>
            </View>
          </View>
        )}

        {/* Fallback header when no cover */}
        {!coverImage && (
          <View style={styles.noCoverHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.noCoverTitle}>{collection.name}</Text>
              <Text style={styles.noCoverMeta}>{count} {count === 1 ? 'item' : 'items'}</Text>
            </View>
            <View style={styles.actionRow}>
              <AnimatedPressable style={styles.actionBtn} onPress={openRename} activeOpacity={0.85}>
                <Ionicons name="pencil-outline" size={20} color={Colors.textPrimary} />
              </AnimatedPressable>
              <AnimatedPressable style={styles.actionBtn} onPress={handleDelete} activeOpacity={0.85}>
                <Ionicons name="trash-outline" size={20} color={Colors.danger} />
              </AnimatedPressable>
            </View>
          </View>
        )}

        {/* Grid */}
        {count > 0 ? (
          <Reanimated.View entering={FadeInDown.duration(300)}>
            <MasonryGrid
              items={collectionItems}
              onPressItem={(item) => navigation.navigate('ItemDetail', { itemId: item.id })}
              numColumns={2}
              showSeller
              showSaveButton
            />
          </Reanimated.View>
        ) : (
          <EmptyState
            icon="folder-open-outline"
            title="Empty collection"
            subtitle="Browse items and add them to this collection."
            ctaLabel="Browse"
            onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })}
          />
        )}
        <View style={{ height: 120 }} />
      </Reanimated.ScrollView>

      {/* Rename Bottom Sheet Modal */}
      <RenameCollectionSheet
        visible={renameModalVisible}
        value={newName}
        onChangeText={setNewName}
        onSubmit={handleRename}
        onCancel={() => setRenameModalVisible(false)}
      />
    </SafeAreaView>
  );
}

// ============================================================================
// Rename Bottom Sheet (cross-platform, replaces Alert.prompt)
// ============================================================================
function RenameCollectionSheet({
  visible,
  value,
  onChangeText,
  onSubmit,
  onCancel,
}: {
  visible: boolean;
  value: string;
  onChangeText: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  if (!visible) return null;
  return (
    <View style={renameStyles.overlay}>
      <View style={renameStyles.backdrop}>
        <AnimatedPressable style={StyleSheet.absoluteFill} onPress={onCancel} activeOpacity={1} />
      </View>
      <AppCard variant="elevated" style={renameStyles.card} noBorder>
        <Text style={renameStyles.title}>Rename Collection</Text>
        <AppInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Collection name"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={onSubmit}
        />
        <View style={renameStyles.btnRow}>
          <AppButton title="Cancel" variant="secondary" size="sm" onPress={onCancel} style={{ flex: 1 }} />
          <AppButton title="Rename" size="sm" onPress={onSubmit} disabled={!value.trim()} style={{ flex: 1, marginLeft: Space.sm }} />
        </View>
      </AppCard>
    </View>
  );
}

const renameStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: Space.md,
    paddingBottom: Space.xl,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
    marginBottom: Space.md,
  },
  btnRow: {
    flexDirection: 'row',
    marginTop: Space.md,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingTop: 44,
    paddingBottom: Space.sm,
    gap: Space.sm,
  },
  floatingTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  absoluteBack: {
    position: 'absolute',
    top: 44,
    left: Space.md,
    zIndex: 60,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverWrap: {
    width: SCREEN_W,
    height: COVER_H,
    position: 'relative',
    marginBottom: Space.md,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  coverInfo: {
    position: 'absolute',
    bottom: Space.md,
    left: Space.md,
    right: Space.md,
  },
  coverTitle: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  coverMeta: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },
  coverActions: {
    position: 'absolute',
    top: 44,
    left: Space.md,
    right: Space.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: Space.xs,
  },
  actionBtnOverlay: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noCoverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
  },
  noCoverTitle: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
  },
  noCoverMeta: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.textMuted,
    marginTop: 2,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingBottom: 120,
  },
});
