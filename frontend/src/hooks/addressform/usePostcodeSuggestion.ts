import { useCallback, useMemo } from 'react';
import { useHaptic } from '../useHaptic';
import {
  derivePostcodeSuggestion,
  type AddressFormState,
} from '../../components/addressform/addressFormViewModels';

/**
 * usePostcodeSuggestion — derives the UK postcode autocomplete hint from
 * the current form and applies it (city/region, plus GB country when the
 * user hasn't picked one yet).
 */
export function usePostcodeSuggestion(
  form: AddressFormState,
  updateField: <K extends keyof AddressFormState>(key: K, value: AddressFormState[K]) => void,
) {
  const haptic = useHaptic();
  const { postalCode, city, region, countryCode } = form;

  const postcodeSuggestion = useMemo(
    () => derivePostcodeSuggestion({ postalCode, city, region, countryCode }),
    [postalCode, city, region, countryCode],
  );

  const applyPostcodeSuggestion = useCallback(() => {
    if (!postcodeSuggestion) return;
    haptic.light();
    updateField('city', postcodeSuggestion.city);
    updateField('region', postcodeSuggestion.region);
    if (!form.countryCode) {
      updateField('countryCode', 'GB');
      updateField('country', 'United Kingdom');
    }
  }, [postcodeSuggestion, updateField, haptic, form.countryCode]);

  return { postcodeSuggestion, applyPostcodeSuggestion };
}
