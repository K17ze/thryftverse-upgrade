import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import { useHaptic } from '../hooks/useHaptic';
import { AudiencePreferenceGrid } from '../components/personalisation/AudiencePreferenceGrid';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { AppButton } from '../components/ui/AppButton';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { RootStackParamList } from '../navigation/types';

type PreferencePickerMode = 'categories' | 'brands' | 'members' | null;

const CATEGORY_SIZE_OPTIONS = ['Balanced', 'Mostly XS-S', 'Mostly M-L', 'All sizes'];
const BRAND_OPTIONS = ['Any', 'Streetwear first', 'Luxury first', 'Vintage first'];
const MEMBER_OPTIONS = ['Everyone', 'Verified sellers first', 'People I follow first'];

const DEFAULT_GENDER_FILTER = ['Women', 'Men'];
const DEFAULT_CATEGORIES_PREF = 'Balanced';
const DEFAULT_BRANDS_PREF = 'Any';
const DEFAULT_MEMBERS_PREF = 'Everyone';

export default function PersonalisationScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'Personalisation'>>();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const personalisationPreferences = useStore((state) => state.personalisationPreferences);
  const updatePersonalisationPreferences = useStore((state) => state.updatePersonalisationPreferences);
  const genderFilter = personalisationPreferences.genderFilter;
  const categoriesAndSizesPref = personalisationPreferences.categoriesAndSizesPref;
  const brandsPref = personalisationPreferences.brandsPref;
  const membersPref = personalisationPreferences.membersPref;
  const [pickerMode, setPickerMode] = useState<PreferencePickerMode>(null);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmLabel?: string;
    variant?: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });
  const { show } = useToast();
  const haptic = useHaptic();
  const fromOnboarding = route.params?.fromOnboarding === true;

  const handleContinue = useCallback(() => {
    haptic.medium();
    navigation.replace('AuthLanding');
  }, [haptic, navigation]);

  const handleSkip = useCallback(() => {
    haptic.light();
    navigation.replace('AuthLanding');
  }, [haptic, navigation]);

  const handleSelectGender = useCallback(
    (gender: string) => {
      haptic.light();

      if (gender === 'All') {
        updatePersonalisationPreferences({ genderFilter: ['All'] });
        return;
      }

      const withoutAll = genderFilter.filter((g) => g !== 'All');
      const isSelected = withoutAll.includes(gender);
      let next: string[];

      if (isSelected) {
        next = withoutAll.filter((g) => g !== gender);
        if (next.length === 0) {
          next = ['All'];
        }
      } else {
        next = [...withoutAll, gender];
      }

      updatePersonalisationPreferences({ genderFilter: next });
    },
    [genderFilter, updatePersonalisationPreferences, haptic]
  );

  const pickerTitle =
    pickerMode === 'categories'
      ? 'Categories and Sizes'
      : pickerMode === 'brands'
      ? 'Brand Preference'
      : pickerMode === 'members'
      ? 'Member Preference'
      : 'Preference';

  const pickerOptions =
    pickerMode === 'categories'
      ? CATEGORY_SIZE_OPTIONS
      : pickerMode === 'brands'
      ? BRAND_OPTIONS
      : pickerMode === 'members'
      ? MEMBER_OPTIONS
      : [];

  const selectedPickerValue =
    pickerMode === 'categories'
      ? categoriesAndSizesPref
      : pickerMode === 'brands'
      ? brandsPref
      : pickerMode === 'members'
      ? membersPref
      : undefined;

  const handleSelectPreference = (value: string) => {
    if (pickerMode === 'categories') {
      updatePersonalisationPreferences({ categoriesAndSizesPref: value });
      show('Categories and sizes preference updated.', 'success');
      return;
    }
    if (pickerMode === 'brands') {
      updatePersonalisationPreferences({ brandsPref: value });
      show('Brand preference updated.', 'success');
      return;
    }
    if (pickerMode === 'members') {
      updatePersonalisationPreferences({ membersPref: value });
      show('Member preference updated.', 'success');
    }
  };

  const handleReset = () => {
    setConfirmSheet({
      visible: true,
      title: 'Reset preferences',
      message: 'Reset all preferences to their default values?',
      confirmLabel: 'Reset',
      onConfirm: () => {
        haptic.medium();
        updatePersonalisationPreferences({
          genderFilter: DEFAULT_GENDER_FILTER,
          categoriesAndSizesPref: DEFAULT_CATEGORIES_PREF,
          brandsPref: DEFAULT_BRANDS_PREF,
          membersPref: DEFAULT_MEMBERS_PREF });
        show('Preferences reset to defaults.', 'success');
      } });
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Personalisation"
          onBack={fromOnboarding ? undefined : () => navigation.goBack()}
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + Space.xxl + Space.lg },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Visual shopping-audience selection */}
        <SettingsSection title="Shop for">
          <AudiencePreferenceGrid
            selectedGenders={genderFilter}
            onSelect={handleSelectGender}
          />
        </SettingsSection>

        {/* Discovery preference rows — flat, hairline-separated */}
        <SettingsSection title="Discovery preferences">
          <SettingsRow
            icon="grid-outline"
            title="Categories and sizes"
            subtitle="Keep a preferred size mix."
            value={categoriesAndSizesPref}
            onPress={() => { haptic.light(); setPickerMode('categories'); }}
            isFirst
          />
          <SettingsRow
            icon="barcode-outline"
            title="Brands"
            subtitle="Choose a general brand direction."
            value={brandsPref}
            onPress={() => { haptic.light(); setPickerMode('brands'); }}
          />
          <SettingsRow
            icon="people-outline"
            title="Members"
            subtitle="Choose whose listings you prefer to browse."
            value={membersPref}
            onPress={() => { haptic.light(); setPickerMode('members'); }}
            isLast
          />
        </SettingsSection>

        {/* Optional reset action — flat, no card wrapper */}
        <View>
          <Pressable
            style={styles.resetBtn}
            onPress={handleReset}
            hitSlop={{ top: 8, bottom: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Reset preferences to defaults"
          >
            <Ionicons name="refresh-outline" size={16} color={colors.textMuted} />
            <Text style={[styles.resetBtnText, { color: colors.textMuted }]}>Reset preferences</Text>
          </Pressable>
        </View>
      </ScrollView>

      {fromOnboarding && (
        <View style={[styles.onboardingFooter, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <Pressable
            onPress={handleSkip}
            hitSlop={Control.hit / 2}
            accessibilityRole="button"
            accessibilityLabel="Skip personalisation"
          >
            <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip for now</Text>
          </Pressable>
          <AppButton
            title="Continue"
            onPress={handleContinue}
            variant="primary"
            size="lg"
            style={styles.continueBtn}
            accessibilityLabel="Continue to the app"
          />
        </View>
      )}

      {/* 7. BottomSheetPicker */}
      <BottomSheetPicker
        visible={pickerMode !== null}
        onClose={() => setPickerMode(null)}
        title={pickerTitle}
        options={pickerOptions}
        selectedValue={selectedPickerValue}
        onSelect={handleSelectPreference}
      />

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((prev) => ({ ...prev, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'default'}
        onConfirm={confirmSheet.onConfirm}
      />
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // Scroll
    scrollContent: {
      paddingHorizontal: Space.md },

    // Reset
    resetBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.sm,
      paddingVertical: Space.md,
      marginTop: Space.sm,
      minHeight: Space.xxl },
    resetBtnText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily },

    // Onboarding footer
    onboardingFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.lg,
      paddingTop: Space.md,
      paddingBottom: Space.md,
      borderTopWidth: StyleSheet.hairlineWidth },
    skipText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily },
    continueBtn: {
      flex: 1,
      marginLeft: Space.md } });
}