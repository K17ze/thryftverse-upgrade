import React, { useState } from 'react';
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
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
  FadeInDown,
  FadeInUp,
  FadeOutUp,
  Layout,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { ActiveTheme, Colors } from '../constants/colors';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useStore } from '../store/useStore';
import { SortablePhotoStrip } from '../components/SortablePhotoStrip';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { CURRENCIES } from '../constants/currencies';
import { useCurrencyPref } from '../hooks/useCurrencyPref';
import { sanitizeDecimalInput, sanitizeIntegerInput } from '../utils/currencyAuthoringFlows';
import { buildCreateCoOwnPrefillFromSell } from '../utils/syndicatePrefill';
import { filterImageUris } from '../utils/media';
import { AppButton } from '../components/ui/AppButton';
import { AppSegmentControl, AppSegmentOption } from '../components/ui/AppSegmentControl';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { AppInput } from '../components/ui/AppInput';
import { AppCard } from '../components/ui/AppCard';
import { T } from '../components/ui/Text';
import { Space, Radius, Type } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { haptics } from '../utils/haptics';
import { SettingsSectionHeader } from '../components/SettingsCell';
import { Typography } from '../constants/typography';

const CONDITIONS = ['New with tags', 'Very good', 'Good', 'Satisfactory'];
const SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'One size'];
const BRANDS = ['Nike', 'Adidas', 'Zara', 'H&M', 'Ralph Lauren', 'Off-White', 'Stone Island', 'Stussy', 'Other'];
const CATEGORY_OPTIONS = ['Women', 'Men', 'Designer', 'Kids', 'Home', 'Electronics', 'Entertainment', 'Hobbies & collectables', 'Sports'];
type CoOwnMode = 'off' | 'on';
type ListingType = 'marketplace' | 'co-own' | 'auction';

const CO_OWN_MODE_OPTIONS: AppSegmentOption<CoOwnMode>[] = [
  { value: 'off', label: 'Off', accessibilityLabel: 'Disable co-own listing' },
  { value: 'on', label: 'On', accessibilityLabel: 'Enable co-own listing' },
];

const OFFERING_WINDOW_OPTIONS: AppSegmentOption<`${number}h`>[] = [
  { value: '24h', label: '24h', accessibilityLabel: '24 hour offering window' },
  { value: '48h', label: '48h', accessibilityLabel: '48 hour offering window' },
  { value: '72h', label: '72h', accessibilityLabel: '72 hour offering window' },
];

const LISTING_TYPE_OPTIONS: AppSegmentOption<ListingType>[] = [
  { value: 'marketplace', label: 'Marketplace', accessibilityLabel: 'Create marketplace listing' },
  { value: 'co-own', label: 'Co-Own', accessibilityLabel: 'Create co-own listing' },
  { value: 'auction', label: 'Auction', accessibilityLabel: 'Create auction listing' },
];

const { width } = Dimensions.get('window');

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function SectionHeader({ title, delay = 0 }: { title: string; delay?: number }) {
  return (
    <Reanimated.View entering={FadeInDown.delay(delay).duration(300)}>
      <SettingsSectionHeader title={title} />
    </Reanimated.View>
  );
}

function ReadinessBar({ total, done, label }: { total: number; done: number; label: string }) {
  const progress = total > 0 ? done / total : 0;
  const animatedWidth = useSharedValue(0);

  React.useEffect(() => {
    animatedWidth.value = withSpring(progress, { damping: 18, stiffness: 300 });
  }, [progress]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${animatedWidth.value * 100}%`,
  }));

  return (
    <View style={readinessStyles.container}>
      <View style={readinessStyles.topRow}>
        <T.Caption color={Colors.textSecondary} style={{ fontFamily: Typography.family.bold }}>
          {label}
        </T.Caption>
        <T.Meta color={done === total ? Colors.brand : Colors.textMuted}>
          {done}/{total}
        </T.Meta>
      </View>
      <View style={readinessStyles.track}>
        <Reanimated.View
          style={[
            readinessStyles.fill,
            barStyle,
            { backgroundColor: done === total ? Colors.brand : Colors.textSecondary },
          ]}
        />
      </View>
    </View>
  );
}

const readinessStyles = StyleSheet.create({
  container: { marginBottom: Space.sm },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Space.xs + 2,
  },
  track: {
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.full,
  },
});

function PickerRow({
  label,
  value,
  placeholder,
  onPress,
  isFirst,
  isLast,
  delay = 0,
}: {
  label: string;
  value?: string;
  placeholder?: string;
  onPress: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  delay?: number;
}) {
  const hasValue = Boolean(value);
  return (
    <Reanimated.View entering={FadeInDown.delay(delay).duration(300)}>
      <AnimatedPressable
        style={[
          pickerStyles.row,
          isFirst && { borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg },
          isLast && { borderBottomLeftRadius: Radius.lg, borderBottomRightRadius: Radius.lg },
        ]}
        onPress={() => {
          haptics.tap();
          onPress();
        }}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Select ${label}`}
        accessibilityHint={`Opens ${label.toLowerCase()} picker`}
      >
        <T.Body>{label}</T.Body>
        <View style={pickerStyles.valueArea}>
          <T.Body
            color={hasValue ? Colors.textPrimary : Colors.textMuted}
            style={{ fontFamily: Typography.family.medium }}
          >
            {value || placeholder || 'Select'}
          </T.Body>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </View>
      </AnimatedPressable>
    </Reanimated.View>
  );
}

const pickerStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.md - 2,
    paddingHorizontal: Space.md,
    backgroundColor: Colors.surface,
  },
  valueArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
});

// ============================================================================
// MAIN SCREEN
// ============================================================================

export default function SellScreen() {
  const navigation = useNavigation<any>();
  const { currencyCode } = useCurrencyPref();
  const currencySymbol = CURRENCIES[currencyCode].symbol;
  const reducedMotionEnabled = useReducedMotion();

  const [pickerMode, setPickerMode] = useState<'Brand' | 'Size' | 'Condition' | 'Category' | null>(null);

  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [price, setPrice] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [listingType, setListingType] = useState<ListingType>('marketplace');
  const [coOwnEnabled, setCoOwnEnabled] = useState(false);
  const [shareCountInput, setShareCountInput] = useState('20');
  const [sharePriceInput, setSharePriceInput] = useState('');
  const [offeringWindowHours, setOfferingWindowHours] = useState(24);
  const [authPhotos, setAuthPhotos] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const sellDraft = useStore((state) => state.sellDraft);
  const updateSellDraft = useStore((state) => state.updateSellDraft);

  const shakeOffset = useSharedValue(0);

  const shake = () => {
    shakeOffset.value = withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withSpring(0, { damping: 20, stiffness: 400 })
    );
  };

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeOffset.value }],
  }));

  const statusEnterAnimation = reducedMotionEnabled
    ? undefined
    : FadeInUp.springify().damping(20).duration(400);
  const statusExitAnimation = reducedMotionEnabled ? undefined : FadeOutUp;
  const layoutAnimation = reducedMotionEnabled ? undefined : Layout.springify();

  const coOwnModeValue: CoOwnMode = coOwnEnabled ? 'on' : 'off';
  const offeringWindowValue = `${offeringWindowHours}h` as `${number}h`;

  const handleCoOwnModeChange = (nextMode: CoOwnMode) => {
    const nextEnabled = nextMode === 'on';
    setCoOwnEnabled(nextEnabled);
    haptics.press();

    if (nextEnabled && authPhotos.length === 0 && photos.length > 0) {
      setAuthPhotos(filterImageUris(photos, 2));
    }
  };

  const handleOfferingWindowChange = (nextValue: `${number}h`) => {
    const parsedHours = Number(nextValue.replace('h', ''));
    if (Number.isFinite(parsedHours) && parsedHours > 0) {
      setOfferingWindowHours(parsedHours);
      haptics.tap();
    }
  };

  const handleShareCountChange = (value: string) => {
    const sanitized = sanitizeIntegerInput(value);
    if (!sanitized) {
      setShareCountInput('');
      return;
    }

    const parsed = Math.floor(Number(sanitized));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setShareCountInput('1');
      return;
    }

    setShareCountInput(String(Math.min(20, parsed)));
  };

  // Co-Own bidirectional math: price = shareCount * sharePrice
  React.useEffect(() => {
    if (!coOwnEnabled) return;

    const listingPrice = Number(sanitizeDecimalInput(price));
    const shareCount = Math.min(20, Math.max(1, Math.floor(Number(shareCountInput))));
    const sharePrice = Number(sanitizeDecimalInput(sharePriceInput));

    if (!Number.isFinite(shareCount) || shareCount <= 0) return;

    if (Number.isFinite(sharePrice) && sharePrice > 0 && (!Number.isFinite(listingPrice) || listingPrice <= 0)) {
      const calculatedPrice = (sharePrice * shareCount).toFixed(2);
      if (calculatedPrice !== price) {
        setPrice(calculatedPrice);
      }
      return;
    }

    if (Number.isFinite(listingPrice) && listingPrice > 0) {
      const calculatedSharePrice = (listingPrice / shareCount).toFixed(2);
      if (calculatedSharePrice !== sharePriceInput) {
        setSharePriceInput(calculatedSharePrice);
      }
    }
  }, [price, shareCountInput, sharePriceInput, coOwnEnabled]);

  const appendPhotoUri = (uri: string) => {
    setPhotos((prev) => {
      const next = [...prev, uri].slice(0, 10);
      if (coOwnEnabled && authPhotos.length === 0) {
        setAuthPhotos(filterImageUris(next, 2));
      }
      return next;
    });
  };

  const handlePickFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setErrorMsg('Allow gallery access to upload media.');
      shake();
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: false,
      quality: 0.9,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      appendPhotoUri(result.assets[0].uri);
      setErrorMsg('');
      haptics.success();
    }
  };

  const handlePickFromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setErrorMsg('Allow camera access to capture listing media.');
      shake();
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.9,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      appendPhotoUri(result.assets[0].uri);
      setErrorMsg('');
      haptics.success();
    }
  };

  const handlePublish = () => {
    const trimmedTitle = title.trim();
    const trimmedDescription = desc.trim();
    const numericPrice = Number(sanitizeDecimalInput(price));

    if (photos.length === 0) {
      setErrorMsg('Add at least one photo or video before publishing.');
      shake();
      haptics.error();
      return;
    }

    if (!trimmedTitle || !sellDraft.categoryId) {
      setErrorMsg('Please provide a title and category.');
      shake();
      haptics.error();
      return;
    }

    if (!sellDraft.size || !sellDraft.condition) {
      setErrorMsg('Please choose both size and condition.');
      shake();
      haptics.error();
      return;
    }

    if (!trimmedDescription || trimmedDescription.length < 10) {
      setErrorMsg('Add a description with at least 10 characters.');
      shake();
      haptics.error();
      return;
    }

    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      setErrorMsg('Enter a valid price greater than 0.');
      shake();
      haptics.error();
      return;
    }

    if (coOwnEnabled) {
      const prefillResult = buildCreateCoOwnPrefillFromSell({
        shareCountInput,
        sharePriceInput,
        offeringWindowHours,
        authPhotos,
      });

      if (!prefillResult.ok) {
        setErrorMsg(prefillResult.error ?? 'Unable to prepare co-own listing.');
        shake();
        haptics.error();
        return;
      }

      setErrorMsg('');
      haptics.success();
      navigation.replace('CreateCoOwn', prefillResult.params);
      return;
    }

    setErrorMsg('');
    haptics.success();

    navigation.replace('ListingSuccess', {
      title: trimmedTitle,
      price: numericPrice,
      categoryId: sellDraft.categoryId,
      photoUri: photos[0],
    });
  };

  const handlePriceChange = (value: string) => {
    setPrice(sanitizeDecimalInput(value));
  };

  const normalizedPrice = Number(sanitizeDecimalInput(price));
  const hasBasePhotos = photos.length > 0;
  const hasRequiredDetails = Boolean(title.trim() && sellDraft.categoryId && sellDraft.size && sellDraft.condition);
  const hasDescription = desc.trim().length >= 10;
  const hasValidPrice = Number.isFinite(normalizedPrice) && normalizedPrice > 0;
  const parsedShareCount = Math.floor(Number(shareCountInput));
  const hasValidShareCount = Number.isFinite(parsedShareCount) && parsedShareCount > 0;
  const parsedSharePrice = Number(sanitizeDecimalInput(sharePriceInput));
  const hasValidSharePrice = Number.isFinite(parsedSharePrice) && parsedSharePrice > 0;
  const coOwnFinancialReady = !coOwnEnabled || (hasValidShareCount && hasValidSharePrice);
  const coOwnAuthReady = !coOwnEnabled || authPhotos.length > 0;

  const readinessItems = [
    { key: 'photos', label: 'Media', done: hasBasePhotos },
    { key: 'details', label: 'Details', done: hasRequiredDetails },
    { key: 'description', label: 'Description', done: hasDescription },
    { key: 'price', label: 'Price', done: hasValidPrice },
    { key: 'coOwnPrice', label: 'Share setup', done: coOwnFinancialReady },
    { key: 'coOwnAuth', label: 'Auth proof', done: coOwnAuthReady },
  ];

  const visibleReadinessItems = coOwnEnabled
    ? readinessItems
    : readinessItems.filter((item) => item.key !== 'coOwnPrice' && item.key !== 'coOwnAuth');

  const incompleteReadinessCount = visibleReadinessItems.reduce(
    (count, item) => (item.done ? count : count + 1),
    0,
  );

  const publishReady = incompleteReadinessCount === 0;
  const readinessLabel = publishReady
    ? coOwnEnabled
      ? 'Ready for issuing'
      : 'Ready to publish'
    : `${incompleteReadinessCount} checks left`;

  const flowSteps = [
    { key: 'media', label: 'Media', done: hasBasePhotos },
    { key: 'details', label: 'Details', done: hasRequiredDetails && hasDescription },
    { key: 'pricing', label: 'Pricing', done: hasValidPrice },
    { key: 'launch', label: coOwnEnabled ? 'Issue' : 'Publish', done: publishReady },
  ];

  const currentFlowStep = flowSteps.findIndex((step) => !step.done);
  const flowStepCount = flowSteps.length;
  const flowProgressLabel = currentFlowStep === -1
    ? `Step ${flowStepCount}/${flowStepCount}`
    : `Step ${currentFlowStep + 1}/${flowStepCount}`;

  const nextFlowActionHint = !hasBasePhotos
    ? 'Add at least one photo or video to unlock the listing flow.'
    : !hasRequiredDetails
      ? 'Complete title, category, size, and condition.'
      : !hasDescription
        ? 'Add a description with key details buyers care about.'
        : !hasValidPrice
          ? 'Set a valid price to enable publishing.'
          : !coOwnFinancialReady
            ? 'Complete share count and share price for co-own.'
            : !coOwnAuthReady
              ? 'Attach authentication photos before issuing co-own units.'
              : 'Everything is ready. You can continue now.';

  const missingReadinessItems = visibleReadinessItems.filter((item) => !item.done);
  const primaryCtaTitle = publishReady ? (coOwnEnabled ? 'Continue to Issue' : 'Publish Item') : 'Review Required Fields';
  const primaryCtaSubtitle = publishReady
    ? coOwnEnabled
      ? 'Opens issuer setup with this listing prefilled.'
      : 'Publishes this listing to your storefront.'
    : missingReadinessItems.length > 2
      ? `${missingReadinessItems
        .slice(0, 2)
        .map((item) => item.label)
        .join(' + ')} +${missingReadinessItems.length - 2} more`
      : missingReadinessItems.map((item) => item.label).join(' + ');

  React.useEffect(() => {
    if (publishReady && errorMsg) {
      setErrorMsg('');
    }
  }, [publishReady, errorMsg]);

  const getPickerOptions = () => {
    switch (pickerMode) {
      case 'Category': return CATEGORY_OPTIONS;
      case 'Condition': return CONDITIONS;
      case 'Size': return SIZES;
      case 'Brand': return BRANDS;
      default: return [];
    }
  };

  const getPickerSelected = () => {
    switch (pickerMode) {
      case 'Category': return sellDraft.categoryId;
      case 'Condition': return sellDraft.condition;
      case 'Size': return sellDraft.size;
      case 'Brand': return sellDraft.brand;
      default: return undefined;
    }
  };

  const handlePickerSelect = (val: string) => {
    if (pickerMode === 'Category') updateSellDraft({ categoryId: val, subcategoryId: undefined });
    if (pickerMode === 'Condition') updateSellDraft({ condition: val });
    if (pickerMode === 'Size') updateSellDraft({ size: val });
    if (pickerMode === 'Brand') updateSellDraft({ brand: val });
    haptics.tap();
  };

  const baseDelay = 60;
  const getDelay = (index: number) => baseDelay * index;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <AnimatedPressable
            style={styles.iconBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Close sell flow"
            accessibilityHint="Returns to the previous screen"
            hapticFeedback="light"
          >
            <Ionicons name="close" size={28} color={Colors.textPrimary} />
          </AnimatedPressable>
          <T.Headline style={styles.headerTitle}>Scan Item</T.Headline>
          <AnimatedPressable
            style={styles.iconBtn}
            activeOpacity={0.8}
            onPress={handlePickFromCamera}
            accessibilityRole="button"
            accessibilityLabel="Capture listing media"
            accessibilityHint="Opens camera to add item media"
            hapticFeedback="light"
          >
            <Ionicons name="flash-outline" size={24} color={Colors.textPrimary} />
          </AnimatedPressable>
        </View>
      </View>

      {/* ── Photo Upload Area ── */}
      {photos.length === 0 ? (
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(400)}>
          <AppCard variant="surface" style={styles.uploadCard} noBorder>
            <View style={styles.uploadInner}>
              <View style={styles.uploadIconCircle}>
                <Ionicons name="camera" size={32} color={Colors.background} />
              </View>
              <T.BodyEmphasis style={styles.uploadTitle}>Add listing media</T.BodyEmphasis>
              <T.Caption color={Colors.textMuted} style={styles.uploadSubtext}>
                Take a photo or video, or upload from your gallery
              </T.Caption>
              <View style={styles.uploadActionRow}>
                <AppButton
                  title="Camera"
                  variant="primary"
                  size="sm"
                  onPress={handlePickFromCamera}
                  icon={<Ionicons name="camera-outline" size={16} color={Colors.background} />}
                  style={styles.uploadActionBtn}
                  contentStyle={styles.uploadActionContent}
                  iconContainerStyle={styles.uploadActionIconWrap}
                  titleStyle={styles.uploadActionBtnText}
                  accessibilityLabel="Capture listing media"
                  accessibilityHint="Opens camera to capture photo or video"
                />
                <AppButton
                  title="Gallery"
                  variant="secondary"
                  size="sm"
                  onPress={handlePickFromLibrary}
                  icon={<Ionicons name="images-outline" size={16} color={Colors.textPrimary} />}
                  style={styles.uploadActionBtn}
                  contentStyle={styles.uploadActionContent}
                  iconContainerStyle={styles.uploadActionIconWrap}
                  titleStyle={styles.uploadActionBtnTextSecondary}
                  accessibilityLabel="Upload media from gallery"
                  accessibilityHint="Opens media library to select photo or video"
                />
              </View>
            </View>
          </AppCard>
        </Reanimated.View>
      ) : (
        <SortablePhotoStrip photos={photos} onReorder={setPhotos} onAddPhoto={handlePickFromLibrary} />
      )}

      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {/* ── Listing Type Selector ── */}
          <SectionHeader title="Listing Type" delay={getDelay(1)} />
          <Reanimated.View entering={FadeInDown.delay(getDelay(2)).duration(400)}>
            <AppCard variant="surface" noBorder style={styles.listingTypeCard}>
              <View style={styles.listingTypeRow}>
                {LISTING_TYPE_OPTIONS.map((option) => {
                  const isActive = listingType === option.value;
                  return (
                    <AnimatedPressable
                      key={option.value}
                      style={[
                        styles.listingTypeChip,
                        isActive && styles.listingTypeChipActive,
                      ]}
                      onPress={() => {
                        haptics.press();
                        setListingType(option.value);
                      }}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={option.accessibilityLabel}
                      accessibilityState={{ selected: isActive }}
                    >
                      <Ionicons
                        name={
                          option.value === 'marketplace'
                            ? 'cart-outline'
                            : option.value === 'co-own'
                              ? 'people-outline'
                              : 'hammer-outline'
                        }
                        size={16}
                        color={isActive ? Colors.background : Colors.textPrimary}
                      />
                      <Text
                        style={[
                          styles.listingTypeChipText,
                          isActive && styles.listingTypeChipTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </AnimatedPressable>
                  );
                })}
              </View>
              <T.Caption color={Colors.textMuted} style={{ marginTop: Space.sm }}>
                {listingType === 'marketplace' && 'Standard buy-now listing with fixed price.'}
                {listingType === 'co-own' && 'Fractional ownership with share issuance.'}
                {listingType === 'auction' && 'Time-limited bidding with highest bid wins.'}
              </T.Caption>
            </AppCard>
          </Reanimated.View>

          {/* ── Item Details ── */}
          <SectionHeader title="Item Details" delay={getDelay(3)} />

          <Reanimated.View entering={FadeInDown.delay(getDelay(4)).duration(400)}>
            <AppCard variant="surface" noBorder style={styles.formCard}>
              <AppInput
                label="Title"
                placeholder="e.g. Vintage Nike Sweatshirt"
                value={title}
                onChangeText={setTitle}
                accessibilityLabel="Listing title"
                accessibilityHint="Enter a short title for your listing"
                containerStyle={{ marginBottom: Space.md }}
              />
              <AppInput
                label="Description"
                placeholder="Add measurements, flaws, and specific details..."
                value={desc}
                onChangeText={setDesc}
                multiline
                textAlignVertical="top"
                accessibilityLabel="Listing description"
                accessibilityHint="Describe condition, measurements, and details"
                helperText={`${desc.length} characters`}
              />
            </AppCard>
          </Reanimated.View>

          {/* ── Pickers ── */}
          <Reanimated.View entering={FadeInDown.delay(getDelay(5)).duration(400)}>
            <AppCard variant="surface" noBorder style={styles.pickerCard}>
              <PickerRow
                label="Category"
                value={sellDraft.categoryId}
                placeholder="Select"
                onPress={() => setPickerMode('Category')}
                isFirst
              />
              <View style={styles.divider} />
              <PickerRow
                label="Brand"
                value={sellDraft.brand}
                placeholder="Optional"
                onPress={() => setPickerMode('Brand')}
              />
              <View style={styles.divider} />
              <PickerRow
                label="Size"
                value={sellDraft.size}
                placeholder="Select"
                onPress={() => setPickerMode('Size')}
              />
              <View style={styles.divider} />
              <PickerRow
                label="Condition"
                value={sellDraft.condition}
                placeholder="Select"
                onPress={() => setPickerMode('Condition')}
                isLast
              />
            </AppCard>
          </Reanimated.View>

          {/* ── Pricing ── */}
          <SectionHeader title="Pricing" delay={getDelay(6)} />

          <Reanimated.View entering={FadeInDown.delay(getDelay(7)).duration(400)}>
            <AppCard variant="surface" noBorder style={styles.priceCard}>
              <AppInput
                label="Price"
                placeholder="0.00"
                value={price}
                onChangeText={handlePriceChange}
                keyboardType="decimal-pad"
                prefix={currencySymbol}
                accessibilityLabel="Listing price"
                accessibilityHint="Enter selling price in the selected currency"
                inputStyle={styles.priceInput}
                inputContainerStyle={styles.priceInputWrap}
              />
              <T.Caption color={Colors.textMuted} style={{ marginTop: Space.xs }}>
                Listing currency: {currencyCode}
              </T.Caption>
            </AppCard>
          </Reanimated.View>

          {/* ── Co-Own ── */}
          {listingType === 'co-own' && (
            <>
              <SectionHeader title="Co-Own Details" delay={getDelay(8)} />
              <Reanimated.View entering={FadeInDown.delay(getDelay(9)).duration(400)}>
                <AppCard variant="elevated" noBorder style={styles.coOwnCard}>
                  <View style={styles.coOwnTopRow}>
                    <View style={{ flex: 1 }}>
                      <T.BodyEmphasis>Tokenize this item</T.BodyEmphasis>
                      <T.Caption color={Colors.textSecondary}>
                        Create fractional shares for the Co-Own marketplace.
                      </T.Caption>
                    </View>
                    <AppSegmentControl
                      options={CO_OWN_MODE_OPTIONS}
                      value={coOwnModeValue}
                      onChange={handleCoOwnModeChange}
                      style={styles.coOwnToggleWrap}
                    />
                  </View>

                  {coOwnEnabled ? (
                    <View style={styles.coOwnFieldsWrap}>
                      <AppInput
                        label="Share count"
                        placeholder="20"
                        value={shareCountInput}
                        onChangeText={handleShareCountChange}
                        keyboardType="number-pad"
                        accessibilityLabel="Co-own share count"
                        accessibilityHint="Enter number of shares to create"
                        helperText="Maximum 20 units per co-own"
                        containerStyle={{ marginBottom: Space.md }}
                      />
                      <AppInput
                        label={`Initial share price (${currencyCode})`}
                        placeholder="0.00"
                        value={sharePriceInput}
                        onChangeText={(value) => setSharePriceInput(sanitizeDecimalInput(value))}
                        keyboardType="decimal-pad"
                        prefix={currencySymbol}
                        accessibilityLabel="Initial share price"
                        accessibilityHint="Enter starting price per share"
                      />
                    </View>
                  ) : (
                    <T.Caption color={Colors.textMuted} style={{ marginTop: Space.sm }}>
                      Enable this to route publishing into the Co-Own issuer flow.
                    </T.Caption>
                  )}
                </AppCard>
              </Reanimated.View>
            </>
          )}

          {/* ── Auction ── */}
          {listingType === 'auction' && (
            <>
              <SectionHeader title="Auction Details" delay={getDelay(8)} />
              <Reanimated.View entering={FadeInDown.delay(getDelay(9)).duration(400)}>
                <AppCard variant="elevated" noBorder style={styles.auctionCard}>
                  <AppInput
                    label={`Starting Bid (${currencyCode})`}
                    placeholder="0.00"
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="decimal-pad"
                    prefix={currencySymbol}
                    accessibilityLabel="Starting bid"
                    containerStyle={{ marginBottom: Space.sm }}
                  />
                  <T.Caption color={Colors.textMuted} style={{ marginBottom: Space.md }}>
                    Minimum bid to start the auction
                  </T.Caption>

                  <T.Meta style={{ marginBottom: Space.xs }}>Duration</T.Meta>
                  <AppSegmentControl
                    options={[
                      { value: '24h', label: '24h', accessibilityLabel: '24 hour auction' },
                      { value: '48h', label: '48h', accessibilityLabel: '48 hour auction' },
                      { value: '72h', label: '72h', accessibilityLabel: '72 hour auction' },
                      { value: '7d', label: '7d', accessibilityLabel: '7 day auction' },
                    ]}
                    value="24h"
                    onChange={() => {}}
                    fullWidth
                  />
                </AppCard>
              </Reanimated.View>
            </>
          )}

          {/* ── Readiness Card ── */}
          <Reanimated.View entering={FadeInDown.delay(getDelay(10)).duration(400)}>
            <AppCard variant="surface" noBorder style={styles.readinessCard}>
              <ReadinessBar
                total={visibleReadinessItems.length}
                done={visibleReadinessItems.filter((i) => i.done).length}
                label={readinessLabel}
              />
              <View style={styles.readinessChipRow}>
                {visibleReadinessItems.map((item) => (
                  <View
                    key={item.key}
                    style={[
                      styles.readinessChip,
                      item.done && styles.readinessChipDone,
                    ]}
                  >
                    <Ionicons
                      name={item.done ? 'checkmark-circle' : 'ellipse-outline'}
                      size={12}
                      color={item.done ? Colors.brand : Colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.readinessChipText,
                        item.done && styles.readinessChipTextDone,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </View>
                ))}
              </View>
              <T.Caption color={Colors.textMuted} style={styles.readinessHint}>
                {nextFlowActionHint}
              </T.Caption>
            </AppCard>
          </Reanimated.View>

          <View style={{ height: 180 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Publish Dock ── */}
      <View style={styles.stickyFooter}>
        {!!errorMsg && (
          <Reanimated.Text
            entering={statusEnterAnimation}
            exiting={statusExitAnimation}
            layout={layoutAnimation}
            style={styles.errorText}
          >
            {errorMsg}
          </Reanimated.Text>
        )}
        <Reanimated.View style={[shakeStyle, { width: '100%' }]} layout={layoutAnimation}>
          <AppButton
            title={primaryCtaTitle}
            subtitle={primaryCtaSubtitle}
            variant={publishReady ? 'primary' : 'secondary'}
            size="lg"
            onPress={handlePublish}
            align="start"
            icon={
              <Ionicons
                name={publishReady ? 'cloud-upload-outline' : 'alert-circle-outline'}
                size={18}
                color={publishReady ? Colors.background : Colors.textPrimary}
              />
            }
            trailingIcon={
              <Ionicons
                name={publishReady ? 'arrow-forward' : 'sparkles-outline'}
                size={18}
                color={publishReady ? Colors.background : Colors.textMuted}
              />
            }
            style={[styles.uploadCta, !publishReady && styles.uploadCtaPending]}
            contentStyle={styles.uploadCtaContent}
            iconContainerStyle={[
              styles.uploadCtaIconWrap,
              !publishReady && styles.uploadCtaIconWrapPending,
            ]}
            trailingIconContainerStyle={[
              styles.uploadCtaTrailingIconWrap,
              !publishReady && styles.uploadCtaTrailingIconWrapPending,
            ]}
            titleStyle={[styles.uploadCtaText, !publishReady && styles.uploadCtaTextPending]}
            subtitleStyle={[styles.uploadCtaSubtext, !publishReady && styles.uploadCtaSubtextPending]}
            accessibilityLabel={publishReady ? 'Publish listing' : 'Complete required fields'}
            accessibilityHint={
              publishReady
                ? 'Publishes this listing'
                : 'Shows missing checks and highlights the first required fix'
            }
          />
        </Reanimated.View>
      </View>

      {pickerMode && (
        <BottomSheetPicker
          visible={!!pickerMode}
          onClose={() => setPickerMode(null)}
          title={`Select ${pickerMode}`}
          options={getPickerOptions()}
          selectedValue={getPickerSelected()}
          onSelect={handlePickerSelect}
          searchable={pickerMode === 'Brand'}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardView: {
    flex: 1,
  },

  header: {
    backgroundColor: Colors.background,
    paddingBottom: Space.sm,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingTop: Space.md - Space.xs,
    paddingBottom: Space.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: Type.subtitle.size,
  },

  uploadCard: {
    marginHorizontal: Space.md,
    marginBottom: Space.md,
    borderRadius: Radius.xl,
    padding: Space.md,
  },
  uploadInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.lg,
  },
  uploadIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.md,
  },
  uploadTitle: {
    marginBottom: Space.xs,
  },
  uploadSubtext: {
    textAlign: 'center',
    marginBottom: Space.md,
    paddingHorizontal: Space.xl,
  },
  uploadActionRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  uploadActionBtn: {
    borderRadius: Radius.full,
    minHeight: 36,
    minWidth: 100,
  },
  uploadActionContent: {
    gap: 6,
  },
  uploadActionIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  uploadActionBtnText: {
    color: Colors.background,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.bold,
  },
  uploadActionBtnTextSecondary: {
    color: Colors.textPrimary,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.bold,
  },

  scrollContent: {
    paddingTop: Space.sm,
  },

  listingTypeCard: {
    marginHorizontal: Space.md,
    marginBottom: Space.lg,
    borderRadius: Radius.lg,
    padding: Space.md,
  },
  listingTypeRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  listingTypeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.md - 4,
    paddingVertical: Space.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    flex: 1,
    justifyContent: 'center',
  },
  listingTypeChipActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  listingTypeChipText: {
    color: Colors.textPrimary,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
  },
  listingTypeChipTextActive: {
    color: Colors.background,
  },

  formCard: {
    marginHorizontal: Space.md,
    marginBottom: Space.lg,
    borderRadius: Radius.lg,
    padding: Space.md,
  },

  pickerCard: {
    marginHorizontal: Space.md,
    marginBottom: Space.lg,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Space.md,
  },

  priceCard: {
    marginHorizontal: Space.md,
    marginBottom: Space.lg,
    borderRadius: Radius.lg,
    padding: Space.md,
  },
  priceInputWrap: {
    minHeight: 72,
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md,
  },
  priceInput: {
    fontSize: 28,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    paddingVertical: Space.sm,
  },

  coOwnCard: {
    marginHorizontal: Space.md,
    marginBottom: Space.lg,
    borderRadius: Radius.lg,
    padding: Space.md,
  },
  coOwnTopRow: {
    flexDirection: 'row',
    gap: Space.md,
    alignItems: 'center',
    marginBottom: Space.sm,
  },
  coOwnToggleWrap: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 36,
  },
  coOwnFieldsWrap: {
    marginTop: Space.md,
  },

  auctionCard: {
    marginHorizontal: Space.md,
    marginBottom: Space.lg,
    borderRadius: Radius.lg,
    padding: Space.md,
  },

  readinessCard: {
    marginHorizontal: Space.md,
    marginBottom: Space.lg,
    borderRadius: Radius.lg,
    padding: Space.md,
  },
  readinessChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    marginTop: Space.sm,
  },
  readinessChip: {
    borderRadius: Radius.full,
    borderWidth: 0,
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  readinessChipDone: {
    backgroundColor: Colors.surfaceAlt,
  },
  readinessChipText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  readinessChipTextDone: {
    color: Colors.brand,
  },
  readinessHint: {
    marginTop: Space.sm,
    lineHeight: Type.caption.lineHeight,
  },

  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm + 2,
    paddingBottom: Platform.OS === 'ios' ? Space.md : Space.sm + 2,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  errorText: {
    color: Colors.danger,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
    textAlign: 'center',
    marginBottom: Space.sm,
    paddingHorizontal: Space.xs,
  },
  uploadCta: {
    minHeight: 58,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Space.md - 4,
  },
  uploadCtaPending: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  uploadCtaContent: {
    width: '100%',
    justifyContent: 'space-between',
  },
  uploadCtaIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  uploadCtaIconWrapPending: {
    backgroundColor: Colors.surfaceAlt,
  },
  uploadCtaTrailingIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  uploadCtaTrailingIconWrapPending: {
    backgroundColor: Colors.surfaceAlt,
  },
  uploadCtaText: {
    color: Colors.background,
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.2,
  },
  uploadCtaTextPending: {
    color: Colors.textPrimary,
  },
  uploadCtaSubtext: {
    marginTop: 1,
    color: 'rgba(246,242,234,0.84)',
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.1,
  },
  uploadCtaSubtextPending: {
    color: Colors.textMuted,
  },
});
