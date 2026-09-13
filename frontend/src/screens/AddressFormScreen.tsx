import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { Space } from '../theme/designTokens';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { useStore } from '../store/useStore';
import { useHaptic } from '../hooks/useHaptic';
import { useA11yAudit } from '../hooks/useA11yAudit';
import { RootStackParamList } from '../navigation/types';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { AppIcon } from '../components/common/AppIcon';
import { IconSize } from '../theme/iconTokens';
import {
  AddressFormIntro,
  AddressFormSignedOut,
  AddressField,
  PostcodeSuggestionRow,
  CountryField,
  DefaultAddressToggle,
  RemoveAddressButton,
  createAddressFormStyles,
  COUNTRY_NAMES,
  countryPickerSelectedValue,
} from '../components/addressform';
import {
  useAddressFormState,
  usePostcodeSuggestion,
  useAddressFormActions,
  type AddressConfirmSheetConfig,
} from '../hooks/addressform';


type Props = NativeStackScreenProps<RootStackParamList, 'AddressForm'>;

export default function AddressFormScreen({ navigation, route }: Props) {
  const a11yRef = useRef<any>(null);
  useA11yAudit(a11yRef, 'AddressFormScreen');
  const { colors } = useAppTheme();
  const styles = useMemo(() => createAddressFormStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const savedAddress = useStore((state) => state.savedAddress);
  const currentUser = useStore((state) => state.currentUser);
  const haptic = useHaptic();

  const isEditing = route.params?.mode === 'edit' && savedAddress !== null;

  const {
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
  } = useAddressFormState({ isEditing, savedAddress });

  const { postcodeSuggestion, applyPostcodeSuggestion } = usePostcodeSuggestion(form, updateField);

  const allowNavigationRef = useRef(false);
  const pendingNavActionRef = useRef<any>(null);

  const [confirmSheet, setConfirmSheet] = useState<AddressConfirmSheetConfig>(
    { visible: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', onConfirm: () => {}, variant: 'default' });

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  const { isSaving, saveError, handleSave, handleRemove } = useAddressFormActions({
    isEditing,
    savedAddress,
    form,
    setErrors,
    fieldRefs: {
      name: nameRef,
      streetAddress: streetRef,
      city: cityRef,
      postalCode: postalRef },
    allowNavigationRef,
    setConfirmSheet,
    goBack,
  });

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

  if (!currentUser) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title={isEditing ? 'Edit address' : 'Add address'} onBack={() => navigation.goBack()} />}
        scrollEnabled={false}
      >
        <AddressFormSignedOut onSignIn={() => navigation.navigate('Login')} />
      </FlagshipScreen>
    );
  }

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
          <AddressFormIntro isEditing={isEditing} />

          {/* 3. Recipient section */}
          <AddressField
            label="Full name"
            inputRef={nameRef}
            value={form.name}
            onChangeText={(v) => updateField('name', v)}
            onBlur={() => validateField('name')}
            autoCapitalize="words"
            textContentType="name"
            autoComplete="name"
            returnKeyType="next"
            onSubmitEditing={() => streetRef.current?.focus()}
            placeholder="Recipient name"
            accessibilityLabel="Full name"
            error={errors.name}
          />

          <View style={styles.separator} />

          {/* 4. Address section */}
          <AddressField
            label="Address line 1"
            inputRef={streetRef}
            value={form.streetAddress}
            onChangeText={(v) => updateField('streetAddress', v)}
            onBlur={() => validateField('streetAddress')}
            autoCapitalize="words"
            textContentType="streetAddressLine1"
            autoComplete="street-address"
            returnKeyType="next"
            onSubmitEditing={() => apartmentRef.current?.focus()}
            placeholder="Street address"
            accessibilityLabel="Address line 1"
            error={errors.streetAddress}
          />

          <AddressField
            label="Address line 2 (optional)"
            inputRef={apartmentRef}
            value={form.apartment}
            onChangeText={(v) => updateField('apartment', v)}
            autoCapitalize="words"
            textContentType="streetAddressLine2"
            returnKeyType="next"
            onSubmitEditing={() => cityRef.current?.focus()}
            placeholder="Apartment, suite, unit"
            accessibilityLabel="Address line 2"
          />

          <View style={styles.separator} />

          {/* 5. Location section */}
          <AddressField
            label="City / town"
            inputRef={cityRef}
            value={form.city}
            onChangeText={(v) => updateField('city', v)}
            onBlur={() => validateField('city')}
            autoCapitalize="words"
            textContentType="addressCity"
            returnKeyType="next"
            onSubmitEditing={() => regionRef.current?.focus()}
            placeholder="City or town"
            accessibilityLabel="City"
            error={errors.city}
          />

          <AddressField
            label="State / county / region (optional)"
            inputRef={regionRef}
            value={form.region}
            onChangeText={(v) => updateField('region', v)}
            autoCapitalize="words"
            textContentType="addressState"
            returnKeyType="next"
            onSubmitEditing={() => postalRef.current?.focus()}
            placeholder="State, county or region"
            accessibilityLabel="Region"
          />

          <AddressField
            label="Postal code"
            inputRef={postalRef}
            value={form.postalCode}
            onChangeText={(v) => updateField('postalCode', v)}
            onBlur={() => validateField('postalCode')}
            autoCapitalize="characters"
            textContentType="postalCode"
            autoComplete="postal-code"
            returnKeyType="done"
            onSubmitEditing={handleSave}
            placeholder="Postal code"
            accessibilityLabel="Postcode"
            error={errors.postalCode}
          >
            {postcodeSuggestion && (
              <PostcodeSuggestionRow
                suggestion={postcodeSuggestion}
                onPress={applyPostcodeSuggestion}
              />
            )}
          </AddressField>

          <CountryField
            country={form.country}
            error={errors.country}
            onPress={() => {
              Keyboard.dismiss();
              setShowCountryPicker(true);
            }}
          />

          {/* 6. Save as default toggle */}
          <DefaultAddressToggle
            checked={form.isDefault}
            onToggle={() => {
              haptic.selection();
              updateField('isDefault', !form.isDefault);
            }}
          />

          {/* Remove address (edit mode only) */}
          {isEditing && (
            <RemoveAddressButton onPress={handleRemove} />
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
        selectedValue={countryPickerSelectedValue(form.country)}
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
