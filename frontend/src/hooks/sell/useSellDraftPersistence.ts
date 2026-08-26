import { useState, useRef, useEffect } from 'react';
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

/**
 * Owns the transient "Saved" indicator state and the draft save/load effects.
 * On mount, restores any persisted draft from the store. On every change to
 * form values, persists the draft and flashes a subtle "Saved" indicator for
 * 1.5s (skipped on initial mount to avoid a false flash during restore).
 */
export function useSellDraftPersistence(
  values: SellDraftPersistenceValues,
  setters: SellDraftPersistenceSetters,
) {
  const sellDraft = useStore((s) => s.sellDraft);
  const updateSellDraft = useStore((s) => s.updateSellDraft);

  const [draftSavedVisible, setDraftSavedVisible] = useState(false);
  const draftSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* -- draft sync on mount -- */
  useEffect(() => {
    if (sellDraft.mediaDraftItems && sellDraft.mediaDraftItems.length > 0) {
      setters.setMediaDraftItems(sellDraft.mediaDraftItems);
      setters.setPhotos(sellDraft.mediaDraftItems.map((m) => m.publicUrl || m.uri));
    } else if (sellDraft.photos) {
      setters.setPhotos(sellDraft.photos);
      setters.setMediaDraftItems(
        sellDraft.photos.map((uri) => ({
          id: makeStableId('draft'),
          uri,
          kind: 'image' as const,
          source: uri.startsWith('http') ? ('remote' as const) : ('local' as const),
          status: uri.startsWith('http') ? ('uploaded' as const) : ('draft' as const),
          publicUrl: uri.startsWith('http') ? uri : undefined,
        }))
      );
    }
    if (sellDraft.title) setters.setTitle(sellDraft.title);
    if (sellDraft.description) setters.setDesc(sellDraft.description);
    if (sellDraft.price) setters.setPrice(sellDraft.price);
    if (sellDraft.originalPrice) setters.setOriginalPrice(sellDraft.originalPrice);
    if (sellDraft.brand) setters.setBrand(sellDraft.brand);
    if (sellDraft.size) setters.setSize(sellDraft.size);
    if (sellDraft.condition) setters.setCondition(sellDraft.condition);
    if (sellDraft.categoryId) setters.setCategory(sellDraft.categoryId);
    if (sellDraft.tags) setters.setTags(sellDraft.tags);
    if (sellDraft.listingMode) setters.setListingMode(sellDraft.listingMode);
    if (sellDraft.shippingMethod) setters.setShippingMethod(sellDraft.shippingMethod);
    if (sellDraft.shippingPayer) setters.setShippingPayer(sellDraft.shippingPayer);
    if (sellDraft.startingBid) setters.setStartingBid(sellDraft.startingBid);
    if (sellDraft.reservePrice) setters.setReservePrice(sellDraft.reservePrice);
    if (sellDraft.auctionDurationHours) setters.setAuctionDurationHours(sellDraft.auctionDurationHours);
    if (sellDraft.coOwnEnabled !== undefined) setters.setCoOwnEnabled(sellDraft.coOwnEnabled);
    if (sellDraft.shareCountInput) setters.setShareCountInput(sellDraft.shareCountInput);
    if (sellDraft.sharePriceInput) setters.setSharePriceInput(sellDraft.sharePriceInput);
    if (sellDraft.offeringWindowHours) setters.setOfferingWindowHours(sellDraft.offeringWindowHours);
    if (sellDraft.authPhotos) setters.setAuthPhotos(sellDraft.authPhotos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -- persist draft on change -- */
  const isInitialMountRef = useRef(true);
  useEffect(() => {
    updateSellDraft({
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
    });
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
