import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Dimensions,
  Image,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  interpolateColor,
  Extrapolation,
  withSpring,
  withTiming,
  withSequence,
  FadeInUp,
  FadeIn,
  FadeOut,
  SlideInRight,
  ZoomIn,
  Layout,
} from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

import { Colors } from '../constants/colors';
import { Space, Radius, Type , Typography  } from '../theme/designTokens';
import { T } from '../components/ui/Text';
import { AppInput } from '../components/ui/AppInput';
import { AppButton } from '../components/ui/AppButton';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { SortablePhotoStrip } from '../components/SortablePhotoStrip';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { CURRENCIES } from '../constants/currencies';
import { useStore } from '../store/useStore';
import { useCurrencyPref } from '../hooks/useCurrencyPref';
import { useToast } from '../context/ToastContext';
import { sanitizeDecimalInput, sanitizeIntegerInput } from '../utils/currencyAuthoringFlows';
import { buildCreateCoOwnPrefillFromSell } from '../utils/syndicatePrefill';
import { filterImageUris } from '../utils/media';
import { haptics } from '../utils/haptics';
import { ElevatedSurface } from '../components/ui/ElevatedSurface';
import { uploadMedia } from '../services/mediaUpload';
import { createListingOnApi, createListingImageOnApi } from '../services/listingsApi';

const CARD_PADDING = 20;
const SECTION_GAP = 28;
const INNER_GAP = 16;

/* ─── condition options ─── */
const CONDITION_OPTIONS = ['New with tags', 'Very good', 'Good', 'Satisfactory'];

/* ─── auction durations ─── */
const AUCTION_DURATIONS = [24, 48, 72, 168];

/* ─── mode type ─── */
type ListingMode = 'sell_now' | 'co_own' | 'auction';

/* ─── inline helpers ─── */
function SectionHeader({ step, title, subtitle }: { step: number; title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.stepBadge}>
        <T.CaptionEmphasis color={Colors.brand}>{step}</T.CaptionEmphasis>
      </View>
      <View style={styles.sectionHeaderText}>
        <T.BodyEmphasis color={Colors.textPrimary}>{title}</T.BodyEmphasis>
        {subtitle ? <T.Caption color={Colors.textMuted}>{subtitle}</T.Caption> : null}
      </View>
    </View>
  );
}

function TrustChip({ text, icon }: { text: string; icon: string }) {
  return (
    <View style={styles.trustChip}>
      <Ionicons name={icon as any} size={12} color={Colors.textMuted} />
      <T.Caption color={Colors.textMuted} style={{ marginLeft: 4 }}>{text}</T.Caption>
    </View>
  );
}

/* ─── staged trust reveal engine ─── */
function TrustReveal({
  readiness,
  mode,
}: {
  readiness: { score: number; total: number; steps: boolean[] };
  mode: ListingMode;
}) {
  const { score, steps } = readiness;
  let tip: { text: string; icon: string } | null = null;

  if (mode === 'sell_now') {
    if (score === 0) {
      tip = { text: 'Start with a great photo to boost views', icon: 'camera-outline' };
    } else if (!steps[0]) {
      tip = { text: 'Add 2+ photos so buyers can see details', icon: 'images-outline' };
    } else if (!steps[1]) {
      tip = { text: 'A clear title helps buyers find your item', icon: 'text-outline' };
    } else if (!steps[3]) {
      tip = { text: 'Pick a category so buyers can filter to you', icon: 'grid-outline' };
    } else if (!steps[4]) {
      tip = { text: 'Condition builds trust — be honest', icon: 'shield-checkmark-outline' };
    } else if (!steps[2]) {
      tip = { text: 'Set a competitive price to sell faster', icon: 'trending-up-outline' };
    } else if (!steps[5]) {
      tip = { text: 'Add a description to close the sale', icon: 'chatbubble-outline' };
    } else {
      tip = { text: 'Ready to publish! Your listing looks great', icon: 'checkmark-circle-outline' };
    }
  } else if (mode === 'co_own') {
    if (score === 0) {
      tip = { text: 'Photos build investor confidence', icon: 'camera-outline' };
    } else if (!steps[0]) {
      tip = { text: 'Add auth photos for higher trust', icon: 'images-outline' };
    } else if (!steps[1]) {
      tip = { text: 'Item name helps with valuation research', icon: 'text-outline' };
    } else if (!steps[3]) {
      tip = { text: 'Category helps buyers find your proposal', icon: 'grid-outline' };
    } else if (!steps[2]) {
      tip = { text: 'Set a fair total valuation', icon: 'trending-up-outline' };
    } else if (!steps[4]) {
      tip = { text: 'Define share structure clearly', icon: 'people-outline' };
    } else if (!steps[5]) {
      tip = { text: 'Describe condition and provenance', icon: 'chatbubble-outline' };
    } else {
      tip = { text: 'Ready to propose co-ownership!', icon: 'checkmark-circle-outline' };
    }
  } else {
    if (score === 0) {
      tip = { text: 'Quality photos attract more bidders', icon: 'camera-outline' };
    } else if (!steps[0]) {
      tip = { text: 'Multiple angles increase bids', icon: 'images-outline' };
    } else if (!steps[1]) {
      tip = { text: 'Descriptive title draws bidder attention', icon: 'text-outline' };
    } else if (!steps[3]) {
      tip = { text: 'Category reaches the right bidders', icon: 'grid-outline' };
    } else if (!steps[4]) {
      tip = { text: 'Condition matters to serious bidders', icon: 'shield-checkmark-outline' };
    } else if (!steps[2]) {
      tip = { text: 'Low starting bid drives competition', icon: 'trending-up-outline' };
    } else if (!steps[5]) {
      tip = { text: 'Detail description builds bidder confidence', icon: 'chatbubble-outline' };
    } else {
      tip = { text: 'Ready to start your auction!', icon: 'checkmark-circle-outline' };
    }
  }

  if (!tip) return null;
  return (
    <Animated.View entering={FadeIn.duration(400)} exiting={FadeOut.duration(300)} style={styles.trustRevealCard}>
      <Ionicons name={tip.icon as any} size={16} color={Colors.brand} style={{ marginRight: 8 }} />
      <T.Caption color={Colors.textPrimary} style={{ flex: 1 }}>
        {tip.text}
      </T.Caption>
      <View style={styles.trustRevealScoreRing}>
        <T.CaptionEmphasis color={Colors.brand} style={{ fontSize: 10 }}>
          {score}/{readiness.total}
        </T.CaptionEmphasis>
      </View>
    </Animated.View>
  );
}

