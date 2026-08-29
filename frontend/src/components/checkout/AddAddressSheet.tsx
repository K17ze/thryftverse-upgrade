import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Platform, Pressable } from 'react-native';
import { BottomSheet } from '../BottomSheet';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Stroke} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import { useStore } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import { createUserAddress } from '../../services/commerceApi';
import { useHaptic } from '../../hooks/useHaptic';

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
  const { colors } = useAppTheme();
  const haptic = useHaptic();
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

  const styles = useMemo(() => createStyles(colors), [colors]);

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

    haptic.medium();

    const nextAddress = {
      name: name.trim(),
      streetAddress: streetAddress.trim(),
      apartment: apartment.trim() || undefined,
      city: city.trim(),
      region: needsRegion ? region.trim() : undefined,
      postalCode: postalCode.trim().toUpperCase(),
      countryCode,
      country: selectedCountry.name,
      isDefault: isDefaultAddress };

    const userId = currentUser?.id;
    if (!userId) {
      show('You must be signed in to save an address.', 'error');
      setIsSaving(false);
      onDismiss();
      return;
    }

    setIsSaving(true);
    try {
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
        isDefault: saved.isDefault });
      show('Delivery address saved', 'success');
      haptic.success();
    } catch {
      saveAddress(nextAddress);
      show('Address saved locally. Backend sync unavailable.', 'info');
      haptic.warning();
    } finally {
      setIsSaving(false);
      onDismiss();
      if (onSuccess) onSuccess();
    }
  };

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} snapPoint={0.88}>
      <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
        Delivery address
      </Text>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.heroCopy, { color: colors.textPrimary }]}>
          Where should we send your items?
        </Text>

        {/* Country Selector — flat with hairline border */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Country</Text>
          <Pressable
            style={[styles.countrySelector, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => setShowCountryPicker(true)}
            accessibilityRole="button"
            accessibilityLabel="Select country"
          >
            <Text style={[styles.countryText, { color: colors.textPrimary }]}>
              {selectedCountry.name}
            </Text>
            <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Full Name */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Full name</Text>
          <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.input }]}>
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              placeholder="Jane Doe"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
              selectionColor={colors.brand}
            />
          </View>
        </View>

        {/* Street Address Line 1 */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Street address</Text>
          <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.input }]}>
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              placeholder="123 Example Street"
              placeholderTextColor={colors.textMuted}
              value={streetAddress}
              onChangeText={setStreetAddress}
              selectionColor={colors.brand}
            />
          </View>
        </View>

        {/* Apartment/Unit (optional) */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Apartment, suite, unit (optional)
          </Text>
          <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.input }]}>
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              placeholder="Apt 4B, Floor 3, etc."
              placeholderTextColor={colors.textMuted}
              value={apartment}
              onChangeText={setApartment}
              selectionColor={colors.brand}
            />
          </View>
        </View>

        {/* City */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>City</Text>
          <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.input }]}>
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              placeholder="London"
              placeholderTextColor={colors.textMuted}
              value={city}
              onChangeText={setCity}
              selectionColor={colors.brand}
            />
          </View>
        </View>

        {/* Region/State (conditional) */}
        {needsRegion && (
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              {countryCode === 'US' ? 'State' :
               countryCode === 'CA' ? 'Province' :
               countryCode === 'JP' ? 'Prefecture' :
               countryCode === 'IN' ? 'State' : 'Region'}
            </Text>
            <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.input }]}>
              <TextInput
                style={[styles.input, { color: colors.textPrimary }]}
                placeholder={countryCode === 'US' ? 'California' : 'Enter region'}
                placeholderTextColor={colors.textMuted}
                value={region}
                onChangeText={setRegion}
                selectionColor={colors.brand}
              />
            </View>
          </View>
        )}

        {/* Postal Code */}
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {selectedCountry.postalLabel}
          </Text>
          <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.input }]}>
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              placeholder={countryCode === 'US' ? '10001' : 'SW1A 1AA'}
              placeholderTextColor={colors.textMuted}
              value={postalCode}
              onChangeText={setPostalCode}
              selectionColor={colors.brand}
              autoCapitalize="characters"
            />
          </View>
        </View>

        {/* Default address toggle — flat row with hairline separator */}
        <Pressable
          style={[
            styles.defaultToggleRow,
            {
              borderColor: isDefaultAddress ? colors.brand : colors.borderSubtle,
              backgroundColor: isDefaultAddress ? colors.surface : 'transparent' },
          ]}
          onPress={() => {
            setIsDefaultAddress(!isDefaultAddress);
            haptic.light();
          }}
          accessibilityRole="switch"
          accessibilityState={{ checked: isDefaultAddress }}
          accessibilityLabel="Set as default delivery address"
        >
          <Ionicons
            name={isDefaultAddress ? "checkmark-circle" : "ellipse-outline"}
            size={24}
            color={isDefaultAddress ? colors.brand : colors.textSecondary}
          />
          <Text style={[
            styles.defaultToggleText,
            { color: isDefaultAddress ? colors.textPrimary : colors.textSecondary },
          ]}>
            Set as default delivery address
          </Text>
        </Pressable>

        <View style={{ height: Space.xl }} />
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[
            styles.saveBtn,
            {
              backgroundColor: (!isFormValid || isSaving) ? colors.surfaceAlt : colors.brand,
              borderColor: colors.borderSubtle },
          ]}
          onPress={handleSave}
          disabled={!isFormValid || isSaving}
          accessibilityRole="button"
          accessibilityLabel="Save address"
          accessibilityState={{ disabled: !isFormValid || isSaving }}
        >
          <Text style={[
            styles.saveBtnText,
            {
              color: (!isFormValid || isSaving) ? colors.textMuted : colors.textInverse },
          ]}>
            {isSaving ? 'Processing…' : 'Save address'}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

