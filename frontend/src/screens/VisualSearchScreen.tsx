import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { Colors } from '../constants/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Type , Typography  } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useToast } from '../context/ToastContext';
import { useBackendData } from '../context/BackendDataContext';
import { MasonryGrid } from '../components/ProductCardV2';
import { useReducedMotion } from '../hooks/useReducedMotion';

type Props = StackScreenProps<RootStackParamList, 'VisualSearch'>;

export default function VisualSearchScreen({ navigation }: Props) {
  const { isDark } = useAppTheme();
  const { show } = useToast();
  const { listings } = useBackendData();
  const reducedMotionEnabled = useReducedMotion();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  const handleCapture = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        show('Camera permission required', 'error');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.92,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setImageUri(result.assets[0].uri);
      }
    } catch {
      show('Could not open camera', 'error');
    }
  }, [show]);

  const handleGallery = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        show('Photo library access required', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.92,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setImageUri(result.assets[0].uri);
      }
    } catch {
      show('Could not open photo library', 'error');
    }
  }, [show]);

  const handleRemoveImage = useCallback(() => {
    setImageUri(null);
  }, []);

  const handleBrowseSimilar = useCallback(() => {
    navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' });
  }, [navigation]);

  const handleSearchByText = useCallback(() => {
    navigation.navigate('GlobalSearch');
  }, [navigation]);

  const handleBrowseCategory = useCallback((categoryId: string, categoryTitle: string) => {
    navigation.navigate('Browse', { categoryId, title: categoryTitle });
  }, [navigation]);

  // Derive available categories from listings for fallback browsing
  const availableCategories = React.useMemo(() => {
    const categoryMap = new Map<string, number>();
    for (const listing of listings) {
      const cat = (listing.category ?? '').trim();
      if (cat) {
        categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + 1);
      }
    }
    return Array.from(categoryMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([category, count]) => ({ category, count }));
  }, [listings]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />
      <ScreenHeader title="Preview Visual Search" onBack={() => navigation.goBack()} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Source selection */}
        {!imageUri && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)} style={styles.sourceWrap}>
            <Text style={styles.sourceTitle}>Find similar items with a photo</Text>
            <Text style={styles.sourceSub}>
              Image matching is not connected yet. You can preview a photo, then continue with search or browse.
            </Text>
            <View style={styles.sourceRow}>
              <AnimatedPressable
                style={styles.sourceBtn}
                onPress={handleCapture}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Take a photo"
              >
                <Ionicons name="camera-outline" size={32} color={Colors.brand} />
                <Text style={styles.sourceBtnText}>Camera</Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={styles.sourceBtn}
                onPress={handleGallery}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Choose a photo from gallery"
              >
                <Ionicons name="images-outline" size={32} color={Colors.brand} />
                <Text style={styles.sourceBtnText}>Gallery</Text>
              </AnimatedPressable>
            </View>
          </Reanimated.View>
        )}

        {/* Image preview */}
        {imageUri && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)} style={styles.previewWrap}>
            <View style={styles.previewCard}>
              {previewFailed ? (
                <View style={styles.previewImg}>
                  <Ionicons name="image-outline" size={32} color={Colors.textMuted} />
                </View>
              ) : (
                <Image
                  source={{ uri: imageUri }}
                  style={styles.previewImg}
                  resizeMode="cover"
                  onError={() => setPreviewFailed(true)}
                />
              )}

              {/* Framing shows the intended crop without implying active analysis. */}
              <View style={[styles.cornerBracket, styles.cornerTL]} />
              <View style={[styles.cornerBracket, styles.cornerTR]} />
              <View style={[styles.cornerBracket, styles.cornerBL]} />
              <View style={[styles.cornerBracket, styles.cornerBR]} />

              <AnimatedPressable
                style={styles.removeBtn}
                onPress={handleRemoveImage}
                activeOpacity={0.85}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Remove selected photo"
              >
                <Ionicons name="close-circle" size={24} color="#fff" />
              </AnimatedPressable>
            </View>

            <View style={styles.availabilityCard} accessibilityRole="summary">
              <View style={styles.availabilityIcon}>
                <Ionicons name="scan-outline" size={20} color={Colors.textPrimary} />
              </View>
              <View style={styles.availabilityCopy}>
                <Text style={styles.availabilityTitle}>Visual matching is coming soon</Text>
                <Text style={styles.availabilityText}>
                  Your photo stays on this device. No scan or upload has been started.
                </Text>
              </View>
            </View>

            <AppButton
              title="Search by text"
              variant="primary"
              size="lg"
              onPress={handleSearchByText}
              style={styles.primaryAction}
            />
            <AppButton
              title="Browse all items"
              variant="secondary"
              size="md"
              onPress={handleBrowseSimilar}
              style={styles.secondaryAction}
            />
          </Reanimated.View>
        )}

        {/* Honest browse fallbacks are available as soon as a photo is selected. */}
        {imageUri && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(400)}>
            {/* Browse by category fallback */}
            {availableCategories.length > 0 && (
              <View style={styles.fallbackSection}>
                <Text style={styles.fallbackTitle}>Browse by category</Text>
                <View style={styles.categoryChipsWrap}>
                  {availableCategories.map(({ category, count }) => (
                    <AnimatedPressable
                      key={category}
                      style={styles.categoryChip}
                      onPress={() => handleBrowseCategory(category, category)}
                      activeOpacity={0.8}
                      accessibilityLabel={`Browse ${category} category, ${count} items`}
                      accessibilityRole="button"
                    >
                      <Text style={styles.categoryChipText}>{category}</Text>
                      <Text style={styles.categoryChipCount}>{count}</Text>
                    </AnimatedPressable>
                  ))}
                </View>
              </View>
            )}

            {/* Nearby listings fallback grid */}
            {listings.length > 0 && (
              <View style={styles.fallbackSection}>
                <Text style={styles.fallbackTitle}>Recently listed items</Text>
                <MasonryGrid
                  items={listings.slice(0, 8)}
                  onPressItem={(item) => navigation.navigate('ItemDetail', { itemId: item.id })}
                  numColumns={2}
                  showSaveButton
                />
              </View>
            )}
          </Reanimated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Space.md, paddingBottom: Space.xl },

  sourceWrap: { marginTop: Space.lg, alignItems: 'center', gap: Space.sm },
  sourceTitle: { fontSize: Type.subtitle.size, fontFamily: Typography.family.semibold, color: Colors.textPrimary, textAlign: 'center' },
  sourceSub: { fontSize: Type.caption.size, fontFamily: Typography.family.regular, color: Colors.textMuted, textAlign: 'center' },
  sourceRow: { width: '100%', flexDirection: 'row', gap: Space.md, marginTop: Space.lg },
  sourceBtn: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
  },
  sourceBtnText: { fontSize: Type.body.size, fontFamily: Typography.family.semibold, color: Colors.textPrimary },

  previewWrap: { marginTop: Space.lg, alignItems: 'stretch' },
  previewCard: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
    position: 'relative',
  },
  previewImg: { width: '100%', height: '100%' },
  removeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  availabilityCard: {
    marginTop: Space.md,
    padding: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
  },
  availabilityIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  availabilityCopy: { flex: 1, gap: 3 },
  availabilityTitle: { fontSize: Type.body.size, fontFamily: Typography.family.semibold, color: Colors.textPrimary },
  availabilityText: { fontSize: Type.caption.size, lineHeight: 18, fontFamily: Typography.family.regular, color: Colors.textSecondary },
  primaryAction: { marginTop: Space.md },
  secondaryAction: { marginTop: Space.sm },

  fallbackSection: { marginTop: Space.lg },
  fallbackTitle: { fontSize: Type.subtitle.size, fontFamily: Typography.family.semibold, color: Colors.textPrimary, marginBottom: Space.sm },

  // Category chips
  categoryChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  categoryChipText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },
  categoryChipCount: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },

  cornerBracket: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#fff',
  },
  cornerTL: { top: 12, left: 12, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  cornerTR: { top: 12, right: 12, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  cornerBL: { bottom: 12, left: 12, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 12, right: 12, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },

});
