import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';

import { CURRENCIES } from '../../constants/currencies';
import { useStore, useIsGuest } from '../../store/useStore';
import { useSignupWall } from '../useSignupWall';
import { useSellerTrust } from '../../platform/product';
import { useCurrencyPref } from '../useCurrencyPref';
import { useToast } from '../../context/ToastContext';
import { useListingAutofill } from '../useListingAutofill';
import { useSoldComps } from '../useSoldComps';
import { useConnectivity } from '../useConnectivity';
import { useOfflineQueue } from '../../lib/offlineQueue';
import { fetchWithAuth, getApiBaseUrl } from '../../lib/apiClient';
import { useBackendData } from '../../context/BackendDataContext';
import { useTaxonomy } from '../../context/TaxonomyContext';
import { useFeatureFlag, trackFunnelStep } from '../../analytics';
import { computeCoOwnPricing } from '../../utils/sellScreenLogic';
import { MediaUploadQueue } from '../../services/mediaUploadQueue';
import type { ListingMediaDraftItem } from '../../utils/mediaUploadAsset';
import type { PickerMode } from '../../utils/sellScreenLogic';
import type { ListingMode } from '../../components/listing/ListingModeSelector';

import { useSellFormState } from './useSellFormState';
import { useSellDraftPersistence } from './useSellDraftPersistence';
import { useTagAutocomplete } from './useTagAutocomplete';

/**
 * Context passed into the data hook from the screen. The screen owns the
 * a11y ref and reduced-motion flag because they are render-coupled; the
 * hook owns everything else.
 */
export interface SellScreenDataContext {
  isGuest: boolean;
}

export interface SellScreenDataResult {
  /** Navigation prop (forwarded so actions can navigate). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  navigation: any;
  /** Store draft patcher (used by picker select + publish). */
  updateSellDraft: (updates: Record<string, unknown>) => void;
  /** Current user (may be null for guests — gated earlier). */
  currentUser: { id: string } | null;

  /** Form field values + setters (owned by useSellFormState). */
  values: ReturnType<typeof useSellFormState>['values'];
  setters: ReturnType<typeof useSellFormState>['setters'];

  /** Tag autocomplete state. */
  tagSuggestions: ReturnType<typeof useTagAutocomplete>['tagSuggestions'];
  tagSuggestionsVisible: boolean;
  setTagSuggestionsVisible: ReturnType<typeof useTagAutocomplete>['setTagSuggestionsVisible'];
  setTagSuggestions: ReturnType<typeof useTagAutocomplete>['setTagSuggestions'];

  /** Photos (URI list, kept in sync with mediaDraftItems). */
  photos: string[];
  setPhotos: React.Dispatch<React.SetStateAction<string[]>>;

  /** Media draft items (rich media objects for the studio). */
  mediaDraftItems: ListingMediaDraftItem[];
  setMediaDraftItems: React.Dispatch<React.SetStateAction<ListingMediaDraftItem[]>>;

  /** Upload queue ref + live queue state. */
  uploadQueueRef: React.MutableRefObject<MediaUploadQueue>;
  queueState: ReturnType<MediaUploadQueue['getState']>;

  /** Inline error state (field-level + banner). */
  errors: Record<string, string>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  errorMsg: string | null;
  setErrorMsg: React.Dispatch<React.SetStateAction<string | null>>;

  /** Picker sheet mode (null = closed). */
  pickerMode: PickerMode;
  setPickerMode: React.Dispatch<React.SetStateAction<PickerMode>>;

  /** Autofill suggestion from first photo filename. */
  autofillSuggestion: ReturnType<typeof useListingAutofill>;
  autofillDismissed: boolean;
  setAutofillDismissed: React.Dispatch<React.SetStateAction<boolean>>;

  /** Photo guide collapse state. */
  photoGuideCollapsed: boolean;
  setPhotoGuideCollapsed: React.Dispatch<React.SetStateAction<boolean>>;

  /** Seller tips dismiss state. */
  sellerTipsDismissed: boolean;
  setSellerTipsDismissed: React.Dispatch<React.SetStateAction<boolean>>;

  /** Transient "Saved" indicator visibility (from draft persistence). */
  draftSavedVisible: boolean;

  /** Currency preference + symbol. */
  currency: ReturnType<typeof useCurrencyPref>;
  currencySymbol: string;

  /** Connectivity state. */
  isOffline: boolean;
  isConnected: boolean | null;

  /** Toast show helper. */
  showToast: ReturnType<typeof useToast>['show'];

  /** Seller trust data + new-seller flag. */
  sellerTrust: ReturnType<typeof useSellerTrust>['data'];
  isNewSeller: boolean;

  /** Sold comparables for pricing guidance. */
  soldComps: ReturnType<typeof useSoldComps>;