// ── Styles — factory for theme support ──────────────────────────────────────

function createStyles(colors: any) {
  return StyleSheet.create({
    sheetTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      marginBottom: Space.lg },
    content: {
      paddingTop: Space.sm,
      paddingBottom: Space.xxl + Space.md },
    heroCopy: {
      fontSize: TypographyV2.priceHero.size,
      lineHeight: TypographyV2.priceHero.lineHeight,
      fontFamily: TypographyV2.priceHero.fontFamily,
      letterSpacing: TypographyV2.priceHero.letterSpacing,
      marginBottom: Space.xxl,
      maxWidth: '80%' },
    formGroup: {
      marginBottom: Space.lg },
    label: {
      fontSize: TypographyV2.label.size,
      lineHeight: TypographyV2.label.lineHeight,
      fontFamily: TypographyV2.label.fontFamily,
      letterSpacing: TypographyV2.label.letterSpacing,
      textTransform: 'uppercase',
      marginBottom: Space.sm,
      marginLeft: Space.xs },
    // ── Input fields — per Design.md form-field: input background,
    // 52px height, Radius.xl. ──
    inputWrapper: {
      borderRadius: Radius.xl,
      paddingHorizontal: Space.lg,
      height: 52,
      justifyContent: 'center',
      borderWidth: Stroke.standard },
    input: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily },
    // ── Country selector ──
    countrySelector: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.md + 2,
      borderRadius: Radius.xl,
      borderWidth: Stroke.standard,
      minHeight: 52 },
    countryText: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily },
    // ── Default toggle — flat row ──
    defaultToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: Stroke.standard,
      padding: Space.md,
      borderRadius: Radius.xl,
      marginTop: Space.md,
      gap: Space.md,
      minHeight: 52 },
    defaultToggleText: {
      flex: 1,
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily },
    // ── Footer ──
    footer: {
      paddingTop: Space.sm,
      paddingBottom: Platform.OS === 'ios' ? 0 : Space.md },
    saveBtn: {
      height: 52,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: Stroke.standard },
    saveBtnText: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily } });
}
