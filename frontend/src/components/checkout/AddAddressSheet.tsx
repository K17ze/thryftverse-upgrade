import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Platform } from 'react-native';
import { BottomSheet } from '../BottomSheet';
import { AnimatedPressable } from '../AnimatedPressable';
import { Ionicons } from '@expo/vector-icons';
import { ActiveTheme, Colors } from '../../constants/colors';
import { Typography } from '../../theme/designTokens';
import { useStore } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import { createUserAddress } from '../../services/commerceApi';
import * as Haptics from 'expo-haptics';

const IS_LIGHT = ActiveTheme === 'light';
const PANEL_BG = IS_LIGHT ? '#ffffff' : '#111111';
const PANEL_SOFT_BG = IS_LIGHT ? '#f7f4ef' : '#151515';
const PANEL_BORDER = IS_LIGHT ? '#d8d1c6' : '#2a2a2a';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onSuccess?: () => void;
}

// Common countries with address format preferences
const COMMON_COUNTRIES = [
  { code: 'US', name: 'United States', postalLabel: 'ZIP Code', needsState: true },
  { code: 'GB', name: 'United Kingdom', postalLabel: 'Postcode', needsState: false },
  { code: 'CA', name: 'Canada', postalLabel: 'Postal Code', needsState: true },
  { code: 'AU', name: 'Australia', postalLabel: 'Postcode', needsState: true },
  { code: 'IN', name: 'India', postalLabel: 'PIN Code', needsState: true },
  { code: 'DE', name: 'Germany', postalLabel: 'PLZ', needsState: false },
  { code: 'FR', name: 'France', postalLabel: 'Code Postal', needsState: false },
  { code: 'IT', name: 'Italy', postalLabel: 'CAP', needsState: false },
  { code: 'ES', name: 'Spain', postalLabel: 'Código Postal', needsState: false },
  { code: 'NL', name: 'Netherlands', postalLabel: 'Postcode', needsState: false },
  { code: 'JP', name: 'Japan', postalLabel: '郵便番号', needsState: true },
  { code: 'BR', name: 'Brazil', postalLabel: 'CEP', needsState: true },
  { code: 'MX', name: 'Mexico', postalLabel: 'Código Postal', needsState: true },
  { code: 'CN', name: 'China', postalLabel: '邮政编码', needsState: true },
  { code: 'SG', name: 'Singapore', postalLabel: 'Postal Code', needsState: false },
  { code: 'AE', name: 'UAE', postalLabel: 'PO Box', needsState: false },
];

