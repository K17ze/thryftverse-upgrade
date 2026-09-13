import { useState, useCallback, type MutableRefObject, type Dispatch, type SetStateAction, type RefObject } from 'react';
import { Keyboard, TextInput } from 'react-native';
import { useToast } from '../../context/ToastContext';
import { useStore } from '../../store/useStore';
import { useHaptic } from '../useHaptic';
import {
  createUserAddress,
  deleteUserAddress,
  type CreateAddressInput } from '../../services/commerceApi';
import {
  normaliseAddressForm,
  validateAddressForm,
  type AddressFormState,
  type AddressFieldErrors,
  type AddressFormSavedAddress,
} from '../../components/addressform/addressFormViewModels';

/** Config for the shared ConfirmationSheet — discard + remove flows. */
export interface AddressConfirmSheetConfig {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  variant: 'default' | 'danger';
}

export interface UseAddressFormActionsOptions {
  isEditing: boolean;
  savedAddress: AddressFormSavedAddress | null;
  form: AddressFormState;
  setErrors: Dispatch<SetStateAction<AddressFieldErrors>>;
  /** First-invalid-field focus targets, keyed by error field name. */
  fieldRefs: Partial<Record<keyof AddressFieldErrors, RefObject<TextInput | null>>>;
  /** Set true to let the next navigation proceed without a discard prompt. */
  allowNavigationRef: MutableRefObject<boolean>;
  setConfirmSheet: Dispatch<SetStateAction<AddressConfirmSheetConfig>>;
  goBack: () => void;
}

/**
 * useAddressFormActions — owns the save/remove submission flow:
 * validation gate, first-error focus, create-then-delete edit swap,
 * store sync, toasts and haptics.
 */
export function useAddressFormActions({
  isEditing,
  savedAddress,
  form,
  setErrors,
  fieldRefs,
  allowNavigationRef,
  setConfirmSheet,
  goBack,
}: UseAddressFormActionsOptions) {
  const saveAddress = useStore((state) => state.saveAddress);
  const clearSavedAddress = useStore((state) => state.clearSavedAddress);
  const currentUser = useStore((state) => state.currentUser);
  const { show } = useToast();
  const haptic = useHaptic();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    Keyboard.dismiss();
    const allErrors = validateAddressForm(form);
    setErrors(allErrors);

    if (Object.keys(allErrors).length > 0) {
      haptic.light();
      const firstErrorField = Object.keys(allErrors)[0] as keyof AddressFieldErrors;
      fieldRefs[firstErrorField]?.current?.focus();
      return;
    }

    const normalised = normaliseAddressForm(form);
    const userId = currentUser?.id;
    if (!userId) {
      setSaveError('You must be signed in to save an address.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    const addressInput: CreateAddressInput = {
      name: normalised.name,
      streetAddress: normalised.streetAddress,
      apartment: normalised.apartment || undefined,
      city: normalised.city,
      region: normalised.region || undefined,
      postalCode: normalised.postalCode,
      countryCode: normalised.countryCode,
      country: normalised.country,
      isDefault: normalised.isDefault };

    try {
      if (isEditing && savedAddress?.id !== undefined) {
        // Edit: create replacement, then delete old (no PATCH available)
        const created = await createUserAddress(userId, addressInput);

        // Try to delete the old address
        let oldDeleteFailed = false;
        try {
          await deleteUserAddress(userId, savedAddress.id);
        } catch {
          oldDeleteFailed = true;
        }

        saveAddress({
          id: created.id,
          name: created.name,
          streetAddress: created.streetAddress,
          apartment: created.apartment,
          city: created.city,
          region: created.region,
          postalCode: created.postalCode,
          countryCode: created.countryCode,
          country: created.country,
          isDefault: created.isDefault });

        haptic.medium();
        if (oldDeleteFailed) {
          show('New address saved. The previous address could not be removed.', 'info');
        } else {
          show('Delivery address updated', 'success');
        }
      } else {
        // Add: create new backend address
        const created = await createUserAddress(userId, addressInput);

        saveAddress({
          id: created.id,
          name: created.name,
          streetAddress: created.streetAddress,
          apartment: created.apartment,
          city: created.city,
          region: created.region,
          postalCode: created.postalCode,
          countryCode: created.countryCode,
          country: created.country,
          isDefault: created.isDefault });

        haptic.medium();
        show('Delivery address added', 'success');
      }

      setIsSaving(false);
      allowNavigationRef.current = true;
      goBack();
    } catch {
      setIsSaving(false);
      setSaveError('Address could not be saved. Check your connection and try again.');
      haptic.light();
    }
  }, [form, savedAddress, isEditing, saveAddress, show, haptic, goBack, currentUser?.id, setErrors, fieldRefs, allowNavigationRef]);

  const handleRemove = useCallback(() => {
    setConfirmSheet({
      visible: true,
      title: 'Remove delivery address?',
      message: 'You\'ll need to add an address again before using it at checkout.',
      confirmLabel: 'Remove',
      cancelLabel: 'Cancel',
      variant: 'danger',
      onConfirm: async () => {
        const userId = currentUser?.id;
        if (!userId) {
          clearSavedAddress();
          show('Delivery address removed', 'success');
          allowNavigationRef.current = true;
          goBack();
          return;
        }

        if (savedAddress?.id !== undefined) {
          try {
            await deleteUserAddress(userId, savedAddress.id);
          } catch {
            setSaveError('Address could not be removed. Check your connection and try again.');
            haptic.light();
            return;
          }
        }

        haptic.medium();
        clearSavedAddress();
        show('Delivery address removed', 'success');
        allowNavigationRef.current = true;
        goBack();
      } });
  }, [clearSavedAddress, show, haptic, goBack, currentUser?.id, savedAddress?.id, setConfirmSheet, allowNavigationRef]);

  return { isSaving, saveError, handleSave, handleRemove };
}
