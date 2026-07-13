import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Typography } from '../theme/designTokens';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import { useHaptic } from '../hooks/useHaptic';
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
  const personalisationPreferences = useStore((state) => state.personalisationPreferences);
  const updatePersonalisationPreferences = useStore((state) => state.updatePersonalisationPreferences);
  const genderFilter = personalisationPreferences.genderFilter;
  const categoriesAndSizesPref = personalisationPreferences.categoriesAndSizesPref;
  const brandsPref = personalisationPreferences.brandsPref;
  const membersPref = personalisationPreferences.membersPref;
  const [pickerMode, setPickerMode] = useState<PreferencePickerMode>(null);
  const { show } = useToast();
  const { colors, isDark } = useAppTheme();
  const haptic = useHaptic();

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
        {/* 2. Editorial introduction */}
        <View style={styles.intro}>
          <Text style={styles.introTitle}>Personalisation</Text>
          <Text style={styles.introBody}>
            Set the shopping preferences you want to keep.
          </Text>
          <Text style={styles.introBody}>
            Your choices are saved automatically.
          </Text>
        </View>

        {/* 3. Visual shopping-audience selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shop for</Text>
          <AudiencePreferenceGrid
            selectedGenders={genderFilter}
            onSelect={handleSelectGender}
          />
        </View>

        {/* 4. Discovery preference rows */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Discovery preferences</Text>
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
        </View>

        {/* 6. Optional reset action */}
        <Pressable
          style={styles.resetBtn}
          onPress={handleReset}
          hitSlop={{ top: 8, bottom: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Reset preferences to defaults"
        >
          <Ionicons name="refresh-outline" size={16} color={colors.textMuted} />
          <Text style={styles.resetBtnText}>Reset preferences</Text>
        </Pressable>
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

const styles = StyleSheet.create({
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerSaved: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
  },

  // Scroll
  scrollContent: {
    paddingHorizontal: Space.md,
  },

  // Editorial introduction
  intro: {
    paddingTop: Space.lg,
    paddingBottom: Space.lg,
    gap: Space.xs,
  },
  introTitle: {
    fontSize: 28,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.5,
  },
  introBody: {
    fontSize: 15,
    fontFamily: Typography.family.regular,
    lineHeight: 21,
  },

  // Section
  section: {
    marginBottom: Space.lg,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
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
    minHeight: 48,
  },
  resetBtnText: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
  },
});