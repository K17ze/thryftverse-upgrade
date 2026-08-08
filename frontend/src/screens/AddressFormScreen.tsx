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
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, Control, LetterSpacing } from '../theme/designTokens';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { RootStackParamList } from '../navigation/types';
import {
  createUserAddress,
  deleteUserAddress,
  CreateAddressInput,
} from '../services/commerceApi';
import { lookupUKPostcode, isUKPostcode } from '../utils/postcodeLookup';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'AddressForm'>;

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
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const savedAddress = useStore((state) => state.savedAddress);
  const saveAddress = useStore((state) => state.saveAddress);
  const clearSavedAddress = useStore((state) => state.clearSavedAddress);
  const currentUser = useStore((state) => state.currentUser);
  const { show } = useToast();
  const haptic = useHaptic();
  const reducedMotionEnabled = useReducedMotion();

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
      'You\'ll need to add an address again before using it at checkout.',
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
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)} style={styles.intro}>
            <Text style={styles.introTitle}>
              {isEditing ? 'Edit delivery address' : 'Add delivery address'}
            </Text>
            <Text style={styles.introBody}>
              {isEditing
                ? 'Update your saved delivery address. Used at checkout and for delivery.'
                : 'Add a delivery address for faster checkout. Save multiple addresses.'}
            </Text>
          </Reanimated.View>

          {/* 3. Recipient section */}
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(60)} style={styles.section}>
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
            />
            {errors.name && (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={13} color={colors.danger} />
                <Text style={styles.errorText}>{errors.name}</Text>
              </View>
            )}
          </Reanimated.View>

          <View style={styles.separator} />

          {/* 4. Address section */}
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(120)} style={styles.section}>
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
            />
            {errors.streetAddress && (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={13} color={colors.danger} />
                <Text style={styles.errorText}>{errors.streetAddress}</Text>
              </View>
            )}
          </Reanimated.View>

          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(180)} style={styles.section}>
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
            />
          </Reanimated.View>

          <View style={styles.separator} />

          {/* 5. Location section */}
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(240)} style={styles.section}>
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
            />
            {errors.city && (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={13} color={colors.danger} />
                <Text style={styles.errorText}>{errors.city}</Text>
              </View>
            )}
          </Reanimated.View>

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
            />
            {errors.postalCode && (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={13} color={colors.danger} />
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
                <Ionicons name="location-outline" size={14} color={colors.brand} />
                <Text style={styles.postcodeSuggestionText}>
                  Use <Text style={styles.postcodeSuggestionBold}>{postcodeSuggestion.city}</Text>
                  {postcodeSuggestion.region ? `, ${postcodeSuggestion.region}` : ''}
                </Text>
                <Ionicons name="arrow-forward-circle" size={16} color={colors.brand} />
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
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            </Pressable>
            {errors.country && (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={13} color={colors.danger} />
                <Text style={styles.errorText}>{errors.country}</Text>
              </View>
            )}
          </View>

          {/* 6. Default-address note */}
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(300)} style={styles.defaultNote}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
            <Text style={styles.defaultNoteText}>
              This will be used as your default delivery address.
            </Text>
          </Reanimated.View>

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
              <Text style={styles.removeBtnText}>Remove address</Text>
            </Pressable>
          )}
      </KeyboardAwareScrollView>

      {/* Save error display */}
      {saveError ? (
        <View style={styles.saveErrorRow}>
          <Ionicons name="alert-circle" size={14} color={colors.danger} />
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
        selectedValue={form.country || undefined}
        onSelect={handleCountrySelect}
      />
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    minWidth: Control.hit,
    minHeight: Control.hit,
    justifyContent: 'center',
  },
  headerCancelText: {
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
  },
  headerTitle: {
    flex: 1,
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  headerSpacer: {
    minWidth: Control.hit,
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
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    letterSpacing: LetterSpacing.tight + LetterSpacing.wide,
  },
  introBody: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
    lineHeight: Type.bodyEmphasis.lineHeight,
  },

  // Section
  section: {
    paddingVertical: Space.sm,
  },
  sectionLabel: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    marginBottom: Space.xs + 2,
  },
  input: {
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.regular,
    color: colors.textPrimary,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: 0,
    minHeight: Control.hit,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },

  // Error
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs,
  },
  errorText: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.regular,
    color: colors.danger,
  },
  postcodeSuggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginTop: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.sm + 4,
    backgroundColor: `${colors.brand}08`,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${colors.brand}30`,
  },
  postcodeSuggestionText: {
    flex: 1,
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
  },
  postcodeSuggestionBold: {
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  saveErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  saveErrorText: {
    flex: 1,
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.medium,
    color: colors.danger,
  },

  // Country
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: Control.hit,
    paddingVertical: Space.sm + 2,
  },
  countryText: {
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.regular,
    color: colors.textPrimary,
  },
  countryPlaceholder: {
    color: colors.textMuted,
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
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    lineHeight: Type.captionElevated.lineHeight,
  },

  // Remove
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
    marginTop: Space.lg,
    minHeight: Control.hit + Space.xs,
  },
  removeBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
  },

  // Sticky footer
  stickyFooter: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  saveBtn: {
    backgroundColor: colors.brand,
    paddingVertical: Space.md - 2,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Control.hit + Space.xs,
  },
  saveBtnPressed: {
    opacity: 0.7,
  },
  saveBtnText: {
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.semibold,
    color: colors.textInverse,
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
    fontSize: Type.priceList.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    marginTop: Space.sm,
  },
  signedOutBody: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: Type.bodyEmphasis.lineHeight,
  },
  signedOutBtn: {
    marginTop: Space.md,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.md - 2,
    backgroundColor: colors.brand,
    borderRadius: Radius.md,
    minHeight: Control.hit + Space.xs,
    justifyContent: 'center',
  },
  signedOutBtnText: {
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.semibold,
    color: colors.textInverse,
  },
  });
}