/* ─── main component ─── */
export default function SellScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  /* ── store ── */
  const sellDraft = useStore((s) => s.sellDraft);
  const updateSellDraft = useStore((s) => s.updateSellDraft);
  const clearSellDraft = useStore((s) => s.clearSellDraft);
  const currentUser = useStore((s) => s.currentUser);

  /* ── form state ── */
  const [photos, setPhotos] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [price, setPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [category, setCategory] = useState<string>('');
  const [brand, setBrand] = useState('');
  const [size, setSize] = useState('');
  const [condition, setCondition] = useState('');
  const [shippingMethod, setShippingMethod] = useState<'standard' | 'express' | null>(null);
  const [shippingPayer, setShippingPayer] = useState<'buyer' | 'seller' | null>(null);

  /* ── listing mode ── */
  const [listingMode, setListingMode] = useState<ListingMode>('sell_now');

  /* ── co-own state ── */
  const [coOwnEnabled, setCoOwnEnabled] = useState(false);
  const [shareCountInput, setShareCountInput] = useState('');
  const [sharePriceInput, setSharePriceInput] = useState('');
  const [offeringWindowHours, setOfferingWindowHours] = useState(48);
  const [authPhotos, setAuthPhotos] = useState<string[]>([]);

  /* ── auction state ── */
  const [startingBid, setStartingBid] = useState('');
  const [reservePrice, setReservePrice] = useState('');
  const [auctionDurationHours, setAuctionDurationHours] = useState(48);

  /* ── picker ── */
  const [pickerMode, setPickerMode] = useState<'Brand' | 'Size' | 'Condition' | 'Category' | null>(null);

  /* ── validation ── */
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPublishing, setIsPublishing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /* ── currency ── */
  const currency = useCurrencyPref();
  const currencySymbol = CURRENCIES[currency.currencyCode].symbol;

  /* ── scroll ref ── */
  const scrollRef = useRef<Animated.ScrollView>(null);

  /* ── scroll momentum ── */
  const scrollY = useSharedValue(0);
  // SAFETY: useAnimatedScrollHandler returns an object; it must be passed to
  // Animated.ScrollView (from react-native-reanimated), NOT a regular ScrollView.
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => { scrollY.value = event.contentOffset.y; },
  });
  const topBarStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      scrollY.value,
      [0, 60],
      ['rgba(0,0,0,0.01)', Colors.background],
    ) as any,
    borderBottomWidth: interpolate(scrollY.value, [0, 60], [0, 1], Extrapolation.CLAMP) as any,
    borderBottomColor: interpolateColor(
      scrollY.value,
      [0, 60],
      ['rgba(0,0,0,0)', Colors.border],
    ) as any,
  }));

  /* ── draft sync on mount ── */
  useEffect(() => {
    if (sellDraft.photos) setPhotos(sellDraft.photos);
    if (sellDraft.title) setTitle(sellDraft.title);
    if (sellDraft.description) setDesc(sellDraft.description);
    if (sellDraft.price) setPrice(sellDraft.price);
    if (sellDraft.originalPrice) setOriginalPrice(sellDraft.originalPrice);
    if (sellDraft.brand) setBrand(sellDraft.brand);
    if (sellDraft.size) setSize(sellDraft.size);
    if (sellDraft.condition) setCondition(sellDraft.condition);
    if (sellDraft.categoryId) setCategory(sellDraft.categoryId);
    if (sellDraft.tags) setTags(sellDraft.tags);
    if (sellDraft.listingMode) setListingMode(sellDraft.listingMode);
    if (sellDraft.shippingMethod) setShippingMethod(sellDraft.shippingMethod);
    if (sellDraft.shippingPayer) setShippingPayer(sellDraft.shippingPayer);
    if (sellDraft.startingBid) setStartingBid(sellDraft.startingBid);
    if (sellDraft.reservePrice) setReservePrice(sellDraft.reservePrice);
    if (sellDraft.auctionDurationHours) setAuctionDurationHours(sellDraft.auctionDurationHours);
    if (sellDraft.coOwnEnabled !== undefined) setCoOwnEnabled(sellDraft.coOwnEnabled);
    if (sellDraft.shareCountInput) setShareCountInput(sellDraft.shareCountInput);
    if (sellDraft.sharePriceInput) setSharePriceInput(sellDraft.sharePriceInput);
    if (sellDraft.offeringWindowHours) setOfferingWindowHours(sellDraft.offeringWindowHours);
    if (sellDraft.authPhotos) setAuthPhotos(sellDraft.authPhotos);
  }, []);

  /* ── persist draft on change ── */
  useEffect(() => {
    updateSellDraft({
      photos,
      title,
      description: desc,
      price,
      originalPrice,
      brand,
      size,
      condition,
      categoryId: category,
      tags,
      listingMode,
      shippingMethod,
      shippingPayer,
      startingBid,
      reservePrice,
      auctionDurationHours,
      coOwnEnabled,
      shareCountInput,
      sharePriceInput,
      offeringWindowHours,
      authPhotos,
    });
  }, [photos, title, desc, price, originalPrice, brand, size, condition, category, tags, listingMode, shippingMethod, shippingPayer, startingBid, reservePrice, auctionDurationHours, coOwnEnabled, shareCountInput, sharePriceInput, offeringWindowHours, authPhotos, updateSellDraft]);

  /* ── co-own bidirectional math: price = shareCount * sharePrice ── */
  useEffect(() => {
    if (listingMode !== 'co_own') return;
    const listingPrice = Number(sanitizeDecimalInput(price));
    const shareCount = Math.min(20, Math.max(1, Math.floor(Number(shareCountInput))));
    const sharePrice = Number(sanitizeDecimalInput(sharePriceInput));
    if (!Number.isFinite(shareCount) || shareCount <= 0) return;
    if (Number.isFinite(sharePrice) && sharePrice > 0 && (!Number.isFinite(listingPrice) || listingPrice <= 0)) {
      const calculatedPrice = (sharePrice * shareCount).toFixed(2);
      if (calculatedPrice !== price) setPrice(calculatedPrice);
      return;
    }
    if (Number.isFinite(listingPrice) && listingPrice > 0) {
      const calculatedSharePrice = (listingPrice / shareCount).toFixed(2);
      if (calculatedSharePrice !== sharePriceInput) setSharePriceInput(calculatedSharePrice);
    }
  }, [price, shareCountInput, sharePriceInput, listingMode]);

  /* ── auto-sync coOwnEnabled with listingMode ── */
  useEffect(() => {
    setCoOwnEnabled(listingMode === 'co_own');
  }, [listingMode]);

  /* ── readiness bar (mode-specific) ── */
  const readiness = useMemo(() => {
    let score = 0;
    let steps: boolean[] = [];
    if (listingMode === 'sell_now') {
      steps = [
        photos.length > 0,
        title.trim().length >= 3,
        price.trim().length > 0 && Number(price) > 0,
        category.length > 0,
        condition.length > 0,
        desc.trim().length >= 10,
      ];
    } else if (listingMode === 'co_own') {
      steps = [
        photos.length > 0,
        title.trim().length >= 3,
        price.trim().length > 0 && Number(price) > 0,
        category.length > 0,
        shareCountInput.trim().length > 0 && Number(shareCountInput) > 0,
        desc.trim().length >= 10,
      ];
    } else {
      steps = [
        photos.length > 0,
        title.trim().length >= 3,
        startingBid.trim().length > 0 && Number(startingBid) > 0,
        category.length > 0,
        condition.length > 0,
        desc.trim().length >= 10,
      ];
    }
    steps.forEach((s) => { if (s) score += 1; });
    return { score, total: steps.length, steps };
  }, [listingMode, photos, title, price, category, condition, desc, shareCountInput, startingBid]);

  /* ── restored readiness + flow logic from .bak ── */
  const hasBasePhotos = photos.length > 0;
  const hasRequiredDetails = Boolean(title.trim() && category && size && condition);
  const hasDescription = desc.trim().length >= 10;
  const numericPrice = Number(sanitizeDecimalInput(price));
  const hasValidPrice = Number.isFinite(numericPrice) && numericPrice > 0;
  const numericStartingBid = Number(sanitizeDecimalInput(startingBid));
  const hasValidStartingBid = Number.isFinite(numericStartingBid) && numericStartingBid > 0;
  const parsedShareCount = Math.floor(Number(shareCountInput));
  const hasValidShareCount = Number.isFinite(parsedShareCount) && parsedShareCount > 0;
  const parsedSharePrice = Number(sanitizeDecimalInput(sharePriceInput));
  const hasValidSharePrice = Number.isFinite(parsedSharePrice) && parsedSharePrice > 0;
  const coOwnFinancialReady = listingMode !== 'co_own' || (hasValidShareCount && hasValidSharePrice);
  const coOwnAuthReady = listingMode !== 'co_own' || authPhotos.length > 0;

  const readinessItems = [
    { key: 'photos', label: 'Media', done: hasBasePhotos },
    { key: 'details', label: 'Details', done: hasRequiredDetails },
    { key: 'description', label: 'Description', done: hasDescription },
    { key: 'price', label: listingMode === 'auction' ? 'Starting bid' : 'Price', done: listingMode === 'auction' ? hasValidStartingBid : hasValidPrice },
    { key: 'coOwnPrice', label: 'Share setup', done: coOwnFinancialReady },
    { key: 'coOwnAuth', label: 'Auth proof', done: coOwnAuthReady },
  ];

  const visibleReadinessItems = listingMode === 'co_own'
    ? readinessItems
    : readinessItems.filter((item) => item.key !== 'coOwnPrice' && item.key !== 'coOwnAuth');

  const incompleteReadinessCount = visibleReadinessItems.reduce(
    (count, item) => (item.done ? count : count + 1),
    0,
  );

  const publishReady = incompleteReadinessCount === 0;

  const flowSteps = [
    { key: 'media', label: 'Media', done: hasBasePhotos },
    { key: 'details', label: 'Details', done: hasRequiredDetails && hasDescription },
    { key: 'pricing', label: 'Pricing', done: listingMode === 'auction' ? hasValidStartingBid : hasValidPrice },
    { key: 'launch', label: listingMode === 'co_own' ? 'Issue' : listingMode === 'auction' ? 'Auction' : 'Publish', done: publishReady },
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
        : listingMode === 'auction' && !hasValidStartingBid
          ? 'Set a starting bid to start your auction.'
          : listingMode !== 'auction' && !hasValidPrice
            ? 'Set a valid price to enable publishing.'
            : listingMode === 'co_own' && !coOwnFinancialReady
              ? 'Complete share count and share price for co-own.'
              : listingMode === 'co_own' && !coOwnAuthReady
                ? 'Attach authentication photos before issuing co-own units.'
                : 'Everything is ready. You can continue now.';

  const missingReadinessItems = visibleReadinessItems.filter((item) => !item.done);
  const primaryCtaTitle = publishReady
    ? listingMode === 'co_own' ? 'Continue to Issue' : listingMode === 'auction' ? 'Start Auction' : 'Publish Item'
    : 'Review Required Fields';
  const primaryCtaSubtitle = publishReady
    ? listingMode === 'co_own'
      ? 'Opens issuer setup with this listing prefilled.'
      : listingMode === 'auction'
      ? 'Starts your auction immediately.'
      : 'Publishes this listing to your storefront.'
    : missingReadinessItems.length > 2
      ? `${missingReadinessItems.slice(0, 2).map((item) => item.label).join(' + ')} +${missingReadinessItems.length - 2} more`
      : missingReadinessItems.map((item) => item.label).join(' + ');

  /* ── clear error when publish-ready ── */
  useEffect(() => {
    if (publishReady && (errorMsg || Object.keys(errors).length > 0)) {
      setErrorMsg(null);
      setErrors({});
    }
  }, [publishReady, errorMsg, errors]);

  /* ── spring progress fill ── */
  const progressWidth = useSharedValue(0);
  const prevScoreRef = useRef(0);
  const progressFillStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));
  useEffect(() => {
    progressWidth.value = withSpring((readiness.score / readiness.total) * 100, { damping: 14, stiffness: 120 });
    if (readiness.score > prevScoreRef.current && readiness.score < readiness.total) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    prevScoreRef.current = readiness.score;
  }, [readiness.score, readiness.total]);

  /* ── shake animation ── */
  const shakeOffset = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeOffset.value }] }));
  const triggerShake = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    shakeOffset.value = withSequence(
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 50 }),
      withTiming(-6, { duration: 50 }),
      withTiming(6, { duration: 50 }),
      withTiming(-3, { duration: 50 }),
      withTiming(3, { duration: 50 }),
      withTiming(0, { duration: 50 })
    );
  }, []);

  /* ── price focus animation ── */
  const priceScale = useSharedValue(1);
  const priceFocusStyle = useAnimatedStyle(() => ({ transform: [{ scale: priceScale.value }] }));

  /* ── tag handling ── */
  const handleTagSubmit = useCallback(() => {
    const raw = tagInput.trim().toLowerCase();
    if (!raw) return;
    const parts = raw.split(/[,\s]+/).filter(Boolean);
    const next = [...new Set([...tags, ...parts])].slice(0, 8);
    setTags(next);
    setTagInput('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [tagInput, tags]);

  const removeTag = useCallback((t: string) => {
    setTags((prev) => prev.filter((x) => x !== t));
  }, []);

  /* ── photo handling ── */
  const appendPhotoUri = useCallback((uri: string) => {
    setPhotos((prev) => {
      const next = [...prev, uri].slice(0, 10);
      if (listingMode === 'co_own' && coOwnEnabled && authPhotos.length === 0) {
        setAuthPhotos(filterImageUris(next, 2));
      }
      return next;
    });
  }, [listingMode, coOwnEnabled, authPhotos.length]);

  const handlePickFromLibrary = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setErrorMsg('Allow gallery access to upload media.');
        triggerShake();
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: false,
        quality: 0.9,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        appendPhotoUri(result.assets[0].uri);
        setErrorMsg(null);
        haptics.success();
      }
    } catch { /* noop */ }
  }, [appendPhotoUri]);

  const handlePickFromCamera = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setErrorMsg('Allow camera access to capture listing media.');
        triggerShake();
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.9,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        appendPhotoUri(result.assets[0].uri);
        setErrorMsg(null);
        haptics.success();
      }
    } catch { /* noop */ }
  }, [appendPhotoUri]);

  const removePhoto = useCallback((index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  /* ── price handling ── */
  const handlePriceChange = useCallback((text: string) => {
    setPrice(sanitizeDecimalInput(text));
  }, []);

  /* ── share count handling ── */
  const handleShareCountChange = useCallback((value: string) => {
    const sanitized = sanitizeIntegerInput(value);
    if (!sanitized) { setShareCountInput(''); return; }
    const parsed = Math.floor(Number(sanitized));
    if (!Number.isFinite(parsed) || parsed <= 0) { setShareCountInput('1'); return; }
    setShareCountInput(String(Math.min(20, parsed)));
  }, []);

  /* ── publish (mode-specific validation + real backend) ── */
  const handlePublish = useCallback(async () => {
    const trimmedTitle = title.trim();
    const trimmedDescription = desc.trim();
    const numericPrice = Number(sanitizeDecimalInput(price));
    const nextErrors: Record<string, string> = {};

    if (photos.length === 0) {
      nextErrors.photos = 'Add at least one photo or video before publishing.';
    }

    if (!trimmedTitle) {
      nextErrors.title = 'Please provide a title.';
    }
    if (!category) {
      nextErrors.category = 'Please select a category.';
    }
    if (!size) {
      nextErrors.size = 'Please choose a size.';
    }
    if (!condition) {
      nextErrors.condition = 'Please choose a condition.';
    }
    if (!trimmedDescription || trimmedDescription.length < 10) {
      nextErrors.description = 'Add a description with at least 10 characters.';
    }
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      nextErrors.price = 'Enter a valid price greater than 0.';
    }

    if (listingMode === 'co_own') {
      const shareCount = Math.floor(Number(shareCountInput));
      const sharePrice = Number(sanitizeDecimalInput(sharePriceInput));
      if (!Number.isFinite(shareCount) || shareCount <= 0) {
        nextErrors.shareCount = 'Enter a valid share count.';
      }
      if (!Number.isFinite(sharePrice) || sharePrice <= 0) {
        nextErrors.sharePrice = 'Enter a valid share price.';
      }
      if (authPhotos.length === 0) {
        nextErrors.authPhotos = 'Attach authentication photos before issuing co-own units.';
      }
    }

    if (listingMode === 'auction') {
      const bid = Number(sanitizeDecimalInput(startingBid));
      if (!Number.isFinite(bid) || bid <= 0) {
        nextErrors.startingBid = 'Enter a valid starting bid greater than 0.';
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setErrorMsg('Please fix the errors above before publishing.');
      triggerShake();
      haptics.error();
      return;
    }

    setErrors({});

    if (listingMode === 'co_own') {
      const prefillResult = buildCreateCoOwnPrefillFromSell({
        shareCountInput,
        sharePriceInput,
        offeringWindowHours,
        authPhotos,
      });

      if (!prefillResult.ok) {
        setErrorMsg(prefillResult.error ?? 'Unable to prepare co-own listing.');
        triggerShake();
        haptics.error();
        return;
      }

      setErrorMsg(null);
      haptics.success();
      navigation.replace('CreateCoOwn', prefillResult.params);
      return;
    }

    if (listingMode === 'auction') {
      if (!currentUser?.id) {
        setErrorMsg('Sign in to publish a listing.');
        triggerShake();
        haptics.error();
        return;
      }
      // Auction mode: create the listing first, then route to CreateAuction
      setErrorMsg(null);
      setIsPublishing(true);
      try {
        const uploadedUrls: string[] = [];
        for (let i = 0; i < photos.length; i++) {
          const uri = photos[i];
          if (uri.startsWith('http')) {
            uploadedUrls.push(uri);
          } else {
            const url = await uploadMedia(uri, 'listings');
            uploadedUrls.push(url);
          }
        }
        const coverImage = uploadedUrls[0] ?? '';
        const listingId = `listing_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        await createListingOnApi({
          id: listingId,
          sellerId: currentUser.id,
          title: trimmedTitle,
          description: trimmedDescription,
          priceGbp: numericPrice,
          imageUrl: coverImage,
          status: 'active',
          category,
          brand: brand || undefined,
          size,
          condition,
          originalPriceGbp: originalPrice ? Number(sanitizeDecimalInput(originalPrice)) : undefined,
          shippingMethod: shippingMethod || undefined,
          shippingPayer: shippingPayer || undefined,
        });
        for (let i = 0; i < uploadedUrls.length; i++) {
          await createListingImageOnApi({
            id: `${listingId}_img_${i}`,
            listingId,
            imageUrl: uploadedUrls[i],
            sortOrder: i,
          });
        }
        clearSellDraft();
        haptics.success();
        navigation.replace('CreateAuction', { listingId });
      } catch (e: unknown) {
        const msg = typeof e === 'object' && e && 'message' in e && typeof (e as Error).message === 'string' ? (e as Error).message : 'Failed to prepare auction. Please try again.';
        setErrorMsg(msg);
        triggerShake();
        haptics.error();
      } finally {
        setIsPublishing(false);
      }
      return;
    }

    if (!currentUser?.id) {
      setErrorMsg('Sign in to publish a listing.');
      triggerShake();
      haptics.error();
      return;
    }

    setIsPublishing(true);
    setErrorMsg(null);

    try {
      // 1. Upload all media
      const uploadedUrls: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const uri = photos[i];
        if (uri.startsWith('http')) {
          uploadedUrls.push(uri);
        } else {
          const url = await uploadMedia(uri, 'listings');
          uploadedUrls.push(url);
        }
      }

      const coverImage = uploadedUrls[0] ?? '';
      const listingId = `listing_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

      // 2. Create listing
      await createListingOnApi({
        id: listingId,
        sellerId: currentUser.id,
        title: trimmedTitle,
        description: trimmedDescription,
        priceGbp: numericPrice,
        imageUrl: coverImage,
        status: 'active',
        category,
        brand: brand || undefined,
        size,
        condition,
        originalPriceGbp: originalPrice ? Number(sanitizeDecimalInput(originalPrice)) : undefined,
        shippingMethod: shippingMethod || undefined,
        shippingPayer: shippingPayer || undefined,
      });

      // 3. Create listing_images for all photos
      for (let i = 0; i < uploadedUrls.length; i++) {
        await createListingImageOnApi({
          id: `${listingId}_img_${i}`,
          listingId,
          imageUrl: uploadedUrls[i],
          sortOrder: i,
        });
      }

      clearSellDraft();
      haptics.success();
      navigation.replace('ListingSuccess', {
        listingId,
        title: trimmedTitle,
        price: numericPrice,
        categoryId: category,
        photoUri: coverImage,
      });
    } catch (e: unknown) {
      const msg = typeof e === 'object' && e && 'message' in e && typeof (e as Error).message === 'string' ? (e as Error).message : 'Failed to publish. Please try again.';
      setErrorMsg(msg);
      triggerShake();
      haptics.error();
    } finally {
      setIsPublishing(false);
    }
  }, [listingMode, photos, title, desc, price, startingBid, category, size, condition, shareCountInput, sharePriceInput, offeringWindowHours, authPhotos, triggerShake, clearSellDraft, navigation, currentUser, brand, originalPrice, shippingMethod, shippingPayer]);

  /* ── picker helpers ── */
  const getPickerOptions = useCallback(() => {
    switch (pickerMode) {
      case 'Category':
        return ['Women', 'Men', 'Kids', 'Home', 'Vintage', 'Accessories', 'Beauty', 'Sportswear', 'Luxury'];
      case 'Brand':
        return ['Nike', 'Adidas', 'Zara', 'H&M', 'Gucci', 'Prada', 'Uniqlo', 'Levi\'s', 'ASOS', 'Other'];
      case 'Size':
        return ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'UK 6', 'UK 8', 'UK 10', 'UK 12', 'One Size'];
      case 'Condition':
        return CONDITION_OPTIONS;
      default:
        return [];
    }
  }, [pickerMode]);

  const getPickerSelected = useCallback(() => {
    switch (pickerMode) {
      case 'Category': return category;
      case 'Brand': return brand;
      case 'Size': return size;
      case 'Condition': return condition;
      default: return '';
    }
  }, [pickerMode, category, brand, size, condition]);

  const handlePickerSelect = useCallback((val: string) => {
    if (pickerMode === 'Category') { setCategory(val); updateSellDraft({ categoryId: val, subcategoryId: undefined }); }
    if (pickerMode === 'Brand') { setBrand(val); updateSellDraft({ brand: val }); }
    if (pickerMode === 'Size') { setSize(val); updateSellDraft({ size: val }); }
    if (pickerMode === 'Condition') { setCondition(val); updateSellDraft({ condition: val }); }
    setPickerMode(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [pickerMode, updateSellDraft]);

  /* ── computed values ── */
  const hasDiscount = useMemo(() => {
    const orig = Number(originalPrice);
    const curr = Number(price);
    return orig > 0 && curr > 0 && curr < orig;
  }, [originalPrice, price]);

  const discountPercent = useMemo(() => {
    const orig = Number(originalPrice);
    const curr = Number(price);
    if (!hasDiscount) return 0;
    return Math.round(((orig - curr) / orig) * 100);
  }, [hasDiscount, originalPrice, price]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
        {/* ── top bar ── */}
        <Animated.View style={[styles.topBar, topBarStyle]}>
          <AnimatedPressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </AnimatedPressable>
          <T.BodyEmphasis style={styles.topBarTitle}>Create listing</T.BodyEmphasis>
          <AnimatedPressable onPress={handlePickFromCamera} style={styles.iconBtn}>
            <Ionicons name="camera-outline" size={22} color={Colors.textPrimary} />
          </AnimatedPressable>
        </Animated.View>

        {/* ── step progress ── */}
        <View style={styles.progressBarWrap}>
          <View style={styles.progressBarTrack}>
            <Animated.View
              style={[
                styles.progressBarFill,
                progressFillStyle,
              ]}
            />
          </View>
          <T.Caption color={Colors.textMuted} style={styles.progressLabel}>
            {readiness.score} of {readiness.total} steps complete &middot; {flowProgressLabel}
          </T.Caption>
        </View>

        {/* ── staged trust reveal ── */}
        <TrustReveal readiness={readiness} mode={listingMode} />

        {/* ── listing type selector ── */}
        <Animated.View entering={FadeInUp.duration(300)} style={{ marginTop: SECTION_GAP }}>
          <SectionHeader step={1} title="Listing type" />
          <View style={styles.typeToggleRow}>
            {(['sell_now', 'co_own', 'auction'] as const).map((t) => {
              const active = listingMode === t;
              const label = t === 'sell_now' ? 'Sell now' : t === 'co_own' ? 'Co-own' : 'Auction';
              const icon = t === 'sell_now' ? 'pricetag-outline' : t === 'co_own' ? 'people-outline' : 'hammer-outline';
              return (
                <AnimatedPressable
                  key={t}
                  style={[styles.typeTogglePill, active && styles.typeTogglePillActive]}
                  onPress={() => { setListingMode(t); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Ionicons name={icon as any} size={16} color={active ? '#fff' : Colors.textMuted} style={{ marginRight: 6 }} />
                  <T.Caption color={active ? '#fff' : Colors.textPrimary} style={active ? { fontWeight: '700' } : {}}>
                    {label}
                  </T.Caption>
                </AnimatedPressable>
              );
            })}
          </View>
        </Animated.View>

        {/* ═══════ SECTION 1 — MEDIA FIRST ═══════ */}
        <Animated.View entering={FadeInUp.duration(300)} layout={Layout.springify()} style={{ marginTop: SECTION_GAP }}>
          <SectionHeader step={2} title="Photos" subtitle="First photo is your cover" />

          <View style={styles.mediaTrustBanner}>
            <Ionicons name="cube-outline" size={16} color={Colors.brand} />
            <T.Caption color={Colors.textSecondary} style={{ flex: 1 }}>
              Your photos are uploaded securely. Add up to 10 images for the best results.
            </T.Caption>
          </View>

          {photos.length === 0 ? (
            <View style={[styles.mediaEmptyCard, styles.mediaEmptyInner]}>
              <View style={styles.mediaEmptyIconCircle}>
                <Ionicons name="camera" size={32} color={Colors.brand} />
              </View>
              <T.BodyEmphasis style={styles.mediaEmptyTitle}>Add photos to get started</T.BodyEmphasis>
              <T.Caption color={Colors.textMuted} style={styles.mediaEmptySub}>
                Adding more photos helps buyers see details
              </T.Caption>
              <View style={styles.mediaEmptyActions}>
                <AnimatedPressable style={styles.mediaActionBtn} onPress={handlePickFromCamera}>
                  <Ionicons name="camera-outline" size={22} color={Colors.brand} />
                  <T.Caption color={Colors.textMuted} style={{ marginTop: 6 }}>Camera</T.Caption>
                </AnimatedPressable>
                <View style={{ width: 16 }} />
                <AnimatedPressable style={styles.mediaActionBtn} onPress={handlePickFromLibrary}>
                  <Ionicons name="images-outline" size={22} color={Colors.brand} />
                  <T.Caption color={Colors.textMuted} style={{ marginTop: 6 }}>Gallery</T.Caption>
                </AnimatedPressable>
              </View>
              {errors.photos ? (
                <T.Caption color={Colors.danger} style={{ marginTop: 12 }}>{errors.photos}</T.Caption>
              ) : null}
            </View>
          ) : (
            <View>
              <Animated.View entering={ZoomIn.springify().dampingRatio(0.6).stiffness(200)} style={styles.heroWrap}>
                <Image source={{ uri: photos[0] }} style={styles.heroImage as any} resizeMode="cover" />
                <View style={styles.heroCoverBadge}>
                  <T.CaptionEmphasis color="#fff" style={{ fontSize: 10 }}>COVER</T.CaptionEmphasis>
                </View>
                <AnimatedPressable style={styles.heroRemoveBtn} onPress={() => removePhoto(0)}>
                  <Ionicons name="close-circle" size={24} color="#fff" />
                </AnimatedPressable>
              </Animated.View>

              <View style={{ marginTop: 12 }}>
                <SortablePhotoStrip photos={photos} onReorder={setPhotos} onAddPhoto={handlePickFromLibrary} />
              </View>

              {errors.photos ? (
                <T.Caption color={Colors.danger} style={{ marginTop: 8, marginLeft: 4 }}>{errors.photos}</T.Caption>
              ) : null}

              <TrustChip text="Listings with 3+ photos get more views" icon="images-outline" />
            </View>
          )}
        </Animated.View>

        {/* ═══════ SECTION 2 — CORE PRODUCT IDENTITY ═══════ */}
        <Animated.View entering={FadeInUp.delay(100).duration(300)} style={{ marginTop: SECTION_GAP }}>
          <SectionHeader step={3} title="What are you selling?" />
          <ElevatedSurface variant="surface" style={[styles.identityCard, { marginBottom: 0 }]}>
            <AppInput
              label="Title"
              placeholder="e.g. Vintage Levi's 501 Denim Jacket"
              value={title}
              onChangeText={(t) => { setTitle(t); if (errors.title) setErrors((p) => ({ ...p, title: '' })); }}
              errorText={errors.title}
              containerStyle={{ marginBottom: INNER_GAP }}
            />

            <AnimatedPressable
              style={[styles.selectorRow, errors.category ? { borderColor: Colors.danger } : {}]}
              onPress={() => setPickerMode('Category')}
            >
              <View style={styles.selectorRowInner}>
                <Ionicons name="grid-outline" size={18} color={Colors.textMuted} />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <T.Caption color={Colors.textMuted}>Category</T.Caption>
                  <T.Body color={category ? Colors.textPrimary : Colors.textMuted}>
                    {category || 'Select category'}
                  </T.Body>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </AnimatedPressable>
            {errors.category ? (
              <T.Caption color={Colors.danger} style={{ marginTop: 4, marginBottom: INNER_GAP }}>{errors.category}</T.Caption>
            ) : (
              <View style={{ height: INNER_GAP }} />
            )}

            <T.Caption color={Colors.textMuted} style={{ marginBottom: 8 }}>Condition</T.Caption>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.pillRow}>
                {CONDITION_OPTIONS.map((opt) => {
                  const active = condition === opt;
                  return (
                    <AnimatedPressable
                      key={opt}
                      style={[styles.conditionPill, active && { backgroundColor: Colors.brand, borderColor: Colors.brand }]}
                      onPress={() => { setCondition(opt); setErrors((p) => ({ ...p, condition: '' })); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    >
                      <T.Caption color={active ? '#fff' : Colors.textPrimary} style={active ? { fontWeight: '700' } : {}}>
                        {opt}
                      </T.Caption>
                    </AnimatedPressable>
                  );
                })}
              </View>
            </ScrollView>
            {errors.condition ? (
              <T.Caption color={Colors.danger} style={{ marginTop: 6 }}>{errors.condition}</T.Caption>
            ) : null}

            <TrustChip text="Buyers filter by condition — be honest" icon="shield-checkmark-outline" />
          </ElevatedSurface>
        </Animated.View>

        {/* ═══════ SECTION 3 — MODE-SPECIFIC PRICING ═══════ */}
        {listingMode === 'sell_now' && (
          <Animated.View entering={FadeInUp.delay(200).duration(300)} style={{ marginTop: SECTION_GAP }}>
            <SectionHeader step={4} title="Pricing" />
            <Animated.View style={[styles.pricingWrap, priceFocusStyle]}>
              <ElevatedSurface variant="surface" style={[styles.pricingCard, { marginBottom: 0 }]}>
                <View style={styles.priceInputWrap}>
                  <T.Headline color={Colors.textMuted} style={styles.priceCurrency}>{currencySymbol}</T.Headline>
                  <TextInput
                    style={styles.priceInput}
                    placeholder="0"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="decimal-pad"
                    value={price}
                    onChangeText={(t) => { handlePriceChange(t); setErrors((p) => ({ ...p, price: '' })); }}
                    onFocus={() => { priceScale.value = withSpring(1.02, { damping: 12 }); }}
                    onBlur={() => { priceScale.value = withSpring(1, { damping: 12 }); }}
                    maxLength={8}
                  />
                </View>
                {errors.price ? (
                  <T.Caption color={Colors.danger} style={{ marginTop: 8 }}>{errors.price}</T.Caption>
                ) : null}

                <View style={styles.originalPriceRow}>
                  <AppInput
                    label="Original price (optional)"
                    placeholder="0"
                    prefix={currencySymbol}
                    keyboardType="decimal-pad"
                    value={originalPrice}
                    onChangeText={(t) => setOriginalPrice(sanitizeDecimalInput(t))}
                    containerStyle={{ flex: 1 }}
                  />
                  {hasDiscount && (
                    <View style={styles.discountBadge}>
                      <T.Caption color="#fff" style={{ fontWeight: '700' }}>-{discountPercent}%</T.Caption>
                    </View>
                  )}
                </View>

                <TrustChip text="Research similar listings to price competitively" icon="trending-up-outline" />
              </ElevatedSurface>
            </Animated.View>
          </Animated.View>
        )}

        {listingMode === 'co_own' && (
          <Animated.View entering={FadeInUp.delay(200).duration(300)} style={{ marginTop: SECTION_GAP }}>
            <SectionHeader step={4} title="Valuation & Shares" />
            <Animated.View style={[styles.pricingWrap, priceFocusStyle]}>
              <ElevatedSurface variant="surface" style={[styles.pricingCard, { marginBottom: 0 }]}>
                <View style={styles.coOwnTopRow}>
                  <View style={{ flex: 1 }}>
                    <T.BodyEmphasis>Tokenize this item</T.BodyEmphasis>
                    <T.Caption color={Colors.textSecondary}>
                      Create fractional shares for the Co-Own marketplace.
                    </T.Caption>
                  </View>
                  <View style={[styles.togglePill, styles.togglePillActive]}>
                    <T.Caption color="#fff" style={{ fontWeight: '700' }}>On</T.Caption>
                  </View>
                </View>

                <>
                    <View style={styles.priceInputWrap}>
                      <T.Headline color={Colors.textMuted} style={styles.priceCurrency}>{currencySymbol}</T.Headline>
                      <TextInput
                        style={styles.priceInput}
                        placeholder="Total valuation"
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="decimal-pad"
                        value={price}
                        onChangeText={(t) => { handlePriceChange(t); setErrors((p) => ({ ...p, price: '' })); }}
                        onFocus={() => { priceScale.value = withSpring(1.02, { damping: 12 }); }}
                        onBlur={() => { priceScale.value = withSpring(1, { damping: 12 }); }}
                        maxLength={8}
                      />
                    </View>
                    {errors.price ? (
                      <T.Caption color={Colors.danger} style={{ marginTop: 8 }}>{errors.price}</T.Caption>
                    ) : null}

                    <AppInput
                      label="Share count"
                      placeholder="20"
                      keyboardType="number-pad"
                      value={shareCountInput}
                      onChangeText={(t) => { handleShareCountChange(t); setErrors((p) => ({ ...p, shareCount: '' })); }}
                      errorText={errors.shareCount}
                      helperText="Maximum 20 units per co-own"
                      containerStyle={{ marginTop: INNER_GAP }}
                    />

                    <AppInput
                      label={`Initial share price (${currency.currencyCode})`}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      prefix={currencySymbol}
                      value={sharePriceInput}
                      onChangeText={(t) => { setSharePriceInput(sanitizeDecimalInput(t)); setErrors((p) => ({ ...p, sharePrice: '' })); }}
                      errorText={errors.sharePrice}
                      containerStyle={{ marginTop: INNER_GAP }}
                    />

                    {Number(price) > 0 && Number(shareCountInput) > 0 && (
                      <Animated.View entering={FadeInUp.duration(250)} style={styles.sharePriceRow}>
                        <T.Caption color={Colors.textMuted}>Price per share</T.Caption>
                        <T.BodyEmphasis color={Colors.brand}>
                          {currencySymbol}{(Number(price) / Number(shareCountInput)).toFixed(2)}
                        </T.BodyEmphasis>
                      </Animated.View>
                    )}

                    <T.Caption color={Colors.textMuted} style={{ marginTop: INNER_GAP, marginBottom: 8 }}>Offering window</T.Caption>
                    <View style={styles.toggleRow}>
                      {[24, 48, 72, 168].map((h) => {
                        const active = offeringWindowHours === h;
                        return (
                          <AnimatedPressable
                            key={h}
                            style={[styles.togglePill, active && styles.togglePillActive]}
                            onPress={() => setOfferingWindowHours(h)}
                          >
                            <T.Caption color={active ? '#fff' : Colors.textPrimary} style={active ? { fontWeight: '700' } : {}}>
                              {h < 72 ? `${h}h` : `${h / 24}d`}
                            </T.Caption>
                          </AnimatedPressable>
                        );
                      })}
                    </View>
                    {errors.authPhotos ? (
                      <T.Caption color={Colors.danger} style={{ marginTop: 8 }}>{errors.authPhotos}</T.Caption>
                    ) : null}
                  </>

                <TrustChip text="Clear valuation builds investor confidence" icon="shield-checkmark-outline" />
              </ElevatedSurface>
            </Animated.View>
          </Animated.View>
        )}

        {listingMode === 'auction' && (
          <Animated.View entering={FadeInUp.delay(200).duration(300)} style={{ marginTop: SECTION_GAP }}>
            <SectionHeader step={4} title="Auction Setup" />
            <Animated.View style={[styles.pricingWrap, priceFocusStyle]}>
              <ElevatedSurface variant="surface" style={[styles.pricingCard, { marginBottom: 0 }]}>
                <View style={styles.priceInputWrap}>
                  <T.Headline color={Colors.textMuted} style={styles.priceCurrency}>{currencySymbol}</T.Headline>
                  <TextInput
                    style={styles.priceInput}
                    placeholder="Starting bid"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="decimal-pad"
                    value={startingBid}
                    onChangeText={(t) => { setStartingBid(sanitizeDecimalInput(t)); setErrors((p) => ({ ...p, startingBid: '' })); }}
                    onFocus={() => { priceScale.value = withSpring(1.02, { damping: 12 }); }}
                    onBlur={() => { priceScale.value = withSpring(1, { damping: 12 }); }}
                    maxLength={8}
                  />
                </View>
                {errors.startingBid ? (
                  <T.Caption color={Colors.danger} style={{ marginTop: 8 }}>{errors.startingBid}</T.Caption>
                ) : null}

                <AppInput
                  label="Reserve price (optional)"
                  placeholder="0"
                  prefix={currencySymbol}
                  keyboardType="decimal-pad"
                  value={reservePrice}
                  onChangeText={(t) => setReservePrice(sanitizeDecimalInput(t))}
                  containerStyle={{ marginTop: INNER_GAP }}
                />

                <T.Caption color={Colors.textMuted} style={{ marginTop: INNER_GAP, marginBottom: 8 }}>Duration</T.Caption>
                <View style={styles.toggleRow}>
                  {AUCTION_DURATIONS.map((h) => {
                    const active = auctionDurationHours === h;
                    return (
                      <AnimatedPressable
                        key={h}
                        style={[styles.togglePill, active && styles.togglePillActive]}
                        onPress={() => setAuctionDurationHours(h)}
                      >
                        <T.Caption color={active ? '#fff' : Colors.textPrimary} style={active ? { fontWeight: '700' } : {}}>
                          {h < 72 ? `${h}h` : `${h / 24}d`}
                        </T.Caption>
                      </AnimatedPressable>
                    );
                  })}
                </View>

                <TrustChip text="Low starting bids drive more competitive bidding" icon="trending-up-outline" />
              </ElevatedSurface>
            </Animated.View>
          </Animated.View>
        )}

        {/* ═══════ SECTION 4 — DETAILS ═══════ */}
        <Animated.View entering={FadeInUp.delay(300).duration(300)} style={{ marginTop: SECTION_GAP }}>
          <SectionHeader step={5} title="Details" subtitle="Help buyers find your item" />
          <ElevatedSurface variant="surface" style={[styles.detailsCard, { marginBottom: 0 }]}>
            <AppInput
              label="Description"
              placeholder="Describe the fit, fabric, flaws, and why you love it..."
              multiline
              numberOfLines={4}
              value={desc}
              onChangeText={(t) => { setDesc(t); setErrors((p) => ({ ...p, description: '' })); }}
              errorText={errors.description}
              containerStyle={{ marginBottom: INNER_GAP }}
            />

            <T.Caption color={Colors.textMuted} style={{ marginBottom: 8 }}>
              Tags (press space or comma to add)
            </T.Caption>
            <View style={styles.tagWrap}>
              {tags.map((t) => (
                <View key={t} style={styles.tagChip}>
                  <T.Caption color={Colors.brand}>#{t}</T.Caption>
                  <Pressable onPress={() => removeTag(t)} hitSlop={8}>
                    <Ionicons name="close" size={14} color={Colors.textMuted} />
                  </Pressable>
                </View>
              ))}
              <TextInput
                style={styles.tagInput}
                placeholder={tags.length === 0 ? 'vintage, denim, oversized...' : ''}
                placeholderTextColor={Colors.textMuted}
                value={tagInput}
                onChangeText={setTagInput}
                onSubmitEditing={handleTagSubmit}
                blurOnSubmit={false}
                returnKeyType="done"
              />
            </View>

            <AnimatedPressable style={[styles.selectorRow, { marginTop: INNER_GAP }]} onPress={() => setPickerMode('Brand')}>
              <View style={styles.selectorRowInner}>
                <Ionicons name="pricetag-outline" size={18} color={Colors.textMuted} />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <T.Caption color={Colors.textMuted}>Brand</T.Caption>
                  <T.Body color={brand ? Colors.textPrimary : Colors.textMuted}>{brand || 'Select brand'}</T.Body>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </AnimatedPressable>

            <AnimatedPressable style={[styles.selectorRow, errors.size ? { borderColor: Colors.danger } : {}, { marginTop: 12 }]} onPress={() => setPickerMode('Size')}>
              <View style={styles.selectorRowInner}>
                <Ionicons name="resize-outline" size={18} color={Colors.textMuted} />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <T.Caption color={Colors.textMuted}>Size</T.Caption>
                  <T.Body color={size ? Colors.textPrimary : Colors.textMuted}>{size || 'Select size'}</T.Body>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </AnimatedPressable>
            {errors.size ? (
              <T.Caption color={Colors.danger} style={{ marginTop: 4 }}>{errors.size}</T.Caption>
            ) : null}
          </ElevatedSurface>
        </Animated.View>

        {/* ═══════ SECTION 5 — DELIVERY / SHIPPING ═══════ */}
        <Animated.View entering={FadeInUp.delay(400).duration(300)} style={{ marginTop: SECTION_GAP }}>
          <SectionHeader step={6} title="Delivery" />
          <ElevatedSurface variant="surface" style={[styles.deliveryCard, { marginBottom: 0 }]}>
            <T.Caption color={Colors.textMuted} style={{ marginBottom: 10 }}>Shipping method</T.Caption>
            <View style={styles.toggleRow}>
              {(['standard', 'express'] as const).map((m) => {
                const active = shippingMethod === m;
                return (
                  <AnimatedPressable
                    key={m}
                    style={[styles.togglePill, active && styles.togglePillActive]}
                    onPress={() => { setShippingMethod(m); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  >
                    <Ionicons name={m === 'standard' ? 'cube-outline' : 'rocket-outline'} size={16} color={active ? '#fff' : Colors.textMuted} style={{ marginRight: 6 }} />
                    <T.Caption color={active ? '#fff' : Colors.textPrimary} style={active ? { fontWeight: '700' } : {}}>
                      {m === 'standard' ? 'Standard' : 'Express'}
                    </T.Caption>
                  </AnimatedPressable>
                );
              })}
            </View>

            <T.Caption color={Colors.textMuted} style={{ marginTop: INNER_GAP, marginBottom: 10 }}>Who pays for shipping?</T.Caption>
            <View style={styles.toggleRow}>
              {(['buyer', 'seller'] as const).map((p) => {
                const active = shippingPayer === p;
                return (
                  <AnimatedPressable
                    key={p}
                    style={[styles.togglePill, active && styles.togglePillActive]}
                    onPress={() => { setShippingPayer(p); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  >
                    <Ionicons name={p === 'buyer' ? 'person-outline' : 'storefront-outline'} size={16} color={active ? '#fff' : Colors.textMuted} style={{ marginRight: 6 }} />
                    <T.Caption color={active ? '#fff' : Colors.textPrimary} style={active ? { fontWeight: '700' } : {}}>
                      {p === 'buyer' ? 'Buyer pays' : 'I pay (free shipping)'}
                    </T.Caption>
                  </AnimatedPressable>
                );
              })}
            </View>

            <TrustChip text="Free shipping can help your listing stand out" icon="flash-outline" />
          </ElevatedSurface>
        </Animated.View>

        {/* ═══════ SECTION 6 — MODE-SPECIFIC PREVIEW EVOLUTION ═══════ */}
        <Animated.View entering={FadeInUp.delay(500).duration(300)} style={{ marginTop: SECTION_GAP }}>
          <SectionHeader step={listingMode === 'sell_now' ? 5 : listingMode === 'co_own' ? 6 : 6} title="Preview" subtitle={listingMode === 'sell_now' ? 'This is how buyers will see your listing' : listingMode === 'co_own' ? 'Investors will see this proposal' : 'Bidders will see this auction'} />

          {listingMode === 'sell_now' && (
            <ElevatedSurface variant="surface" style={[styles.previewCard, { marginBottom: 0 }]}>
              <View style={styles.previewFeedCard}>
                <View style={styles.previewImageWrap}>
                  {photos.length > 0 ? (
                    <Animated.View entering={ZoomIn.springify().dampingRatio(0.7)}>
                      <Image source={{ uri: photos[0] }} style={styles.previewImage as any} resizeMode="cover" />
                    </Animated.View>
                  ) : (
                    <View style={[styles.previewImage, { backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center' }]}>
                      <Ionicons name="image-outline" size={40} color={Colors.textMuted} />
                    </View>
                  )}
                  {condition ? (
                    <Animated.View entering={SlideInRight.springify().dampingRatio(0.7)} style={styles.previewConditionBadge}>
                      <T.Caption color="#fff" style={{ fontSize: 10, fontWeight: '700' }}>{condition}</T.Caption>
                    </Animated.View>
                  ) : null}
                  {hasDiscount ? (
                    <Animated.View entering={SlideInRight.springify().dampingRatio(0.7)} style={[styles.previewConditionBadge, styles.previewDiscountBadge]}>
                      <T.Caption color="#fff" style={{ fontSize: 10, fontWeight: '700' }}>-{discountPercent}%</T.Caption>
                    </Animated.View>
                  ) : null}
                </View>

                <View style={styles.previewInfo}>
                  <View style={styles.previewPriceRow}>
                    {price ? (
                      <Animated.View entering={FadeInUp.springify().dampingRatio(0.7)}>
                        <T.BodyEmphasis color={Colors.textPrimary}>{currencySymbol}{price}</T.BodyEmphasis>
                      </Animated.View>
                    ) : (
                      <T.BodyEmphasis color={Colors.textPrimary}>{currencySymbol}0</T.BodyEmphasis>
                    )}
                    {hasDiscount && (
                      <Animated.View entering={FadeInUp.springify().dampingRatio(0.7)}>
                        <T.Caption color={Colors.textMuted} style={{ textDecorationLine: 'line-through', marginLeft: 8 }}>
                          {currencySymbol}{originalPrice}
                        </T.Caption>
                      </Animated.View>
                    )}
                  </View>
                  <T.Caption color={Colors.textPrimary} numberOfLines={2} style={{ marginTop: 4 }}>
                    {title || 'Your listing title'}
                  </T.Caption>
                  <View style={styles.previewMetaRow}>
                    {size ? (
                      <Animated.View entering={FadeInUp.springify().dampingRatio(0.8)}>
                        <T.Caption color={Colors.textMuted}>{size}</T.Caption>
                      </Animated.View>
                    ) : null}
                    {brand ? (
                      <Animated.View entering={FadeInUp.springify().dampingRatio(0.8)}>
                        <T.Caption color={Colors.textMuted}>{brand}</T.Caption>
                      </Animated.View>
                    ) : null}
                    <T.Caption color={Colors.textMuted}>{category || 'Category'}</T.Caption>
                  </View>
                </View>
              </View>
            </ElevatedSurface>
          )}

          {listingMode === 'co_own' && (
            <ElevatedSurface variant="surface" style={[styles.previewCard, { marginBottom: 0 }]}>
              <View style={styles.previewFeedCard}>
                <View style={styles.previewImageWrap}>
                  {photos.length > 0 ? (
                    <Animated.View entering={ZoomIn.springify().dampingRatio(0.7)}>
                      <Image source={{ uri: photos[0] }} style={styles.previewImage as any} resizeMode="cover" />
                    </Animated.View>
                  ) : (
                    <View style={[styles.previewImage, { backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center' }]}>
                      <Ionicons name="image-outline" size={40} color={Colors.textMuted} />
                    </View>
                  )}
                  <Animated.View entering={SlideInRight.springify().dampingRatio(0.7)} style={[styles.previewConditionBadge, { backgroundColor: Colors.brand }]}>
                    <T.Caption color="#fff" style={{ fontSize: 10, fontWeight: '700' }}>CO-OWN</T.Caption>
                  </Animated.View>
                </View>

                <View style={styles.previewInfo}>
                  <Animated.View entering={FadeInUp.springify().dampingRatio(0.7)} style={{ marginBottom: 4 }}>
                    <T.Caption color={Colors.textMuted}>Total valuation</T.Caption>
                    <T.Headline color={Colors.textPrimary} style={{ fontSize: 24 }}>
                      {currencySymbol}{price || '0'}
                    </T.Headline>
                  </Animated.View>

                  {Number(price) > 0 && Number(shareCountInput) > 0 && (
                    <Animated.View entering={FadeInUp.springify().dampingRatio(0.8)} style={styles.previewShareRow}>
                      <T.Caption color={Colors.brand} style={{ fontWeight: '700' }}>
                        {shareCountInput} shares @ {currencySymbol}{(Number(price) / Number(shareCountInput)).toFixed(2)} each
                      </T.Caption>
                    </Animated.View>
                  )}

                  <T.Caption color={Colors.textPrimary} numberOfLines={2} style={{ marginTop: 4 }}>
                    {title || 'Your proposal title'}
                  </T.Caption>
                  <View style={styles.previewMetaRow}>
                    {size ? (
                      <Animated.View entering={FadeInUp.springify().dampingRatio(0.85)}>
                        <T.Caption color={Colors.textMuted}>{size}</T.Caption>
                      </Animated.View>
                    ) : null}
                    {brand ? (
                      <Animated.View entering={FadeInUp.springify().dampingRatio(0.85)}>
                        <T.Caption color={Colors.textMuted}>{brand}</T.Caption>
                      </Animated.View>
                    ) : null}
                  </View>
                </View>
              </View>
            </ElevatedSurface>
          )}

          {listingMode === 'auction' && (
            <ElevatedSurface variant="surface" style={[styles.previewCard, { marginBottom: 0 }]}>
              <View style={styles.previewFeedCard}>
                <View style={styles.previewImageWrap}>
                  {photos.length > 0 ? (
                    <Animated.View entering={ZoomIn.springify().dampingRatio(0.7)}>
                      <Image source={{ uri: photos[0] }} style={styles.previewImage as any} resizeMode="cover" />
                    </Animated.View>
                  ) : (
                    <View style={[styles.previewImage, { backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center' }]}>
                      <Ionicons name="image-outline" size={40} color={Colors.textMuted} />
                    </View>
                  )}
                  <Animated.View entering={SlideInRight.springify().dampingRatio(0.7)} style={[styles.previewConditionBadge, { backgroundColor: Colors.danger }]}>
                    <T.Caption color="#fff" style={{ fontSize: 10, fontWeight: '700' }}>AUCTION</T.Caption>
                  </Animated.View>
                </View>

                <View style={styles.previewInfo}>
                  <View style={styles.previewPriceRow}>
                    <Animated.View entering={FadeInUp.springify().dampingRatio(0.7)}>
                      <T.Caption color={Colors.textMuted}>Starting bid</T.Caption>
                      <T.Headline color={Colors.textPrimary} style={{ fontSize: 22 }}>
                        {currencySymbol}{startingBid || '0'}
                      </T.Headline>
                    </Animated.View>
                    {reservePrice ? (
                      <Animated.View entering={FadeInUp.springify().dampingRatio(0.75)} style={{ marginLeft: 12 }}>
                        <T.Caption color={Colors.textMuted}>Reserve</T.Caption>
                        <T.BodyEmphasis color={Colors.textPrimary}>{currencySymbol}{reservePrice}</T.BodyEmphasis>
                      </Animated.View>
                    ) : null}
                  </View>

                  <Animated.View entering={FadeInUp.springify().dampingRatio(0.8)} style={styles.previewBidUrgencyRow}>
                    <Ionicons name="flame-outline" size={14} color={Colors.danger} />
                    <T.Caption color={Colors.danger} style={{ marginLeft: 4 }}>No bids yet — be the first</T.Caption>
                  </Animated.View>

                  <T.Caption color={Colors.textPrimary} numberOfLines={2} style={{ marginTop: 4 }}>
                    {title || 'Your auction title'}
                  </T.Caption>
                  <View style={styles.previewMetaRow}>
                    {condition ? (
                      <Animated.View entering={FadeInUp.springify().dampingRatio(0.85)}>
                        <T.Caption color={Colors.textMuted}>{condition}</T.Caption>
                      </Animated.View>
                    ) : null}
                    {size ? (
                      <Animated.View entering={FadeInUp.springify().dampingRatio(0.85)}>
                        <T.Caption color={Colors.textMuted}>{size}</T.Caption>
                      </Animated.View>
                    ) : null}
                    {brand ? (
                      <Animated.View entering={FadeInUp.springify().dampingRatio(0.85)}>
                        <T.Caption color={Colors.textMuted}>{brand}</T.Caption>
                      </Animated.View>
                    ) : null}
                  </View>
                </View>
              </View>
            </ElevatedSurface>
          )}
        </Animated.View>

        {/* ── bottom spacer for floating CTA ── */}
        <View style={{ height: 100 }} />
        </Animated.ScrollView>
      </KeyboardAvoidingView>

      {/* ── error banner ── */}
      {errorMsg ? (
        <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)} style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={Colors.danger} />
          <T.Caption color={Colors.danger} style={{ marginLeft: 8, flex: 1 }}>{errorMsg}</T.Caption>
        </Animated.View>
      ) : null}

      {/* ── floating publish CTA ── */}
      <Animated.View style={[styles.floatingCtaWrap, shakeStyle, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.floatingCtaRow}>
          <AppButton
            title="Preview"
            variant="secondary"
            size="lg"
            style={styles.previewBtn}
            onPress={() => {
              haptics.press();
              navigation.navigate('ListingPreview', {
                preview: {
                  title: title.trim(),
                  price: Number(sanitizeDecimalInput(price)) || undefined,
                  originalPrice: originalPrice ? Number(sanitizeDecimalInput(originalPrice)) : undefined,
                  brand: brand || undefined,
                  condition: condition || undefined,
                  category: category || undefined,
                  size: size || undefined,
                  description: desc.trim() || undefined,
                  photos,
                  tags,
                  shippingMethod: shippingMethod || undefined,
                  shippingPayer: shippingPayer || undefined,
                },
              });
            }}
          />
          <AppButton
            title={
              isPublishing
                ? listingMode === 'sell_now' ? 'Publishing...' : listingMode === 'co_own' ? 'Sending proposal...' : 'Starting auction...'
                : listingMode === 'sell_now' ? 'Publish listing' : listingMode === 'co_own' ? 'Propose Co-ownership' : 'Start Auction'
            }
            subtitle={readiness.score < readiness.total ? `${readiness.score} of ${readiness.total} complete` : undefined}
            onPress={handlePublish}
            disabled={isPublishing}
            style={styles.publishBtn}
            size="lg"
          />
        </View>
      </Animated.View>

      {/* ── picker ── */}
      <BottomSheetPicker
        visible={pickerMode !== null}
        onClose={() => setPickerMode(null)}
        title={pickerMode ?? ''}
        options={getPickerOptions()}
        selectedValue={getPickerSelected()}
        onSelect={handlePickerSelect}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    marginBottom: 4,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  topBarTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
  },
  progressBarWrap: {
    marginBottom: 8,
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.brand,
    borderRadius: Radius.sm,
  },
  progressLabel: {
    marginTop: 6,
    textAlign: 'right',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sectionHeaderText: {
    flex: 1,
    gap: 2,
  },
  trustChip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 4,
  },

  /* ── listing type ── */
  typeToggleRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 4,
  },
  typeTogglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeTogglePillActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },

  /* ── media ── */
  mediaEmptyCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    marginHorizontal: 4,
  },
  mediaEmptyInner: {
    alignItems: 'center',
    paddingVertical: 36,
  },
  mediaEmptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  mediaEmptyTitle: {
    marginBottom: 6,
    textAlign: 'center',
  },
  mediaEmptySub: {
    textAlign: 'center',
    maxWidth: 240,
    marginBottom: 20,
  },
  mediaEmptyActions: {
    flexDirection: 'row',
  },
  mediaActionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
  },
  heroWrap: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginHorizontal: 4,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: 320,
  } as any,
  heroCoverBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  heroRemoveBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 12,
  },

  /* ── identity ── */
  identityCard: {
    borderRadius: Radius.lg,
    padding: CARD_PADDING,
  },
  selectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  selectorRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 16,
  },
  conditionPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  /* ── pricing ── */
  pricingWrap: {
    marginHorizontal: 4,
  },
  pricingCard: {
    borderRadius: Radius.lg,
    padding: CARD_PADDING,
  },
  priceInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  priceCurrency: {
    fontSize: 32,
    fontFamily: Typography.family.medium,
    marginRight: 8,
  },
  priceInput: {
    fontSize: 48,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    minWidth: 120,
    textAlign: 'center',
    padding: 0,
  },
  originalPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  discountBadge: {
    backgroundColor: Colors.danger,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    alignSelf: 'center',
  },

  /* ── details ── */
  detailsCard: {
    borderRadius: Radius.lg,
    padding: CARD_PADDING,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
  },
  tagInput: {
    flex: 1,
    minWidth: 80,
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    paddingVertical: 6,
  },

  /* ── delivery ── */
  deliveryCard: {
    borderRadius: Radius.lg,
    padding: CARD_PADDING,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  togglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    flex: 1,
    justifyContent: 'center',
  },
  togglePillActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },

  /* ── co-own / auction ── */
  coOwnCard: {
    padding: CARD_PADDING,
  },
  auctionCard: {
    padding: CARD_PADDING,
  },
  coOwnTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: INNER_GAP,
  },
  sharePriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
  },
  previewShareRow: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(0,0,0,0.04)',
    alignSelf: 'flex-start',
  },
  previewBidUrgencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,59,48,0.08)',
    alignSelf: 'flex-start',
  },

  /* ── preview ── */
  previewCard: {
    borderRadius: Radius.lg,
    padding: CARD_PADDING,
  },
  previewFeedCard: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  previewImageWrap: {
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: 220,
  } as any,
  previewConditionBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  previewDiscountBadge: {
    left: 'auto',
    right: 10,
    backgroundColor: Colors.danger,
  },
  previewInfo: {
    padding: 14,
  },
  previewPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewMetaRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },

  /* ── floating CTA ── */
  floatingCtaWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.01)',
  },
  floatingCtaGlow: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.xl,
  },
  floatingCtaRow: {
    flexDirection: 'row',
    gap: Space.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.xl,
    padding: Space.sm,
  },
  previewBtn: {
    flex: 1,
  },
  publishBtn: {
    flex: 1.4,
  },
  errorBanner: {
    position: 'absolute',
    bottom: 86,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    zIndex: 10,
  },

  /* ── staged trust reveal ── */
  trustRevealCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginHorizontal: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  trustRevealScoreRing: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  mediaTrustBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    padding: Space.md,
    marginBottom: Space.md,
    backgroundColor: Colors.surface,
  },
});
