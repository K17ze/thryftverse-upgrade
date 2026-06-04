import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

import { RootStackParamList } from '../navigation/types';
import { Colors } from '../constants/colors';
import { Space, Radius, Type } from '../theme/designTokens';
import { Typography } from '../constants/typography';
import { useBackendData } from '../context/BackendDataContext';
import { useToast } from '../context/ToastContext';
import { useCurrencyPref } from '../hooks/useCurrencyPref';
import { CURRENCIES } from '../constants/currencies';
import { sanitizeDecimalInput } from '../utils/currencyAuthoringFlows';

import { ScreenHeader } from '../components/ui/ScreenHeader';
import { GlassCard } from '../components/ui/GlassSurface';
import { AppInput } from '../components/ui/AppInput';
import { SettingsCell } from '../components/SettingsCell';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';

const { width: SCREEN_W } = Dimensions.get('window');

const CONDITIONS = ['New with tags', 'Very good', 'Good', 'Satisfactory'];
const SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'One size'];
const BRANDS = ['Nike', 'Adidas', 'Zara', 'H&M', 'Ralph Lauren', 'Off-White', 'Stone Island', 'Stussy', 'Other'];
const CATEGORY_OPTIONS = ['Women', 'Men', 'Designer', 'Kids', 'Home', 'Electronics', 'Entertainment', 'Hobbies & collectables', 'Sports'];

type PickerMode = 'Category' | 'Brand' | 'Size' | 'Condition' | null;
type RouteT = RouteProp<RootStackParamList, 'EditListing'>;