export function AddAddressSheet({ visible, onDismiss, onSuccess }: Props) {
  const [name, setName] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [apartment, setApartment] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [countryCode, setCountryCode] = useState('US');
  const [isDefaultAddress, setIsDefaultAddress] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const currentUser = useStore((state) => state.currentUser);
  const saveAddress = useStore((state) => state.saveAddress);
  const { show } = useToast();

  useEffect(() => {
    if (!visible) {
      setName('');
      setStreetAddress('');
      setApartment('');
      setCity('');
      setRegion('');
      setPostalCode('');
      setCountryCode('US');
      setIsDefaultAddress(true);
      setShowCountryPicker(false);
    }
  }, [visible]);

  const selectedCountry = COMMON_COUNTRIES.find(c => c.code === countryCode) || COMMON_COUNTRIES[0];
  const needsRegion = selectedCountry.needsState;

  const isFormValid = name.trim() && streetAddress.trim() && city.trim() && postalCode.trim();

  const handleSave = async () => {
    if (!isFormValid || isSaving) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const nextAddress = {
      name: name.trim(),
      streetAddress: streetAddress.trim(),
      apartment: apartment.trim() || undefined,
      city: city.trim(),
      region: needsRegion ? region.trim() : undefined,
      postalCode: postalCode.trim().toUpperCase(),
      countryCode,
      country: selectedCountry.name,
      isDefault: isDefaultAddress,
    };

    setIsSaving(true);
    try {
      const userId = currentUser?.id ?? 'u1';
      const saved = await createUserAddress(userId, nextAddress);

      saveAddress({
        id: saved.id,
        name: saved.name,
        streetAddress: saved.streetAddress,
        apartment: saved.apartment,
        city: saved.city,
        region: saved.region,
        postalCode: saved.postalCode,
        countryCode: saved.countryCode,
        country: saved.country,
        isDefault: saved.isDefault,
      });
      show('Delivery address saved', 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      saveAddress(nextAddress);
      show('Address saved locally. Backend sync unavailable.', 'info');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } finally {
      setIsSaving(false);
      onDismiss();
      if (onSuccess) onSuccess();
    }
  };

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} snapPoint={0.88}>
      <Text style={styles.sheetTitle}>Delivery Address</Text>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.heroCopy}>Where should we send your items?</Text>

        {/* Country Selector */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Country</Text>
          <AnimatedPressable
            style={styles.countrySelector}
            onPress={() => setShowCountryPicker(true)}
          >
            <Text style={styles.countryText}>{selectedCountry.name}</Text>
            <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
          </AnimatedPressable>
        </View>

        {/* Full Name */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Full Name</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Jane Doe"
              placeholderTextColor={Colors.textMuted}
              value={name}
              onChangeText={setName}
              selectionColor={Colors.brand}
            />
          </View>
        </View>

        {/* Street Address Line 1 */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Street Address</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="123 Example Street"
              placeholderTextColor={Colors.textMuted}
              value={streetAddress}
              onChangeText={setStreetAddress}
              selectionColor={Colors.brand}
            />
          </View>
        </View>

        {/* Apartment/Unit (optional) */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Apartment, Suite, Unit (optional)</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Apt 4B, Floor 3, etc."
              placeholderTextColor={Colors.textMuted}
              value={apartment}
              onChangeText={setApartment}
              selectionColor={Colors.brand}
            />
          </View>
        </View>

        {/* City */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>City</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="London"
              placeholderTextColor={Colors.textMuted}
              value={city}
              onChangeText={setCity}
              selectionColor={Colors.brand}
            />
          </View>
        </View>

        {/* Region/State (conditional) */}
        {needsRegion && (
          <View style={styles.formGroup}>
            <Text style={styles.label}>
              {countryCode === 'US' ? 'State' :
               countryCode === 'CA' ? 'Province' :
               countryCode === 'JP' ? 'Prefecture' :
               countryCode === 'IN' ? 'State' : 'Region'}
            </Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder={countryCode === 'US' ? 'California' : 'Enter region'}
                placeholderTextColor={Colors.textMuted}
                value={region}
                onChangeText={setRegion}
                selectionColor={Colors.brand}
              />
            </View>
          </View>
        )}

        {/* Postal Code */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>{selectedCountry.postalLabel}</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder={countryCode === 'US' ? '10001' : 'SW1A 1AA'}
              placeholderTextColor={Colors.textMuted}
              value={postalCode}
              onChangeText={setPostalCode}
              autoCapitalize="characters"
              selectionColor={Colors.brand}
            />
          </View>
        </View>

        <AnimatedPressable
          style={[styles.defaultToggleRow, isDefaultAddress && styles.defaultToggleRowActive]}
          activeOpacity={0.9}
          onPress={() => setIsDefaultAddress((current) => !current)}
        >
          <Ionicons
            name={isDefaultAddress ? 'checkmark-circle' : 'ellipse-outline'}
            size={24}
            color={isDefaultAddress ? Colors.brand : Colors.textSecondary}
          />
          <Text style={[styles.defaultToggleText, !isDefaultAddress && styles.defaultToggleTextMuted]}>
            Set as default delivery address
          </Text>
        </AnimatedPressable>

        <View style={{ height: 40 }} />
      </ScrollView>

      <View style={styles.footer}>
        <AnimatedPressable
          style={[styles.saveBtn, (!isFormValid || isSaving) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!isFormValid || isSaving}
          activeOpacity={0.9}
        >
          <Text style={[styles.saveBtnText, (!isFormValid || isSaving) && styles.saveBtnTextDisabled]}>
            {isSaving ? 'Processing...' : 'Save Address'}
          </Text>
        </AnimatedPressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  countrySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: PANEL_SOFT_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
  },
  countryText: {
    fontSize: 16,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },
  sheetTitle: { fontSize: 20, fontFamily: Typography.family.bold, color: Colors.textPrimary, marginBottom: 20 },
  content: { paddingTop: 10, paddingBottom: 40 },
  heroCopy: {
    fontSize: 28,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -1,
    lineHeight: 34,
    marginBottom: 40,
    maxWidth: '80%',
  },
  formGroup: { marginBottom: 24 },
  label: {
    fontSize: 13,
    fontFamily: Typography.family.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
    marginLeft: 4,
  },
  inputWrapper: {
    backgroundColor: PANEL_BG,
    borderRadius: 20,
    paddingHorizontal: 20,
    height: 60,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: PANEL_BORDER,
  },
  input: {
    fontSize: 16,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },
  row: { flexDirection: 'row', gap: 16 },
  defaultToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PANEL_BG,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
    padding: 20,
    borderRadius: 20,
    marginTop: 16,
    gap: 12,
  },
  defaultToggleRowActive: {
    borderColor: Colors.brand,
    backgroundColor: PANEL_SOFT_BG,
  },
  defaultToggleText: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  defaultToggleTextMuted: {
    color: Colors.textSecondary,
  },
  footer: { paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 0 : 20 },
  saveBtn: {
    backgroundColor: Colors.brand,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: PANEL_BORDER,
  },
  saveBtnDisabled: {
    backgroundColor: PANEL_SOFT_BG,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
  },
  saveBtnText: {
    color: Colors.background,
    fontSize: 16,
    fontFamily: Typography.family.bold,
  },
  saveBtnTextDisabled: {
    color: Colors.textMuted,
  },
});