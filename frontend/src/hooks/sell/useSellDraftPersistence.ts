import { useState, useRef, useEffect, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { makeStableId } from '../../utils/createStableId';
import type { ListingMediaDraftItem } from '../../utils/mediaUploadAsset';
import type { ListingMode } from '../../components/listing/ListingModeSelector';

interface SellDraftPersistenceValues {
  photos: string[];
  mediaDraftItems: ListingMediaDraftItem[];
  title: string;
  desc: string;
  price: string;
  originalPrice: string;
  brand: string;
  size: string;
  condition: string;
  category: string;
  tags: string[];
  listingMode: ListingMode;
  shippingMethod: 'standard' | 'express' | null;
  shippingPayer: 'buyer' | 'seller' | null;
  startingBid: string;
  reservePrice: string;
  auctionDurationHours: number;
  coOwnEnabled: boolean;
  shareCountInput: string;
  sharePriceInput: string;
  offeringWindowHours: number;
  authPhotos: string[];
}

interface SellDraftPersistenceSetters {
  setMediaDraftItems: React.Dispatch<React.SetStateAction<ListingMediaDraftItem[]>>;
  setPhotos: React.Dispatch<React.SetStateAction<string[]>>;
  setTitle: React.Dispatch<React.SetStateAction<string>>;
  setDesc: React.Dispatch<React.SetStateAction<string>>;
  setPrice: React.Dispatch<React.SetStateAction<string>>;
  setOriginalPrice: React.Dispatch<React.SetStateAction<string>>;
  setBrand: React.Dispatch<React.SetStateAction<string>>;
  setSize: React.Dispatch<React.SetStateAction<string>>;
  setCondition: React.Dispatch<React.SetStateAction<string>>;
  setCategory: React.Dispatch<React.SetStateAction<string>>;
  setTags: React.Dispatch<React.SetStateAction<string[]>>;
  setListingMode: React.Dispatch<React.SetStateAction<ListingMode>>;
  setShippingMethod: React.Dispatch<React.SetStateAction<'standard' | 'express' | null>>;
  setShippingPayer: React.Dispatch<React.SetStateAction<'buyer' | 'seller' | null>>;
  setStartingBid: React.Dispatch<React.SetStateAction<string>>;
  setReservePrice: React.Dispatch<React.SetStateAction<string>>;
  setAuctionDurationHours: React.Dispatch<React.SetStateAction<number>>;
  setCoOwnEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setShareCountInput: React.Dispatch<React.SetStateAction<string>>;
  setSharePriceInput: React.Dispatch<React.SetStateAction<string>>;
  setOfferingWindowHours: React.Dispatch<React.SetStateAction<number>>;
  setAuthPhotos: React.Dispatch<React.SetStateAction<string[]>>;
}

type DraftStoreShape = Record<string, unknown>;

const DRAFT_FIELD_KEYS = [
  'title',
  'desc',
  'price',
  'originalPrice',
  'brand',
  'size',
  'condition',
  'category',
  'tags',
  'listingMode',
  'shippingMethod',
  'shippingPayer',
  'startingBid',
  'reservePrice',
  'auctionDurationHours',
  'coOwnEnabled',
  'shareCountInput',
  'sharePriceInput',
  'offeringWindowHours',
  'authPhotos',
] as const;

type DraftFieldKey = (typeof DRAFT_FIELD_KEYS)[number];

/** Store key → local values key (only description/categoryId differ). */
const STORE_KEY_BY_FIELD: Record<DraftFieldKey, string> = {
  title: 'title',
  desc: 'description',
  price: 'price',
  originalPrice: 'originalPrice',
  brand: 'brand',
  size: 'size',
  condition: 'condition',
  category: 'categoryId',
  tags: 'tags',
  listingMode: 'listingMode',
  shippingMethod: 'shippingMethod',
  shippingPayer: 'shippingPayer',
  startingBid: 'startingBid',
  reservePrice: 'reservePrice',
  auctionDurationHours: 'auctionDurationHours',
  coOwnEnabled: 'coOwnEnabled',
  shareCountInput: 'shareCountInput',
  sharePriceInput: 'sharePriceInput',
  offeringWindowHours: 'offeringWindowHours',
  authPhotos: 'authPhotos',
};

function draftSignature(draft: DraftStoreShape): string {
  // Sign only the fields this hook owns — the store draft may carry extra
  // keys written by other surfaces, which must not make this hook's own
  // writes look like external changes.
  const projected: DraftStoreShape = {};
  for (const storeKey of ['photos', 'mediaDraftItems', ...DRAFT_FIELD_KEYS.map((f) => STORE_KEY_BY_FIELD[f])]) {
    if (draft[storeKey] !== undefined) {
      projected[storeKey] = draft[storeKey];
    }
  }
  return JSON.stringify(projected);
}

/**
 * Owns the transient "Saved" indicator state and the draft save/load effects.
 *
 * Restore semantics: the persisted draft is applied on mount, and while the
 * screen stays mounted the hook subscribes to the store slice so external
 * draft writes (e.g. another surface updating the shared sell draft) are
 * picked up without a remount. External updates win ONLY for fields the
 * user has not touched this session — a field is untouched when its current
 * local value still equals the value this hook last persisted.
 */
export function useSellDraftPersistence(
  values: SellDraftPersistenceValues,
  setters: SellDraftPersistenceSetters,
) {
  const sellDraft = useStore((s) => s.sellDraft);
  const updateSellDraft = useStore((s) => s.updateSellDraft);

  const [draftSavedVisible, setDraftSavedVisible] = useState(false);
  const draftSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Signature of the draft this hook last wrote to the store, and the local
  // values snapshot at that moment — together they define "untouched".
  const lastPersistedSigRef = useRef<string | null>(null);
  const lastPersistedValuesRef = useRef<SellDraftPersistenceValues | null>(null);
  const hydratedRef = useRef(false);

  const applyStoreDraft = useMemo(() => {
    const apply = (draft: DraftStoreShape) => {
      const mediaDraftItems = draft.mediaDraftItems as ListingMediaDraftItem[] | undefined;
      const photos = draft.photos as string[] | undefined;
      if (mediaDraftItems && mediaDraftItems.length > 0) {
        setters.setMediaDraftItems(mediaDraftItems);
        setters.setPhotos(mediaDraftItems.map((m) => m.publicUrl || m.uri));
      } else if (photos) {
        setters.setPhotos(photos);
        setters.setMediaDraftItems(
          photos.map((uri) => ({
            id: makeStableId('draft'),
            uri,
            kind: 'image' as const,
            source: uri.startsWith('http') ? ('remote' as const) : ('local' as const),
            status: uri.startsWith('http') ? ('uploaded' as const) : ('draft' as const),
            publicUrl: uri.startsWith('http') ? uri : undefined,
          }))
        );
      }
      if (draft.title) setters.setTitle(draft.title as string);
      if (draft.description) setters.setDesc(draft.description as string);
      if (draft.price) setters.setPrice(draft.price as string);
      if (draft.originalPrice) setters.setOriginalPrice(draft.originalPrice as string);
      if (draft.brand) setters.setBrand(draft.brand as string);
      if (draft.size) setters.setSize(draft.size as string);
      if (draft.condition) setters.setCondition(draft.condition as string);
      if (draft.categoryId) setters.setCategory(draft.categoryId as string);
      if (draft.tags) setters.setTags(draft.tags as string[]);
      if (draft.listingMode) setters.setListingMode(draft.listingMode as ListingMode);
      if (draft.shippingMethod) setters.setShippingMethod(draft.shippingMethod as 'standard' | 'express' | null);
      if (draft.shippingPayer) setters.setShippingPayer(draft.shippingPayer as 'buyer' | 'seller' | null);
      if (draft.startingBid) setters.setStartingBid(draft.startingBid as string);
      if (draft.reservePrice) setters.setReservePrice(draft.reservePrice as string);
      if (draft.auctionDurationHours) setters.setAuctionDurationHours(draft.auctionDurationHours as number);
      if (draft.coOwnEnabled !== undefined) setters.setCoOwnEnabled(draft.coOwnEnabled as boolean);
      if (draft.shareCountInput) setters.setShareCountInput(draft.shareCountInput as string);
      if (draft.sharePriceInput) setters.setSharePriceInput(draft.sharePriceInput as string);
      if (draft.offeringWindowHours) setters.setOfferingWindowHours(draft.offeringWindowHours as number);
      if (draft.authPhotos) setters.setAuthPhotos(draft.authPhotos as string[]);
    };
    return apply;
  // Restore setters are stable useState dispatches; the apply closure is
  // created once so the mount effect and store subscription share it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -- draft restore on mount -- */
  useEffect(() => {
    applyStoreDraft(sellDraft as DraftStoreShape);
    hydratedRef.current = true;
    // Restore runs once on mount; sellDraft at mount time is the persisted draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -- external draft re-sync while mounted -- */
  useEffect(() => {
    if (!hydratedRef.current) return;
    const sig = draftSignature(sellDraft as DraftStoreShape);
    if (sig === lastPersistedSigRef.current) return;
    // The store changed outside this hook's persist effect. Re-apply only
    // fields the user has not edited since the last persist.
    const last = lastPersistedValuesRef.current;
    if (!last) return;
    const draft = sellDraft as DraftStoreShape;
    let hasExternalChange = false;
    // `(v: never) => void` accepts every Dispatch<SetStateAction<T>> by
    // parameter contravariance; the call site casts the store value once.
    const nextSetters: Record<DraftFieldKey, (v: never) => void> = {
      title: setters.setTitle,
      desc: setters.setDesc,
      price: setters.setPrice,
      originalPrice: setters.setOriginalPrice,
      brand: setters.setBrand,
      size: setters.setSize,
      condition: setters.setCondition,
      category: setters.setCategory,
      tags: setters.setTags,
      listingMode: setters.setListingMode,
      shippingMethod: setters.setShippingMethod,
      shippingPayer: setters.setShippingPayer,
      startingBid: setters.setStartingBid,
      reservePrice: setters.setReservePrice,
      auctionDurationHours: setters.setAuctionDurationHours,
      coOwnEnabled: setters.setCoOwnEnabled,
      shareCountInput: setters.setShareCountInput,
      sharePriceInput: setters.setSharePriceInput,
      offeringWindowHours: setters.setOfferingWindowHours,
      authPhotos: setters.setAuthPhotos,
    };
    for (const field of DRAFT_FIELD_KEYS) {
      const storeKey = STORE_KEY_BY_FIELD[field];
      const externalValue = draft[storeKey];
      if (externalValue === undefined) continue;
      const localValue = values[field];
      const persistedValue = last[field];
      const untouched = localValue === persistedValue;
      const differs = externalValue !== persistedValue;
      if (untouched && differs) {
        nextSetters[field](externalValue as never);
        hasExternalChange = true;
      }
    }
    if (hasExternalChange) {
      // Adopt the external signature so this update is not re-applied.
      lastPersistedSigRef.current = sig;
    }
  }, [sellDraft, values, setters]);

  /* -- persist draft on change -- */
  const isInitialMountRef = useRef(true);
  useEffect(() => {
    const patch = {
      photos: values.photos,
      mediaDraftItems: values.mediaDraftItems,
      title: values.title,
      description: values.desc,
      price: values.price,
      originalPrice: values.originalPrice,
      brand: values.brand,
      size: values.size,
      condition: values.condition,
      categoryId: values.category,
      tags: values.tags,
      listingMode: values.listingMode,
      shippingMethod: values.shippingMethod,
      shippingPayer: values.shippingPayer,
      startingBid: values.startingBid,
      reservePrice: values.reservePrice,
      auctionDurationHours: values.auctionDurationHours,
      coOwnEnabled: values.coOwnEnabled,
      shareCountInput: values.shareCountInput,
      sharePriceInput: values.sharePriceInput,
      offeringWindowHours: values.offeringWindowHours,
      authPhotos: values.authPhotos,
    };
    updateSellDraft(patch);
    lastPersistedSigRef.current = draftSignature(patch as DraftStoreShape);
    lastPersistedValuesRef.current = values;
    // Skip the transient flash on initial mount (draft restore) — only
    // show "Saved" when the user actually edits a field.
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    setDraftSavedVisible(true);
    if (draftSavedTimerRef.current) clearTimeout(draftSavedTimerRef.current);
    draftSavedTimerRef.current = setTimeout(() => setDraftSavedVisible(false), 1500);
  }, [values.photos, values.mediaDraftItems, values.title, values.desc, values.price, values.originalPrice, values.brand, values.size, values.condition, values.category, values.tags, values.listingMode, values.shippingMethod, values.shippingPayer, values.startingBid, values.reservePrice, values.auctionDurationHours, values.coOwnEnabled, values.shareCountInput, values.sharePriceInput, values.offeringWindowHours, values.authPhotos, updateSellDraft]);

  // Cleanup the transient timer on unmount
  useEffect(() => {
    return () => {
      if (draftSavedTimerRef.current) clearTimeout(draftSavedTimerRef.current);
    };
  }, []);

  return { draftSavedVisible };
}
