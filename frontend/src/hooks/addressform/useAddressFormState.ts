import { useState, useCallback, useRef, useMemo } from 'react';
import { TextInput } from 'react-native';
import {
  buildInitialAddressForm,
  addressFormsEqual,
  validateAddressForm,
  findCountryOption,
  type AddressFormState,
  type AddressFieldErrors,
  type AddressFormSavedAddress,
} from '../../components/addressform/addressFormViewModels';

export interface UseAddressFormStateOptions {
  isEditing: boolean;
  savedAddress: AddressFormSavedAddress | null;
}

/**
 * useAddressFormState — owns the address form's field state, per-field
 * validation, dirty tracking, input focus refs, and the country picker.
 * Keeps AddressFormScreen as a pure orchestrator.
 */
export function useAddressFormState({ isEditing, savedAddress }: UseAddressFormStateOptions) {
  const initialForm = useMemo<AddressFormState>(
    () => buildInitialAddressForm(isEditing, savedAddress),
    [isEditing, savedAddress],
  );

  const [form, setForm] = useState<AddressFormState>(initialForm);
  const [errors, setErrors] = useState<AddressFieldErrors>({});
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const isDirty = !addressFormsEqual(form, initialForm);

  const nameRef = useRef<TextInput>(null);
  const streetRef = useRef<TextInput>(null);
  const apartmentRef = useRef<TextInput>(null);
  const cityRef = useRef<TextInput>(null);
  const regionRef = useRef<TextInput>(null);
  const postalRef = useRef<TextInput>(null);

  const updateField = useCallback(
    <K extends keyof AddressFormState>(key: K, value: AddressFormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => {
        if (!prev[key as keyof AddressFieldErrors]) return prev;
        return { ...prev, [key as keyof AddressFieldErrors]: undefined };
      });
    },
    []
  );

  const validateField = useCallback(
    (field: keyof AddressFieldErrors) => {
      const allErrors = validateAddressForm(form);
      setErrors((prev) => ({
        ...prev,
        [field]: allErrors[field] }));
    },
    [form]
  );

  const handleCountrySelect = useCallback(
    (value: string) => {
      const option = findCountryOption(value);
      if (option) {
        updateField('countryCode', option.code);
        updateField('country', option.name);
      }
    },
    [updateField]
  );

  return {
    form,
    errors,
    setErrors,
    isDirty,
    updateField,
    validateField,
    showCountryPicker,
    setShowCountryPicker,
    handleCountrySelect,
    nameRef,
    streetRef,
    apartmentRef,
    cityRef,
    regionRef,
    postalRef,
  };
}
