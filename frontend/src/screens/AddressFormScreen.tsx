import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Typography } from '../theme/designTokens';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import { useHaptic } from '../hooks/useHaptic';
import { RootStackParamList } from '../navigation/types';
import {
  createUserAddress,
  deleteUserAddress,
  CreateAddressInput,
} from '../services/commerceApi';
import { lookupUKPostcode, isUKPostcode } from '../utils/postcodeLookup';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';

type Props = StackScreenProps<RootStackParamList, 'AddressForm'>;

type CountryOption = {
  code: string;
  name: string;
};

const COUNTRY_OPTIONS: CountryOption[] = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'IN', name: 'India' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'JP', name: 'Japan' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'CN', name: 'China' },
  { code: 'SG', name: 'Singapore' },
  { code: 'AE', name: 'UAE' },
];

const COUNTRY_NAMES = COUNTRY_OPTIONS.map((c) => c.name);

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
  isDefault: true,
};

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
    isDefault: f.isDefault,
  };
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
  const { colors } = useAppTheme();
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
        isDefault: savedAddress.isDefault ?? true,
      };
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
        [field]: allErrors[field],
      }));
    },
    [form]
  );

  const handleCountrySelect = useCallback(
    (value: string) => {
      const option = COUNTRY_OPTIONS.find((c) => c.name === value);
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

      Alert.alert(
        'Discard changes?',
        'Your address changes have not been saved.',
        [
          {
            text: 'Keep editing',
            style: 'cancel',
          },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => proceedWithNavigation(event.data.action),
          },
        ]
      );
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
        postalCode: postalRef,
      };
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
      isDefault: true,
    };

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
          isDefault: created.isDefault,
        });

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
          isDefault: created.isDefault,
        });

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
    Alert.alert(
      'Remove delivery address?',
      'You will need to add an address again before using it at checkout.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
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
          },
        },
      ]
    );
  }, [clearSavedAddress, show, haptic, navigation, currentUser?.id, savedAddress?.id]);

  if (!currentUser) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title={isEditing ? 'Edit address' : 'Add address'} onBack={() => navigation.goBack()} />}
        scrollEnabled={false}
      >
        <View style={styles.signedOutContainer}>
          <Ionicons name="lock-closed-outline" size={36} color={colors.textMuted} />
          <Text style={[styles.signedOutTitle, { color: colors.textPrimary }]}>Sign in required</Text>
          <Text style={[styles.signedOutBody, { color: colors.textSecondary }]}>
            You need to be signed in to manage your delivery address.
          </Text>
          <Pressable
            style={[styles.signedOutBtn, { backgroundColor: colors.brand }]}
            onPress={() => navigation.navigate('Login')}
            accessibilityRole="button"
            accessibilityLabel="Go to sign in"
          >
            <Text style={[styles.signedOutBtnText, { color: colors.textInverse }]}>Sign in</Text>
          </Pressable>
        </View>
      </FlagshipScreen>
    );
  }

  const countryDisplayName = form.country || 'Select country';

  return (
    <FlagshipScreen
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
            <Text style={[styles.introTitle, { color: colors.textPrimary }]}>
              {isEditing ? 'Edit delivery address' : 'Add delivery address'}
            </Text>
            <Text style={[styles.introBody, { color: colors.textSecondary }]}>
              {isEditing
                ? 'Update your saved delivery address. Used at checkout and for delivery.'
                : 'Add a delivery address for faster checkout. You can save multiple addresses.'}
            </Text>
          </View>

          {/* 3. Recipient section */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Full name</Text>
            <TextInput
              ref={nameRef}
              style={[styles.input, { color: colors.textPrimary }]}
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
            />
            {errors.name && (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={13} color={colors.danger} />
                <Text style={[styles.errorText, { color: colors.danger }]}>{errors.name}</Text>
              </View>
            )}
          </View>

          <View style={[styles.separator, { backgroundColor: colors.border }]} />

          {/* 4. Address section */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Address line 1</Text>
            <TextInput
              ref={streetRef}
              style={[styles.input, { color: colors.textPrimary }]}
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
            />
            {errors.streetAddress && (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={13} color={colors.danger} />
                <Text style={[styles.errorText, { color: colors.danger }]}>{errors.streetAddress}</Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Address line 2 (optional)</Text>
            <TextInput
              ref={apartmentRef}
              style={[styles.input, { color: colors.textPrimary }]}
              value={form.apartment}
              onChangeText={(v) => updateField('apartment', v)}
              autoCapitalize="words"
              textContentType="streetAddressLine2"
              returnKeyType="next"
              onSubmitEditing={() => cityRef.current?.focus()}
              placeholder="Apartment, suite, unit"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={[styles.separator, { backgroundColor: colors.border }]} />

          {/* 5. Location section */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>City / town</Text>
            <TextInput
              ref={cityRef}
              style={[styles.input, { color: colors.textPrimary }]}
              value={form.city}
              onChangeText={(v) => updateField('city', v)}
              onBlur={() => validateField('city')}
              autoCapitalize="words"
              textContentType="addressCity"
              returnKeyType="next"
              onSubmitEditing={() => regionRef.current?.focus()}
              placeholder="City or town"
              placeholderTextColor={colors.textMuted}
            />
            {errors.city && (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={13} color={colors.danger} />
                <Text style={[styles.errorText, { color: colors.danger }]}>{errors.city}</Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>State / county / region (optional)</Text>
            <TextInput
              ref={regionRef}
              style={[styles.input, { color: colors.textPrimary }]}
              value={form.region}
              onChangeText={(v) => updateField('region', v)}
              autoCapitalize="words"
              textContentType="addressState"
              returnKeyType="next"
              onSubmitEditing={() => postalRef.current?.focus()}
              placeholder="State, county or region"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Postal code</Text>
            <TextInput
              ref={postalRef}
              style={[styles.input, { color: colors.textPrimary }]}
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
            />
            {errors.postalCode && (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={13} color={colors.danger} />
                <Text style={[styles.errorText, { color: colors.danger }]}>{errors.postalCode}</Text>
              </View>
            )}
            {postcodeSuggestion && (
              <Pressable
                style={[styles.postcodeSuggestion, { backgroundColor: `${colors.brand}08`, borderColor: `${colors.brand}30` }]}
                onPress={applyPostcodeSuggestion}
                accessibilityRole="button"
                accessibilityLabel={`Use ${postcodeSuggestion.city}, ${postcodeSuggestion.region} for this postcode`}
              >
                <Ionicons name="location-outline" size={14} color={colors.brand} />
                <Text style={[styles.postcodeSuggestionText, { color: colors.textSecondary }]}>
                  Use <Text style={[styles.postcodeSuggestionBold, { color: colors.textPrimary }]}>{postcodeSuggestion.city}</Text>
                  {postcodeSuggestion.region ? `, ${postcodeSuggestion.region}` : ''}
                </Text>
                <Ionicons name="arrow-forward-circle" size={16} color={colors.brand} />
              </Pressable>
            )}
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Country</Text>
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
                  { color: colors.textPrimary },
                  !form.country && { color: colors.textMuted },
                ]}
              >
                {countryDisplayName}
              </Text>
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            </Pressable>
            {errors.country && (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={13} color={colors.danger} />
                <Text style={[styles.errorText, { color: colors.danger }]}>{errors.country}</Text>
              </View>
            )}
          </View>

          {/* 6. Default-address note */}
          <View style={styles.defaultNote}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.defaultNoteText, { color: colors.textMuted }]}>
              This will be used as your default delivery address.
            </Text>
          </View>

          {/* Remove address (edit mode only) */}
          {isEditing && (
            <Pressable
              style={styles.removeBtn}
              onPress={handleRemove}
              hitSlop={{ top: 8, bottom: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Remove delivery address"
            >
              <Ionicons name="trash-outline" size={15} color={colors.textMuted} />
              <Text style={[styles.removeBtnText, { color: colors.textMuted }]}>Remove address</Text>
            </Pressable>
          )}
      </KeyboardAwareScrollView>

      {/* Save error display */}
      {saveError ? (
        <View style={styles.saveErrorRow}>
          <Ionicons name="alert-circle" size={14} color={colors.danger} />
          <Text style={[styles.saveErrorText, { color: colors.danger }]}>{saveError}</Text>
        </View>
      ) : null}

      {/* 7. Sticky Save footer */}
      <View style={[styles.stickyFooter, { paddingBottom: insets.bottom + Space.sm, backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Pressable
          style={[styles.saveBtn, { backgroundColor: colors.brand }, isSaving && styles.saveBtnPressed]}
          onPress={handleSave}
          disabled={isSaving}
          accessibilityRole="button"
          accessibilityLabel={isEditing ? 'Save changes' : 'Save address'}
          accessibilityState={{ disabled: isSaving }}
        >
          {isSaving ? (
            <Text style={[styles.saveBtnText, { color: colors.textInverse }]}>Saving…</Text>
          ) : (
            <Text style={[styles.saveBtnText, { color: colors.textInverse }]}>
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
        selectedValue={form.country || undefined}
        onSelect={handleCountrySelect}
      />
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  headerBtn: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  headerCancelText: {
    fontSize: 16,
    fontFamily: Typography.family.regular,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: Typography.family.semibold,
    textAlign: 'center',
  },
  headerSpacer: {
    minWidth: 44,
  },

  // Scroll
  scrollContent: {
    paddingHorizontal: Space.md,
  },

  // Intro
  intro: {
    paddingTop: Space.lg,
    paddingBottom: Space.lg,
    gap: Space.xs,
  },
  introTitle: {
    fontSize: 24,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.3,
  },
  introBody: {
    fontSize: 15,
    fontFamily: Typography.family.regular,
    lineHeight: 21,
  },

  // Section
  section: {
    paddingVertical: Space.sm,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    marginBottom: 6,
  },
  input: {
    fontSize: 16,
    fontFamily: Typography.family.regular,
    paddingVertical: 10,
    paddingHorizontal: 0,
    minHeight: 44,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },

  // Error
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  errorText: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
  },
  postcodeSuggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  postcodeSuggestionText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Typography.family.regular,
  },
  postcodeSuggestionBold: {
    fontFamily: Typography.family.semibold,
  },
  saveErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  saveErrorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Typography.family.medium,
  },

  // Country
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: 10,
  },
  countryText: {
    fontSize: 16,
    fontFamily: Typography.family.regular,
  },

  // Default note
  defaultNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs,
    marginTop: Space.md,
  },
  defaultNoteText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Typography.family.regular,
    lineHeight: 18,
  },

  // Remove
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
    marginTop: Space.lg,
    minHeight: 48,
  },
  removeBtnText: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
  },

  // Sticky footer
  stickyFooter: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveBtn: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  saveBtnPressed: {
    opacity: 0.7,
  },
  saveBtnText: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
  },

  // Signed out
  signedOutContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.sm,
  },
  signedOutTitle: {
    fontSize: 20,
    fontFamily: Typography.family.bold,
    marginTop: Space.sm,
  },
  signedOutBody: {
    fontSize: 15,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    lineHeight: 21,
  },
  signedOutBtn: {
    marginTop: Space.md,
    paddingHorizontal: Space.xl,
    paddingVertical: 14,
    borderRadius: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  signedOutBtnText: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
  },
});