  /** Taxonomy picker vocabulary. */
  pickerTaxonomy: {
    category: string[];
    brand: string[];
    size: string[];
    condition: string[];
  };

  /** Feature flag — enhanced AI listing assist banner. */
  aiListingAssistEnabled: boolean;

  /** True when the user has meaningful draft content restored. */
  hasDraftContent: boolean;
}

/**
 * Owns the data domain for the sell screen: form state, draft persistence,
 * tag autocomplete, media/upload queue state, taxonomy, sold comps, seller
 * trust, currency, connectivity, feature flags, and the network-restoration
 * + co-own math effects. The screen delegates all data ownership here so
 * it only has to orchestrate rendering.
 */
export function useSellScreenData(
  ctx: SellScreenDataContext,
): SellScreenDataResult {
  const { isGuest } = ctx;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navigation = useNavigation<any>();
  const { requireAuth } = useSignupWall();

  // Guest gating: creating a listing requires an account. Show the soft
  // signup wall and dismiss the sell screen back to where the user came
  // from. The wall is rendered by the SignupWallProvider at the app root,
  // so it persists after this screen unmounts.
  useEffect(() => {
    if (isGuest) {
      requireAuth('create_listing');
      navigation.goBack();
    } else {
      trackFunnelStep('listing_creation', 'listing_started');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateSellDraft = useStore((s) => s.updateSellDraft);
  const currentUser = useStore((s) => s.currentUser);
  const { data: sellerTrust } = useSellerTrust(currentUser?.id);

  const [photos, setPhotos] = useState<string[]>([]);

  const { values, setters } = useSellFormState();
  const {
    title, desc, price, originalPrice, tags, tagInput, category, brand, size, condition,
    shippingMethod, shippingPayer, shippingSheetOpen, listingMode, coOwnEnabled,
    shareCountInput, sharePriceInput, offeringWindowHours, authPhotos,
    startingBid, reservePrice, auctionDurationHours,
  } = values;
  const {
    setTitle, setDesc, setPrice, setOriginalPrice, setTags, setTagInput, setCategory,
    setBrand, setSize, setCondition, setShippingMethod, setShippingPayer, setShippingSheetOpen,
    setListingMode, setCoOwnEnabled, setShareCountInput, setSharePriceInput, setOfferingWindowHours,
    setAuthPhotos, setStartingBid, setReservePrice, setAuctionDurationHours,
  } = setters;

  const {
    tagSuggestions, tagSuggestionsVisible, setTagSuggestionsVisible, setTagSuggestions,
  } = useTagAutocomplete(tagInput);

  const [pickerMode, setPickerMode] = useState<PickerMode>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [mediaDraftItems, setMediaDraftItems] = useState<ListingMediaDraftItem[]>([]);

  const uploadQueueRef = useRef(new MediaUploadQueue());
  const [queueState, setQueueState] = useState(uploadQueueRef.current.getState());
  useEffect(() => {
    const unsub = uploadQueueRef.current.subscribe((s) => setQueueState(s));
    return () => { unsub(); };
  }, []);

  const currency = useCurrencyPref();
  const currencySymbol = CURRENCIES[currency.currencyCode].symbol;
  const { isOffline, isConnected } = useConnectivity();
  const { show: showToast } = useToast();

  // ── Network-restoration flush ──
  // When the device transitions from offline → online, flush the persisted
  // offline queue so any write mutations the user authored while disconnected
  // (e.g. a listing creation that was queued instead of submitted) are
  // replayed immediately. If any queued items were successfully processed,
  // surface a toast so the user knows their listing has been published.
  const prevConnectedRef = useRef<boolean | null>(null);
  useEffect(() => {
    const wasConnected = prevConnectedRef.current;
    prevConnectedRef.current = isConnected ?? null;

    // Only flush on the false → true transition, not on every connectivity
    // event or the initial null → true seed.
    if (wasConnected === false && isConnected === true) {
      const queue = useOfflineQueue.getState();
      const countBefore = queue.queue.length;
      if (countBefore === 0) return;

      // Replay queued mutations through the same authenticated fetch
      // pipeline used by live requests. The offline queue stores full URLs
      // (baseUrl + path), but `fetchWithAuth` prepends the API base URL
      // itself, so strip the base URL to recover the path. This ensures
      // replayed writes carry a valid Authorization header and benefit from
      // the 401 token-refresh logic — without it, a queued mutation would
      // be sent with no auth header and silently dropped as a 401.
      const apiBaseUrl = getApiBaseUrl();
      queue
        .flushQueue(async (url, init) => {
          const path = typeof url === 'string' && url.startsWith(apiBaseUrl)
            ? url.slice(apiBaseUrl.length)
            : String(url);
          return fetchWithAuth(path, init ?? undefined);
        })
        .then(() => {
          const countAfter = useOfflineQueue.getState().queue.length;
          if (countAfter < countBefore) {
            showToast('Your listing has been published', 'success');
          }
        })
        .catch(() => {
          // Flush failures are non-fatal — the queue retains the items and
          // the exponential-backoff retry logic will try again on the next
          // flush or app foreground.
        });
    }
  }, [isConnected, showToast]);

  // ── Draft persistence (restore on mount, persist on change) ──
  // Owns the transient "Saved" indicator state and the draft save/load
  // effects. Restores any persisted draft from the store on mount, then
  // persists on every change with a subtle 1.5s "Saved" flash.
  const { draftSavedVisible } = useSellDraftPersistence(
    { photos, mediaDraftItems, ...values },
    { setMediaDraftItems, setPhotos, ...setters },
  );

  // AI autofill suggestions from first photo filename
  const autofillSuggestion = useListingAutofill(mediaDraftItems);
  const [autofillDismissed, setAutofillDismissed] = useState(false);
  const [photoGuideCollapsed, setPhotoGuideCollapsed] = useState(true);
  const [sellerTipsDismissed, setSellerTipsDismissed] = useState(false);

  // Feature flag — gates the enhanced AI listing assist banner. Defaults to
  // false (current autofill-only behaviour) when PostHog is not loaded.
  const aiListingAssistEnabled = useFeatureFlag('ai_listing_assist');

  // ── New seller detection ──
  // Per research: new seller tips/guidance if first-time seller.
  // Uses real backend data (completedSales) — no fabricated thresholds.
  const isNewSeller = !sellerTrust?.completedSales || sellerTrust.completedSales === 0;

  // ── Draft content detection ──
  // Shows a "draft in progress" hint when the user has meaningful draft
  // content (at least a title or photos). The draft is auto-restored on
  // mount, so this confirms to the user that their previous work is back.
  const hasDraftContent = useMemo(() =>
    Boolean(title.trim() || mediaDraftItems.length > 0 || price.trim()),
    [title, mediaDraftItems.length, price],
  );

  // Reset dismiss when photos change (new photo -> new suggestions)
  useEffect(() => {
    if (mediaDraftItems.length === 0) {
      setAutofillDismissed(false);
    }
  }, [mediaDraftItems.length]);

  // Sold comparables for pricing guidance -- derived from real backend data
  const { listings: backendListings } = useBackendData();
  const soldComps = useSoldComps(backendListings, category || undefined, brand || undefined);

  // Taxonomy — single source of truth for category/brand/size/condition
  // picker vocabulary. Replaces the per-screen hard-coded arrays that had
  // diverged from the canonical set (audit P2 #25).
  const { categories, conditions, sizes, brands } = useTaxonomy();
  const pickerTaxonomy = useMemo(
    () => ({
      category: categories.filter((n) => n.parentId === null).map((n) => n.name),
      brand: brands.map((n) => n.name),
      size: sizes.map((n) => n.name),
      condition: conditions.map((n) => n.name),
    }),
    [categories, conditions, sizes, brands],
  );

  /* -- co-own bidirectional math -- */
  useEffect(() => {
    if (listingMode !== 'co_own') return;
    const { calculatedPrice, calculatedSharePrice } = computeCoOwnPricing(price, shareCountInput, sharePriceInput);
    if (calculatedPrice !== null && calculatedPrice !== price) {
      setPrice(calculatedPrice);
      return;
    }
    if (calculatedSharePrice !== null && calculatedSharePrice !== sharePriceInput) {
      setSharePriceInput(calculatedSharePrice);
    }
  }, [price, shareCountInput, sharePriceInput, listingMode]);

  useEffect(() => {
    setCoOwnEnabled(listingMode === 'co_own');
  }, [listingMode]);

  return {
    navigation,
    updateSellDraft,
    currentUser,
    values,
    setters,
    tagSuggestions,
    tagSuggestionsVisible,
    setTagSuggestionsVisible,
    setTagSuggestions,
    photos,
    setPhotos,
    mediaDraftItems,
    setMediaDraftItems,
    uploadQueueRef,
    queueState,
    errors,
    setErrors,
    errorMsg,
    setErrorMsg,
    pickerMode,
    setPickerMode,
    autofillSuggestion,
    autofillDismissed,
    setAutofillDismissed,
    photoGuideCollapsed,
    setPhotoGuideCollapsed,
    sellerTipsDismissed,
    setSellerTipsDismissed,
    draftSavedVisible,
    currency,
    currencySymbol,
    isOffline,
    isConnected,
    showToast,
    sellerTrust,
    isNewSeller,
    soldComps,
    pickerTaxonomy,
    aiListingAssistEnabled,
    hasDraftContent,
  };
}
