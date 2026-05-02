import React, { useState } from 'react';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  StatusBar,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ActiveTheme, Colors } from '../constants/colors';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { createUserAddress } from '../services/commerceApi';
import { MOCK_USERS } from '../data/mockData';
import { CachedImage } from '../components/CachedImage';

type Props = StackScreenProps<RootStackParamList, 'AddAddress'>;
const IS_LIGHT = ActiveTheme === 'light';
const PANEL_BG = Colors.surface;
const PANEL_SOFT_BG = IS_LIGHT ? '#f7f4ef' : '#151515';
const PANEL_BORDER = Colors.border;
const FOOTER_BG = IS_LIGHT ? 'rgba(236,234,230,0.97)' : 'rgba(10,10,10,0.95)';

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

export default function AddAddressScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [apartment, setApartment] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [countryCode, setCountryCode] = useState('US');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [isDefaultAddress, setIsDefaultAddress] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const currentUser = useStore((state) => state.currentUser);
  const saveAddress = useStore((state) => state.saveAddress);
  const { show } = useToast();
  const supportUser = MOCK_USERS[0];

  const selectedCountry = COMMON_COUNTRIES.find(c => c.code === countryCode) || COMMON_COUNTRIES[0];
  const needsRegion = selectedCountry.needsState;

  const isFormValid = name.trim() && streetAddress.trim() && city.trim() && postalCode.trim();

  const handleSave = async () => {
    if (!isFormValid || isSaving) return;

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
    } catch {
      saveAddress(nextAddress);
      show('Address saved locally. Backend sync unavailable.', 'info');
    } finally {
      setIsSaving(false);
      navigation.goBack();
    }
  };

  const handleOpenDeliverySupport = React.useCallback(() => {
    navigation.navigate('Chat', {
      conversationId: 'c1',
      focusQuery: 'delivery address setup',
      partnerUserId: supportUser.id,
    });
    show('Opening support chat for delivery setup help.', 'info');
  }, [navigation, show, supportUser.id]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      <View style={styles.header}>
        <AnimatedPressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to the previous screen"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Delivery Address</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          
          <Text style={styles.heroCopy}>Where should we send your items?</Text>

          <View style={styles.supportRow}>
            <AnimatedPressable
              style={styles.supportIdentity}
              onPress={() => navigation.navigate('UserProfile', { userId: supportUser.id })}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Open @${supportUser.username} profile`}
              accessibilityHint="Shows delivery support profile"
            >
              <CachedImage
                uri={supportUser.avatar}
                style={styles.supportAvatar}
                containerStyle={styles.supportAvatarWrap}
                contentFit="cover"
              />
              <View style={styles.supportCopyWrap}>
                <Text style={styles.supportTitle}>Need delivery help?</Text>
                <Text style={styles.supportHandle}>@{supportUser.username}</Text>
              </View>
            </AnimatedPressable>

            <AnimatedPressable
              style={styles.supportMessageBtn}
              onPress={handleOpenDeliverySupport}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Message delivery support"
              accessibilityHint="Opens support chat for address setup"
            >
              <Ionicons name="chatbubble-ellipses-outline" size={12} color={Colors.textPrimary} />
            </AnimatedPressable>
          </View>

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
                accessibilityLabel="Full name"
                accessibilityHint="Enter your full delivery name"
              />
            </View>
          </View>

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
                accessibilityLabel="Street address"
                accessibilityHint="Enter your street and house number"
              />
            </View>
          </View>

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
                accessibilityLabel="Apartment or unit"
                accessibilityHint="Enter apartment, suite, or unit number"
              />
            </View>
          </View>

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
                accessibilityLabel="City"
                accessibilityHint="Enter your city or town"
              />
            </View>
          </View>

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
                  accessibilityLabel="Region"
                  accessibilityHint="Enter state, province, or region"
                />
              </View>
            </View>
          )}

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
                accessibilityLabel="Postal code"
                accessibilityHint="Enter your postal code"
              />
            </View>
          </View>

          <AnimatedPressable
            style={[styles.defaultToggleRow, isDefaultAddress && styles.defaultToggleRowActive]}
            activeOpacity={0.9}
            onPress={() => setIsDefaultAddress((current) => !current)}
            accessibilityRole="switch"
            accessibilityLabel="Set as default delivery address"
            accessibilityHint="Toggles whether this address is your default"
            accessibilityState={{ checked: isDefaultAddress }}
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

        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <AppButton
            title={isSaving ? 'Saving...' : 'Save Address'}
            onPress={handleSave}
            disabled={!isFormValid || isSaving}
            style={[styles.saveBtn, (!isFormValid || isSaving) && styles.saveBtnDisabled]}
            titleStyle={[styles.saveBtnText, (!isFormValid || isSaving) && styles.saveBtnTextDisabled]}
            accessibilityLabel={isSaving ? 'Saving address' : 'Save address'}
            accessibilityHint="Saves this delivery address"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
    backgroundColor: PANEL_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.textPrimary },

  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 },
  
  heroCopy: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
    letterSpacing: -1,
    lineHeight: 34,
    marginBottom: 40,
    maxWidth: '80%',
  },
  supportRow: {
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  supportIdentity: {
    flex: 1,
    minHeight: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
    backgroundColor: PANEL_BG,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  supportAvatarWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  supportAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  supportCopyWrap: {
    flex: 1,
  },
  supportTitle: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
  },
  supportHandle: {
    marginTop: 1,
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    color: Colors.textMuted,
  },
  supportMessageBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
    backgroundColor: PANEL_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },

  formGroup: { marginBottom: 24 },
  label: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
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
    fontFamily: 'Inter_500Medium',
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
    fontFamily: 'Inter_500Medium',
    color: Colors.textPrimary,
  },
  defaultToggleText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textPrimary,
  },
  defaultToggleTextMuted: {
    color: Colors.textSecondary,
  },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    borderTopWidth: 1,
    borderTopColor: PANEL_BORDER,
    backgroundColor: FOOTER_BG,
  },
  saveBtn: {
    backgroundColor: Colors.brand,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: PANEL_SOFT_BG,
    borderWidth: 1,
    borderColor: PANEL_BORDER,
  },
  saveBtnText: {
    color: Colors.background,
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  saveBtnTextDisabled: {
    color: Colors.textMuted,
  },
});