export default function EditListingScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const { itemId } = route.params;
  const { listings, updateListing } = useBackendData();
  const { show: showToast } = useToast();
  const { currencyCode } = useCurrencyPref();
  const currencySymbol = CURRENCIES[currencyCode].symbol;

  const listing = useMemo(() => listings.find((l) => l.id === itemId), [listings, itemId]);

  // Form state
  const [title, setTitle] = useState(listing?.title ?? '');
  const [description, setDescription] = useState(listing?.description ?? '');
  const [price, setPrice] = useState(listing?.price ? String(listing.price) : '');
  const [photos, setPhotos] = useState<string[]>(listing?.images ?? []);
  const [category, setCategory] = useState(
    listing?.category ? listing.category.charAt(0).toUpperCase() + listing.category.slice(1) : ''
  );
  const [brand, setBrand] = useState(listing?.brand ?? '');
  const [size, setSize] = useState(listing?.size ?? '');
  const [condition, setCondition] = useState(listing?.condition ?? '');
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const hasChanges = useMemo(() => {
    if (!listing) return false;
    const originalCategory = listing.category
      ? listing.category.charAt(0).toUpperCase() + listing.category.slice(1)
      : '';
    return (
      title !== listing.title ||
      description !== (listing.description ?? '') ||
      price !== String(listing.price) ||
      photos.length !== (listing.images?.length ?? 0) ||
      photos.some((p, i) => p !== listing.images?.[i]) ||
      category !== originalCategory ||
      brand !== listing.brand ||
      size !== listing.size ||
      condition !== listing.condition
    );
  }, [listing, title, description, price, photos, category, brand, size, condition]);

  const handlePickPhoto = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.9,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setPhotos((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
      }
    } catch {
      // silently ignore picker errors
    }
  }, []);

  const handleRemovePhoto = useCallback((index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const validate = useCallback(() => {
    const trimmedTitle = title.trim();
    const trimmedDesc = description.trim();
    const numericPrice = Number(sanitizeDecimalInput(price));

    if (!trimmedTitle) return 'Please provide a title.';
    if (!category) return 'Please select a category.';
    if (!brand) return 'Please select a brand.';
    if (!size) return 'Please select a size.';
    if (!condition) return 'Please select a condition.';
    if (!trimmedDesc || trimmedDesc.length < 10) return 'Add a description with at least 10 characters.';
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) return 'Enter a valid price greater than 0.';
    if (photos.length === 0) return 'Add at least one photo.';
    return '';
  }, [title, category, brand, size, condition, description, price, photos]);

  const handleSave = useCallback(async () => {
    const error = validate();
    if (error) {
      setErrorMsg(error);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setErrorMsg('');
    setIsSaving(true);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await new Promise((resolve) => setTimeout(resolve, 400));

    updateListing(itemId, {
      title: title.trim(),
      description: description.trim(),
      price: Number(sanitizeDecimalInput(price)),
      images: photos,
      brand,
      size,
      condition: condition as any,
      category: category.toLowerCase(),
    });

    setIsSaving(false);
    showToast('Listing updated successfully.', 'success');
    navigation.goBack();
  }, [validate, itemId, title, description, price, photos, brand, size, condition, category, updateListing, showToast, navigation]);

  const getPickerOptions = () => {
    switch (pickerMode) {
      case 'Category': return CATEGORY_OPTIONS;
      case 'Brand': return BRANDS;
      case 'Size': return SIZES;
      case 'Condition': return CONDITIONS;
      default: return [];
    }
  };

  const getPickerSelected = () => {
    switch (pickerMode) {
      case 'Category': return category;
      case 'Brand': return brand;
      case 'Size': return size;
      case 'Condition': return condition;
      default: return undefined;
    }
  };

  const handlePickerSelect = (val: string) => {
    if (pickerMode === 'Category') setCategory(val);
    if (pickerMode === 'Brand') setBrand(val);
    if (pickerMode === 'Size') setSize(val);
    if (pickerMode === 'Condition') setCondition(val);
    setPickerMode(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const heroUri = photos[0];
  const saveBtn = (
    <AnimatedPressable
      onPress={handleSave}
      activeOpacity={0.85}
      scaleValue={0.96}
      hapticFeedback="light"
      disabled={!hasChanges || isSaving}
    >
      <View style={[styles.saveBtn, (!hasChanges || isSaving) && styles.saveBtnDisabled]}>
        {isSaving ? (
          <Ionicons name="checkmark" size={18} color={Colors.background} />
        ) : (
          <Text style={styles.saveBtnText}>Save</Text>
        )}
      </View>
    </AnimatedPressable>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <ScreenHeader title="Edit Listing" onBack={() => navigation.goBack()} rightAction={saveBtn} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {/* Hero Photo */}
          {heroUri && (
            <Reanimated.View entering={FadeInDown.duration(300).delay(0)} style={styles.heroWrap}>
              <CachedImage uri={heroUri} style={styles.heroImage} contentFit="cover" />
              <LinearGradient
                colors={['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.85)']}
                style={styles.heroOverlay}
              />
              <View style={styles.heroMeta}>
                <Text style={styles.heroTitle} numberOfLines={1}>{title || listing?.title || 'Untitled'}</Text>
                <Text style={styles.heroSubtitle}>{photos.length} photo{photos.length !== 1 ? 's' : ''}</Text>
              </View>
            </Reanimated.View>
          )}

          {/* Photo Strip */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(60)}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStripContent}>
              {photos.map((uri, idx) => (
                <View key={`${uri}-${idx}`} style={styles.thumbWrap}>
                  <CachedImage uri={uri} style={[styles.thumb, idx === 0 && styles.thumbActive]} contentFit="cover" />
                  <AnimatedPressable
                    style={styles.removeBadge}
                    onPress={() => handleRemovePhoto(idx)}
                    activeOpacity={0.7}
                    hapticFeedback="light"
                  >
                    <Ionicons name="close" size={12} color="#fff" />
                  </AnimatedPressable>
                </View>
              ))}
              <AnimatedPressable style={styles.addThumb} onPress={handlePickPhoto} activeOpacity={0.8} hapticFeedback="light">
                <Ionicons name="add" size={24} color={Colors.textMuted} />
              </AnimatedPressable>
            </ScrollView>
          </Reanimated.View>

          {/* Basics */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(120)}>
            <Text style={styles.sectionLabel}>Basics</Text>
            <GlassCard intensity={20} style={styles.glassCard}>
              <AppInput
                label="Title"
                value={title}
                onChangeText={(t) => { setTitle(t); setErrorMsg(''); }}
                placeholder="What are you selling?"
                containerStyle={styles.inputGap}
              />
              <AppInput
                label="Description"
                value={description}
                onChangeText={(t) => { setDescription(t); setErrorMsg(''); }}
                placeholder="Describe the item, condition, and any notable details..."
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                containerStyle={styles.inputGap}
                inputStyle={{ minHeight: 100, paddingTop: 12 }}
              />
            </GlassCard>
          </Reanimated.View>

          {/* Details */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(180)}>
            <Text style={styles.sectionLabel}>Details</Text>
            <GlassCard intensity={20} style={styles.glassCard}>
              <SettingsCell
                icon="grid-outline"
                iconColor={Colors.brand}
                title="Category"
                value={category || 'Select'}
                isFirst
                onPress={() => setPickerMode('Category')}
              />
              <SettingsCell
                icon="pricetag-outline"
                iconColor={Colors.brand}
                title="Brand"
                value={brand || 'Select'}
                onPress={() => setPickerMode('Brand')}
              />
              <SettingsCell
                icon="resize-outline"
                iconColor={Colors.brand}
                title="Size"
                value={size || 'Select'}
                onPress={() => setPickerMode('Size')}
              />
              <SettingsCell
                icon="sparkles-outline"
                iconColor={Colors.brand}
                title="Condition"
                value={condition || 'Select'}
                isLast
                onPress={() => setPickerMode('Condition')}
              />
            </GlassCard>
          </Reanimated.View>

          {/* Pricing */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(240)}>
            <Text style={styles.sectionLabel}>Pricing</Text>
            <GlassCard intensity={20} style={styles.glassCard}>
              <AppInput
                label="Price"
                value={price}
                onChangeText={(v) => { setPrice(sanitizeDecimalInput(v)); setErrorMsg(''); }}
                placeholder="0.00"
                keyboardType="decimal-pad"
                prefix={<Text style={styles.currencyPrefix}>{currencySymbol}</Text>}
                inputStyle={styles.priceInput}
              />
            </GlassCard>
          </Reanimated.View>

          {/* Error */}
          {errorMsg ? (
            <Reanimated.View entering={FadeInDown.duration(200)} style={styles.errorRow}>
              <Ionicons name="alert-circle" size={16} color={Colors.danger} />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </Reanimated.View>
          ) : null}

          {/* Footer hint */}
          <Text style={styles.footerHint}>Changes are saved to your listing immediately.</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomSheetPicker
        visible={pickerMode !== null}
        onClose={() => setPickerMode(null)}
        title={pickerMode ?? 'Select'}
        options={getPickerOptions()}
        selectedValue={getPickerSelected()}
        onSelect={handlePickerSelect}
        searchable={pickerMode === 'Brand'}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingBottom: Space.xl + Space.md,
  },
  saveBtn: {
    backgroundColor: Colors.brand,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.45,
  },
  saveBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.background,
    letterSpacing: Type.body.letterSpacing,
  },
  heroWrap: {
    width: SCREEN_W,
    height: 240,
    position: 'relative',
    marginBottom: Space.md,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: Space.md,
  },
  heroMeta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Space.md,
  },
  heroTitle: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: '#FFFFFF',
    letterSpacing: Type.title.letterSpacing,
    lineHeight: Type.title.lineHeight,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroSubtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: 'rgba(255,255,255,0.72)',
    marginTop: Space.xs,
    letterSpacing: Type.caption.letterSpacing,
  },
  photoStripContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.md,
    gap: Space.sm,
  },
  thumbWrap: {
    position: 'relative',
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  thumbActive: {
    borderWidth: 2,
    borderColor: Colors.brand,
  },
  removeBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  addThumb: {
    width: 72,
    height: 72,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: Type.meta.letterSpacing,
    marginBottom: Space.sm,
    marginLeft: Space.md,
    marginTop: Space.lg,
  },
  glassCard: {
    marginHorizontal: Space.md,
    padding: Space.md,
  },
  inputGap: {
    marginBottom: Space.sm,
  },
  currencyPrefix: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    color: Colors.textMuted,
    marginRight: Space.xs,
  },
  priceInput: {
    fontSize: 28,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    paddingVertical: Space.sm,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginHorizontal: Space.md,
    marginTop: Space.md,
    padding: Space.sm,
    backgroundColor: 'rgba(255,77,77,0.08)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,77,77,0.15)',
  },
  errorText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.danger,
    lineHeight: Type.caption.lineHeight,
  },
  footerHint: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Space.lg,
    marginHorizontal: Space.md,
    lineHeight: Type.caption.lineHeight,
  },
});
