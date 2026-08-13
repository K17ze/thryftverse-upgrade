import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, LetterSpacing } from '../theme/designTokens';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { AudiencePreferenceGrid } from '../components/personalisation/AudiencePreferenceGrid';
import { DiscoveryPreferenceRow } from '../components/personalisation/DiscoveryPreferenceRow';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';

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
  const { show } = useToast();
  const haptic = useHaptic();
  const reducedMotionEnabled = useReducedMotion();

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
    Alert.alert(
      'Reset preferences',
      'Reset all preferences to their default values?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          onPress: () => {
            haptic.medium();
            updatePersonalisationPreferences({
              genderFilter: DEFAULT_GENDER_FILTER,
              categoriesAndSizesPref: DEFAULT_CATEGORIES_PREF,
              brandsPref: DEFAULT_BRANDS_PREF,
              membersPref: DEFAULT_MEMBERS_PREF,
            });
            show('Preferences reset to defaults.', 'success');
          },
        },
      ]
    );
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Personalisation"
          onBack={() => navigation.goBack()}
          rightAction={
            <View style={styles.headerRight}>
              <Ionicons name="checkmark-circle" size={14} color={colors.success} />
              <Text style={styles.headerSaved}>Saved</Text>
            </View>
          }
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
        {/* Hero summary — personalisation status */}
        <Reanimated.View entering={FadeInDown.duration(300)}>
          <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.heroRow}>
              <View style={[styles.heroIcon, { backgroundColor: colors.brand }]}>
                <Ionicons name="options-outline" size={18} color={colors.textInverse} />
              </View>
              <View style={styles.heroText}>
                <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                  {genderFilter.includes('All') ? 'All categories' : `${genderFilter.join(', ')} selected`}
                </Text>
                <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                  {brandsPref === 'Any' && membersPref === 'Everyone' ? 'Default discovery' : 'Custom discovery'}
                </Text>
              </View>
              <View style={[styles.heroBadge, { backgroundColor: colors.success + '15' }]}>
                <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                <Text style={[styles.heroBadgeText, { color: colors.success }]}>Saved</Text>
              </View>
            </View>
          </View>
        </Reanimated.View>

        {/* Visual shopping-audience selection */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(60)} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Shop for</Text>
          <AudiencePreferenceGrid
            selectedGenders={genderFilter}
            onSelect={handleSelectGender}
          />
        </Reanimated.View>

        {/* Discovery preference rows */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(120)} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Discovery preferences</Text>
          <View style={styles.discoveryGroup}>
            <DiscoveryPreferenceRow
              icon="grid-outline"
              title="Categories and sizes"
              explanation="Keep a preferred size mix."
              value={categoriesAndSizesPref}
              onPress={() => { haptic.light(); setPickerMode('categories'); }}
            />
            <DiscoveryPreferenceRow
              icon="barcode-outline"
              title="Brands"
              explanation="Choose a general brand direction."
              value={brandsPref}
              onPress={() => { haptic.light(); setPickerMode('brands'); }}
            />
            <DiscoveryPreferenceRow
              icon="people-outline"
              title="Members"
              explanation="Choose whose listings you prefer to browse."
              value={membersPref}
              onPress={() => { haptic.light(); setPickerMode('members'); }}
              isLast
            />
          </View>
        </Reanimated.View>

        {/* Optional reset action */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(180)}>
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
        </Reanimated.View>
      </ScrollView>

      {/* 7. BottomSheetPicker */}
      <BottomSheetPicker
        visible={pickerMode !== null}
        onClose={() => setPickerMode(null)}
        title={pickerTitle}
        options={pickerOptions}
        selectedValue={selectedPickerValue}
        onSelect={handleSelectPreference}
      />
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    headerSaved: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      color: colors.success,
    },

    // Scroll
    scrollContent: {
      paddingHorizontal: Space.md,
    },

    // Hero summary card
    heroCard: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      padding: Space.md,
      marginTop: Space.sm,
      marginBottom: Space.lg,
    },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
    },
    heroIcon: {
      width: Space.xxl - Space.sm,
      height: Space.xxl - Space.sm,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroText: { flex: 1 },
    heroTitle: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    heroSubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      marginTop: Space.xs / 2,
    },
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderRadius: Radius.full,
    },
    heroBadgeText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
    },

    // Section
    section: {
      marginBottom: Space.lg,
    },
    sectionTitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      textTransform: 'uppercase',
      letterSpacing: LetterSpacing.caps,
      marginBottom: Space.sm,
    },

    // Discovery group
    discoveryGroup: {
      paddingHorizontal: Space.xs,
    },

    // Reset
    resetBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.sm,
      paddingVertical: Space.md,
      marginTop: Space.sm,
      minHeight: Space.xxl,
    },
    resetBtnText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.medium,
    },
  });
}