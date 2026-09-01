import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Typography, Control, LetterSpacing, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import { useHaptic } from '../hooks/useHaptic';
import { useA11yAudit } from '../hooks/useA11yAudit';
import { RootStackParamList } from '../navigation/types';
import {
  createUserAddress,
  deleteUserAddress,
  CreateAddressInput } from '../services/commerceApi';
import { lookupUKPostcode, isUKPostcode } from '../utils/postcodeLookup';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { AppIcon } from '../components/common/AppIcon';
import { IconSize } from '../theme/iconTokens';
import { t } from '../i18n';


type Props = NativeStackScreenProps<RootStackParamList, 'AddressForm'>;

type CountryOption = {
  code: string;
  name: string;
  flag: string;
};

const COUNTRY_OPTIONS: CountryOption[] = [
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽' },
  { code: 'CN', name: 'China', flag: '🇨🇳' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
  { code: 'AE', name: 'UAE', flag: '🇦🇪' },
];

const COUNTRY_NAMES = COUNTRY_OPTIONS.map((c) => `${c.flag}  ${c.name}`);

interface FormState {
  name: string;
  streetAddress: string;
  apartment: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  country: string;
  isDefault: boolean;
}

const ADD_DEFAULTS: FormState = {
  name: '',
  streetAddress: '',
  apartment: '',
  city: '',
  region: '',
  postalCode: '',
  countryCode: '',
  country: '',
  isDefault: true };

function normaliseForm(f: FormState): FormState {
  return {
    name: f.name.trim(),
    streetAddress: f.streetAddress.trim(),
    apartment: f.apartment.trim(),
    city: f.city.trim(),
    region: f.region.trim(),
    postalCode: f.postalCode.trim().toUpperCase(),
    countryCode: f.countryCode,
    country: f.country,
    isDefault: f.isDefault };
}

function formsEqual(a: FormState, b: FormState): boolean {
  const na = normaliseForm(a);
  const nb = normaliseForm(b);
  return (
    na.name === nb.name &&
    na.streetAddress === nb.streetAddress &&
    na.apartment === nb.apartment &&
    na.city === nb.city &&
    na.region === nb.region &&
    na.postalCode === nb.postalCode &&
    na.countryCode === nb.countryCode &&
    na.country === nb.country
  );
}

interface FieldErrors {
  name?: string;
  streetAddress?: string;
  city?: string;
  postalCode?: string;
  country?: string;
}

function validateForm(f: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (f.name.trim().length < 2) {
    errors.name = 'Enter a full name (at least 2 characters).';
  }
  if (f.streetAddress.trim().length < 3) {
    errors.streetAddress = 'Enter a street address (at least 3 characters).';
  }
  if (f.city.trim().length < 2) {
    errors.city = 'Enter a city or town (at least 2 characters).';
  }
  if (f.postalCode.trim().length < 2) {
    errors.postalCode = 'Enter a valid postal code (at least 2 characters).';
  }
  if (f.postalCode.trim().length > 12) {
    errors.postalCode = 'Postal code seems too long.';
  }
  if (!f.countryCode || !f.country) {
    errors.country = 'Select a country.';
  }
  return errors;
}

export default function AddressFormScreen({ navigation, route }: Props) {
  const a11yRef = useRef<any>(null);
  useA11yAudit(a11yRef, 'AddressFormScreen');
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const savedAddress = useStore((state) => state.savedAddress);
  const saveAddress = useStore((state) => state.saveAddress);
  const clearSavedAddress = useStore((state) => state.clearSavedAddress);
  const currentUser = useStore((state) => state.currentUser);
  const { show } = useToast();
  const haptic = useHaptic();

  const isEditing = route.params?.mode === 'edit' && savedAddress !== null;

  const initialForm = useMemo<FormState>(() => {
    if (isEditing && savedAddress) {
      return {
        name: savedAddress.name,
        streetAddress: savedAddress.streetAddress,
        apartment: savedAddress.apartment ?? '',
        city: savedAddress.city,
        region: savedAddress.region ?? '',
        postalCode: savedAddress.postalCode,
        countryCode: savedAddress.countryCode,
        country: savedAddress.country,
        isDefault: savedAddress.isDefault ?? true };
    }
    return { ...ADD_DEFAULTS };
  }, [isEditing, savedAddress]);

  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isDirty = !formsEqual(form, initialForm);

  const nameRef = useRef<TextInput>(null);
  const streetRef = useRef<TextInput>(null);
  const apartmentRef = useRef<TextInput>(null);
  const cityRef = useRef<TextInput>(null);
  const regionRef = useRef<TextInput>(null);
  const postalRef = useRef<TextInput>(null);
  const allowNavigationRef = useRef(false);
  const pendingNavActionRef = useRef<any>(null);

  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    variant: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', onConfirm: () => {}, variant: 'default' });

  const updateField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => {
        if (!prev[key as keyof FieldErrors]) return prev;
        return { ...prev, [key as keyof FieldErrors]: undefined };
      });
    },
    []
  );

  // Postcode autocomplete suggestion — shows when UK postcode is detected
  // and the suggested city/region differs from what's already entered
  const postcodeSuggestion = useMemo(() => {
    if (!form.postalCode || form.postalCode.trim().length < 2) return null;
    if (!isUKPostcode(form.postalCode)) return null;
    if (form.countryCode && form.countryCode !== 'GB') return null;
    const result = lookupUKPostcode(form.postalCode);
    if (!result) return null;
    // Only show if city or region is empty or different from suggestion
    const cityDiffers = form.city.trim().toLowerCase() !== result.city.toLowerCase();
    const regionDiffers = form.region.trim().toLowerCase() !== result.region.toLowerCase();
    if (!cityDiffers && !regionDiffers) return null;
    return result;
  }, [form.postalCode, form.city, form.region, form.countryCode]);

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

  const validateField = useCallback(
    (field: keyof FieldErrors) => {
      const allErrors = validateForm(form);
      setErrors((prev) => ({
        ...prev,
        [field]: allErrors[field] }));
    },
    [form]
  );

  const handleCountrySelect = useCallback(
    (value: string) => {
      // The picker returns "🇬🇧  United Kingdom" — strip the flag prefix
      const strippedName = value.replace(/^[^\s]+\s+/, '');
      const option = COUNTRY_OPTIONS.find((c) => c.name === strippedName);
      if (option) {
        updateField('countryCode', option.code);
        updateField('country', option.name);
      }
    },
    [updateField]
  );

  const proceedWithNavigation = useCallback(
    (action?: Parameters<typeof navigation.dispatch>[0]) => {
      allowNavigationRef.current = true;

      if (action) {
        navigation.dispatch(action);
      } else {
        navigation.goBack();
      }
    },
    [navigation]
  );

  const handleCancel = useCallback(() => {
    Keyboard.dismiss();
    navigation.goBack();
  }, [navigation]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (allowNavigationRef.current || !isDirty) {
        return;
      }

      event.preventDefault();

      pendingNavActionRef.current = event.data.action;
      setConfirmSheet({
        visible: true,
        title: 'Discard changes?',
        message: 'Your address changes have not been saved.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        variant: 'danger',
        onConfirm: () => {
          const action = pendingNavActionRef.current;
          if (action) {
            proceedWithNavigation(action);
          }
        } });
    });

    return unsubscribe;
  }, [navigation, isDirty, proceedWithNavigation]);

  const handleSave = useCallback(async () => {
    Keyboard.dismiss();
    const allErrors = validateForm(form);
    setErrors(allErrors);

    if (Object.keys(allErrors).length > 0) {
      haptic.light();
      const firstErrorField = Object.keys(allErrors)[0] as keyof FieldErrors;
      const refMap: Record<string, React.RefObject<TextInput | null>> = {
        name: nameRef,
        streetAddress: streetRef,
        city: cityRef,
        postalCode: postalRef };
      refMap[firstErrorField]?.current?.focus();
      return;
    }

    const normalised = normaliseForm(form);
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
      navigation.goBack();
    } catch {
      setIsSaving(false);
      setSaveError('Address could not be saved. Check your connection and try again.');
      haptic.light();
    }
  }, [form, savedAddress, isEditing, saveAddress, show, haptic, navigation, currentUser?.id]);

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
          navigation.goBack();
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
        navigation.goBack();
      } });
  }, [clearSavedAddress, show, haptic, navigation, currentUser?.id, savedAddress?.id]);

  if (!currentUser) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title={isEditing ? 'Edit address' : 'Add address'} onBack={() => navigation.goBack()} />}
        scrollEnabled={false}
      >
        <View style={styles.signedOutContainer}>
          <AppIcon name="lock" size={IconSize.hero} color="textMuted" opticalCenter accessible={false} />
          <Text style={styles.signedOutTitle}>Sign in required</Text>
          <Text style={styles.signedOutBody}>
            You need to be signed in to manage your delivery address.
          </Text>
          <Pressable
            style={styles.signedOutBtn}
            onPress={() => navigation.navigate('Login')}
            accessibilityRole="button"
            accessibilityLabel="Go to sign in"
          >
            <Text style={styles.signedOutBtnText}>Sign in</Text>
          </Pressable>
        </View>
      </FlagshipScreen>
    );
  }

  const countryDisplayName = form.country || 'Select country';

  return (
    <FlagshipScreen
      ref={a11yRef}
      header={<FlagshipHeader title={isEditing ? 'Edit address' : 'Add address'} onBack={handleCancel} />}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <KeyboardAwareScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 80 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
          {/* 2. Editorial introduction */}
          <View style={styles.intro}>
            <Text style={styles.introTitle}>
              {isEditing ? 'Edit delivery address' : 'Add delivery address'}
            </Text>
            <Text style={styles.introBody}>
              {isEditing
                ? 'Update your saved delivery address. Used at checkout and for delivery.'
                : 'Add a delivery address for faster checkout. Save multiple addresses.'}
            </Text>
          </View>

          {/* 3. Recipient section */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Full name</Text>
            <TextInput
              ref={nameRef}
              style={styles.input}
              value={form.name}
              onChangeText={(v) => updateField('name', v)}
              onBlur={() => validateField('name')}
              autoCapitalize="words"
              textContentType="name"
              autoComplete="name"
              returnKeyType="next"
              onSubmitEditing={() => streetRef.current?.focus()}
              placeholder="Recipient name"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Full name"
            />
            {errors.name && (
              <View style={styles.errorRow}>
                <AppIcon name="warning" size={IconSize.xs} color="danger" opticalCenter accessible={false} />
                <Text style={styles.errorText}>{errors.name}</Text>
              </View>
            )}
          </View>

          <View style={styles.separator} />

          {/* 4. Address section */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Address line 1</Text>
            <TextInput
              ref={streetRef}
              style={styles.input}
              value={form.streetAddress}
              onChangeText={(v) => updateField('streetAddress', v)}
              onBlur={() => validateField('streetAddress')}
              autoCapitalize="words"
              textContentType="streetAddressLine1"
              autoComplete="street-address"
              returnKeyType="next"
              onSubmitEditing={() => apartmentRef.current?.focus()}
              placeholder="Street address"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Address line 1"
            />
            {errors.streetAddress && (
              <View style={styles.errorRow}>
                <AppIcon name="warning" size={IconSize.xs} color="danger" opticalCenter accessible={false} />
                <Text style={styles.errorText}>{errors.streetAddress}</Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Address line 2 (optional)</Text>
            <TextInput
              ref={apartmentRef}
              style={styles.input}
              value={form.apartment}
              onChangeText={(v) => updateField('apartment', v)}
              autoCapitalize="words"
              textContentType="streetAddressLine2"
              returnKeyType="next"
              onSubmitEditing={() => cityRef.current?.focus()}
              placeholder="Apartment, suite, unit"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Address line 2"
            />
          </View>

          <View style={styles.separator} />

          {/* 5. Location section */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>City / town</Text>
            <TextInput
              ref={cityRef}
              style={styles.input}
              value={form.city}
              onChangeText={(v) => updateField('city', v)}
              onBlur={() => validateField('city')}
              autoCapitalize="words"
              textContentType="addressCity"
              returnKeyType="next"
              onSubmitEditing={() => regionRef.current?.focus()}
              placeholder="City or town"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="City"
            />
            {errors.city && (
              <View style={styles.errorRow}>
                <AppIcon name="warning" size={IconSize.xs} color="danger" opticalCenter accessible={false} />
                <Text style={styles.errorText}>{errors.city}</Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>State / county / region (optional)</Text>
            <TextInput
              ref={regionRef}
              style={styles.input}
              value={form.region}
              onChangeText={(v) => updateField('region', v)}
              autoCapitalize="words"
              textContentType="addressState"
              returnKeyType="next"
              onSubmitEditing={() => postalRef.current?.focus()}
              placeholder="State, county or region"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Region"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Postal code</Text>
            <TextInput
              ref={postalRef}
              style={styles.input}
              value={form.postalCode}
              onChangeText={(v) => updateField('postalCode', v)}
              onBlur={() => validateField('postalCode')}
              autoCapitalize="characters"
              textContentType="postalCode"
              autoComplete="postal-code"
              returnKeyType="done"
              onSubmitEditing={handleSave}
              placeholder="Postal code"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Postcode"
            />
            {errors.postalCode && (
              <View style={styles.errorRow}>
                <AppIcon name="warning" size={IconSize.xs} color="danger" opticalCenter accessible={false} />
                <Text style={styles.errorText}>{errors.postalCode}</Text>
              </View>
            )}
            {postcodeSuggestion && (
              <Pressable
                style={styles.postcodeSuggestion}
                onPress={applyPostcodeSuggestion}
                accessibilityRole="button"
                accessibilityLabel={`Use ${postcodeSuggestion.city}, ${postcodeSuggestion.region} for this postcode`}
              >
                <AppIcon name="location" size={IconSize.xs} color="brand" opticalCenter accessible={false} />
                <Text style={styles.postcodeSuggestionText}>
                  Use <Text style={styles.postcodeSuggestionBold}>{postcodeSuggestion.city}</Text>
                  {postcodeSuggestion.region ? `, ${postcodeSuggestion.region}` : ''}
                </Text>
                <AppIcon name="forward" size={IconSize.sm} color="brand" opticalCenter accessible={false} />
              </Pressable>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Country</Text>
            <Pressable
              style={styles.countryRow}
              onPress={() => {
                Keyboard.dismiss();
                setShowCountryPicker(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Country. Current selection: ${countryDisplayName}`}
            >
              <Text
                style={[
                  styles.countryText,
                  !form.country && styles.countryPlaceholder,
                ]}
              >
                {countryDisplayName}
              </Text>
              <AppIcon name="chevronDown" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
            </Pressable>
            {errors.country && (
              <View style={styles.errorRow}>
                <AppIcon name="warning" size={IconSize.xs} color="danger" opticalCenter accessible={false} />
                <Text style={styles.errorText}>{errors.country}</Text>
              </View>
            )}
          </View>

          {/* 6. Save as default toggle — lets the user choose whether this
              address becomes their default for checkout. Per 2026 UX research:
              "Save as default toggle" is a must-have for address forms. */}
          <Pressable
            style={styles.defaultToggleRow}
            onPress={() => {
              haptic.selection();
              updateField('isDefault', !form.isDefault);
            }}
            accessibilityRole="switch"
            accessibilityLabel="Save as default delivery address"
            accessibilityState={{ checked: form.isDefault }}
            accessibilityHint="When enabled, this address is selected automatically at checkout"
          >
            <View style={styles.defaultToggleLeft}>
              <AppIcon name="checkmark-circle-outline" size={IconSize.sm} color="textSecondary" opticalCenter accessible={false} />
              <View style={styles.defaultToggleTextCol}>
                <Text style={[styles.defaultToggleTitle, { color: colors.textPrimary }]}>
                  Save as default
                </Text>
                <Text style={[styles.defaultToggleSub, { color: colors.textMuted }]}>
                  Use this address automatically at checkout
                </Text>
              </View>
            </View>
            <View style={[
              styles.defaultSwitch,
              {
                backgroundColor: form.isDefault ? colors.brand : colors.surfaceAlt,
                borderColor: form.isDefault ? colors.brand : colors.border },
            ]}>
              <View style={[
                styles.defaultSwitchKnob,
                {
                  backgroundColor: form.isDefault ? colors.textInverse : colors.textMuted,
                  alignSelf: form.isDefault ? 'flex-end' : 'flex-start' },
              ]} />
            </View>
          </Pressable>

          {/* Remove address (edit mode only) */}
          {isEditing && (
            <Pressable
              style={styles.removeBtn}
              onPress={handleRemove}
              hitSlop={{ top: 8, bottom: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Remove delivery address"
            >
              <AppIcon name="trash" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
              <Text style={styles.removeBtnText}>Remove address</Text>
            </Pressable>
          )}
      </KeyboardAwareScrollView>

      {/* Save error display */}
      {saveError ? (
        <View style={styles.saveErrorRow}>
          <AppIcon name="warning" size={IconSize.xs} color="danger" opticalCenter accessible={false} />
          <Text style={styles.saveErrorText}>{saveError}</Text>
        </View>
      ) : null}

      {/* 7. Sticky Save footer */}
      <View style={[styles.stickyFooter, { paddingBottom: insets.bottom + Space.sm }]}>
        <Pressable
          style={[styles.saveBtn, isSaving && styles.saveBtnPressed]}
          onPress={handleSave}
          disabled={isSaving}
          accessibilityRole="button"
          accessibilityLabel={isEditing ? 'Save changes' : 'Save address'}
          accessibilityState={{ disabled: isSaving }}
        >
          {isSaving ? (
            <Text style={styles.saveBtnText}>Saving…</Text>
          ) : (
            <Text style={styles.saveBtnText}>
              {isEditing ? 'Save changes' : 'Save address'}
            </Text>
          )}
        </Pressable>
      </View>

      {/* BottomSheetPicker for country */}
      <BottomSheetPicker
        visible={showCountryPicker}
        onClose={() => setShowCountryPicker(false)}
        title="Country"
        options={COUNTRY_NAMES}
        selectedValue={form.country ? `${COUNTRY_OPTIONS.find((c) => c.name === form.country)?.flag ?? ''}  ${form.country}` : undefined}
        onSelect={handleCountrySelect}
      />

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel}
        cancelLabel={confirmSheet.cancelLabel}
        onConfirm={() => { confirmSheet.onConfirm(); setConfirmSheet((s) => ({ ...s, visible: false })); }}
        variant={confirmSheet.variant}
      />
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background },
  flex: {
    flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm },
  headerBtn: {
    minWidth: Control.hit,
    minHeight: Control.hit,
    justifyContent: 'center' },
  headerCancelText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textSecondary },
  headerTitle: {
    flex: 1,
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    color: colors.textPrimary,
    textAlign: 'center' },
  headerSpacer: {
    minWidth: Control.hit },

  // Scroll
  scrollContent: {
    paddingHorizontal: Space.md },

  // Intro
  intro: {
    paddingTop: Space.lg,
    paddingBottom: Space.lg,
    gap: Space.xs },
  introTitle: {
    fontSize: TypographyV2.screenTitle.size,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    color: colors.textPrimary,
    letterSpacing: LetterSpacing.tight + LetterSpacing.wide },
  introBody: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textSecondary,
    lineHeight: TypographyV2.bodyStrong.lineHeight },

  // Section
  section: {
    paddingVertical: Space.sm },
  sectionLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    marginBottom: Space.xs + 2 },
  input: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: 0,
    minHeight: Control.hit },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border },

  // Error
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs },
  errorText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.danger },
  postcodeSuggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginTop: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.smMd,
    backgroundColor: colors.brandSubtle,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandBorder },
  postcodeSuggestionText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary },
  postcodeSuggestionBold: {
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary },
  saveErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  saveErrorText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.danger },

  // Country
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: Control.hit,
    paddingVertical: Space.sm + 2 },
  countryText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  countryPlaceholder: {
    color: colors.textMuted },

  // Default toggle
  defaultToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.md,
    marginTop: Space.sm,
    minHeight: Control.hit + Space.xs },
  defaultToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1 },
  defaultToggleTextCol: {
    flex: 1,
    gap: Space.xs - 2 },
  defaultToggleTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  defaultToggleSub: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight,
    letterSpacing: TypographyV2.meta.letterSpacing },
  defaultSwitch: {
    width: Space.xxl - Space.sm,
    height: Space.lg,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    justifyContent: 'center',
    padding: Space.xs },
  defaultSwitchKnob: {
    width: Control.iconCompact,
    height: Control.iconCompact,
    borderRadius: Radius.full },

  // Remove
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
    marginTop: Space.lg,
    minHeight: Control.hit + Space.xs },
  removeBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textMuted },

  // Sticky footer
  stickyFooter: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border },
  saveBtn: {
    backgroundColor: colors.brand,
    paddingVertical: Space.md - 2,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Control.hit + Space.xs },
  saveBtnPressed: {
    opacity: 0.7 },
  saveBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textInverse },

  // Signed out
  signedOutContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.sm },
  signedOutTitle: {
    fontSize: TypographyV2.priceList.size,
    fontFamily: TypographyV2.priceList.fontFamily,
    color: colors.textPrimary,
    marginTop: Space.sm },
  signedOutBody: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: TypographyV2.bodyStrong.lineHeight },
  signedOutBtn: {
    marginTop: Space.md,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.md - 2,
    backgroundColor: colors.brand,
    borderRadius: Radius.md,
    minHeight: Control.hit + Space.xs,
    justifyContent: 'center' },
  signedOutBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textInverse } });
}