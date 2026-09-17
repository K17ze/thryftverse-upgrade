import { useState, useCallback, useMemo } from 'react';
import type { ListingApiItem } from '../../services/listingsApi';
import type {
  EditListingFieldValues,
  EditListingPickerMode,
} from '../../components/listing/editListingViewModels';
import { hydrateEditListingFields } from '../../components/listing/editListingViewModels';

/**
 * Owns the local useState slots for the edit-listing form: title, description,
 * price, originalPrice, category, brand, size, condition, shipping and the
 * bottom-sheet picker mode. Mirrors useSellFormState — returns a flat bag of
 * values and setters so the orchestrator destructures and uses them exactly
 * as inline useState would.
 *
 * The four free-text setters (title/price/originalPrice/description) also
 * clear the shared `errorMsg`, matching the original inline onChangeText
 * handlers. Picker selections and shipping toggles intentionally do NOT
 * clear it — preserved from the original screen.
 */
export function useEditListingForm() {
  const [title, setTitleRaw] = useState('');
  const [description, setDescriptionRaw] = useState('');
  const [price, setPriceRaw] = useState('');
  const [originalPrice, setOriginalPriceRaw] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [size, setSize] = useState('');
  const [condition, setCondition] = useState('');
  const [shippingMethod, setShippingMethod] = useState<'standard' | 'express' | null>(null);
  const [shippingPayer, setShippingPayer] = useState<'buyer' | 'seller' | null>(null);
  const [pickerMode, setPickerMode] = useState<EditListingPickerMode>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Text edits invalidate a stale inline error; picker/toggle edits do not.
  const setTitle = useCallback((v: string) => { setTitleRaw(v); setErrorMsg(''); }, []);
  const setDescription = useCallback((v: string) => { setDescriptionRaw(v); setErrorMsg(''); }, []);
  const setPrice = useCallback((v: string) => { setPriceRaw(v); setErrorMsg(''); }, []);
  const setOriginalPrice = useCallback((v: string) => { setOriginalPriceRaw(v); setErrorMsg(''); }, []);

  /** Hydrate every field slot from a freshly fetched listing record. */
  const hydrate = useCallback((l: ListingApiItem) => {
    const f = hydrateEditListingFields(l);
    setTitleRaw(f.title);
    setDescriptionRaw(f.description);
    setPriceRaw(f.price);
    setOriginalPriceRaw(f.originalPrice);
    setCategory(f.category);
    setBrand(f.brand);
    setSize(f.size);
    setCondition(f.condition);
    setShippingMethod(f.shippingMethod);
    setShippingPayer(f.shippingPayer);
  }, []);

  const values: EditListingFieldValues = useMemo(() => ({
    title,
    description,
    price,
    originalPrice,
    category,
    brand,
    size,
    condition,
    shippingMethod,
    shippingPayer }),
  [title, description, price, originalPrice, category, brand, size, condition, shippingMethod, shippingPayer]);

  return {
    values,
    title, setTitle,
    description, setDescription,
    price, setPrice,
    originalPrice, setOriginalPrice,
    category, setCategory,
    brand, setBrand,
    size, setSize,
    condition, setCondition,
    shippingMethod, setShippingMethod,
    shippingPayer, setShippingPayer,
    pickerMode, setPickerMode,
    errorMsg, setErrorMsg,
    hydrate };
}
