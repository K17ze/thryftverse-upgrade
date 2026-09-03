import { useState, useCallback } from 'react';
import type { ListingMode } from '../../components/listing/ListingModeSelector';

/**
 * Owns the local useState slots for the sell listing form: title, description,
 * price, tags, brand, size, condition, shipping, co-own fields, and auction
 * fields. Returns a flat bag of values, setters, and a reset function so the
 * orchestrator can destructure and use them exactly as inline useState would.
 */
export function useSellFormState() {
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
  const [shippingSheetOpen, setShippingSheetOpen] = useState(false);

  const [listingMode, setListingMode] = useState<ListingMode>('sell_now');

  const [coOwnEnabled, setCoOwnEnabled] = useState(false);
  const [shareCountInput, setShareCountInput] = useState('');
  const [sharePriceInput, setSharePriceInput] = useState('');
  const [offeringWindowHours, setOfferingWindowHours] = useState(48);
  const [authPhotos, setAuthPhotos] = useState<string[]>([]);

  const [startingBid, setStartingBid] = useState('');
  const [reservePrice, setReservePrice] = useState('');
  const [auctionDurationHours, setAuctionDurationHours] = useState(48);

  const reset = useCallback(() => {
    setTitle('');
    setDesc('');
    setPrice('');
    setOriginalPrice('');
    setTags([]);
    setTagInput('');
    setCategory('');
    setBrand('');
    setSize('');
    setCondition('');
    setShippingMethod(null);
    setShippingPayer(null);
    setShippingSheetOpen(false);
    setListingMode('sell_now');
    setCoOwnEnabled(false);
    setShareCountInput('');
    setSharePriceInput('');
    setOfferingWindowHours(48);
    setAuthPhotos([]);
    setStartingBid('');
    setReservePrice('');
    setAuctionDurationHours(48);
  }, []);

  return {
    values: {
      title,
      desc,
      price,
      originalPrice,
      tags,
      tagInput,
      category,
      brand,
      size,
      condition,
      shippingMethod,
      shippingPayer,
      shippingSheetOpen,
      listingMode,
      coOwnEnabled,
      shareCountInput,
      sharePriceInput,
      offeringWindowHours,
      authPhotos,
      startingBid,
      reservePrice,
      auctionDurationHours,
    },
    setters: {
      setTitle,
      setDesc,
      setPrice,
      setOriginalPrice,
      setTags,
      setTagInput,
      setCategory,
      setBrand,
      setSize,
      setCondition,
      setShippingMethod,
      setShippingPayer,
      setShippingSheetOpen,
      setListingMode,
      setCoOwnEnabled,
      setShareCountInput,
      setSharePriceInput,
      setOfferingWindowHours,
      setAuthPhotos,
      setStartingBid,
      setReservePrice,
      setAuctionDurationHours,
    },
    reset,
  };
}
