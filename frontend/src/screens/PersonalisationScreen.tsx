import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { Space, Radius, Type } from '../theme/designTokens';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { SettingsCard } from '../components/settings/SettingsCard';
import { SettingsCell } from '../components/SettingsCell';
import { Typography } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';

type PreferencePickerMode = 'categories' | 'brands' | 'members' | null;

const CATEGORY_SIZE_OPTIONS = ['Balanced', 'Mostly XS-S', 'Mostly M-L', 'All sizes'];
const BRAND_OPTIONS = ['Any', 'Streetwear first', 'Luxury first', 'Vintage first'];
const MEMBER_OPTIONS = ['Everyone', 'Verified sellers first', 'People I follow first'];

export default function PersonalisationScreen() {
  const navigation = useNavigation<any>();
  const personalisationPreferences = useStore((state) => state.personalisationPreferences);
  const updatePersonalisationPreferences = useStore((state) => state.updatePersonalisationPreferences);
  const genderFilter = personalisationPreferences.genderFilter;
  const categoriesAndSizesPref = personalisationPreferences.categoriesAndSizesPref;
  const brandsPref = personalisationPreferences.brandsPref;
  const membersPref = personalisationPreferences.membersPref;
  const [pickerMode, setPickerMode] = useState<PreferencePickerMode>(null);
  const { show } = useToast();

  const genderOptions = ['Women', 'Men', 'Kids', 'All'];

  const toggleGender = (g: string) => {
    const next = genderFilter.includes(g) ? genderFilter.filter((x) => x !== g) : [...genderFilter, g];
    updatePersonalisationPreferences({ genderFilter: next });
  };

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

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Personalisation" subtitle="Customise your experience" onBack={() => navigation.goBack()} />}
    >
      {/* Hero */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
        <Text style={styles.heroLine}>See only good fits</Text>
        <Text style={styles.heroSubtitle}>
          Set your preferences to tailor your feed, search results and recommendations to your
          exact taste.
        </Text>
      </Reanimated.View>

      {/* Visual Preview */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(40)}>
        <View style={[styles.previewCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <Text style={[styles.previewTitle, { color: Colors.textMuted }]}>Preview</Text>
          <View style={styles.previewRow}>
            <Ionicons name="filter-outline" size={16} color={Colors.brand} />
            <Text style={[styles.previewText, { color: Colors.textPrimary }]}>
              Gender: {genderFilter.length > 0 ? genderFilter.join(', ') : 'All'}
            </Text>
          </View>
          <View style={styles.previewRow}>
            <Ionicons name="grid-outline" size={16} color={Colors.brand} />
            <Text style={[styles.previewText, { color: Colors.textPrimary }]}>
              Categories: {categoriesAndSizesPref}
            </Text>
          </View>
          <View style={styles.previewRow}>
            <Ionicons name="barcode-outline" size={16} color={Colors.brand} />
            <Text style={[styles.previewText, { color: Colors.textPrimary }]}>
              Brands: {brandsPref}
            </Text>
          </View>
          <View style={styles.previewRow}>
            <Ionicons name="people-outline" size={16} color={Colors.brand} />
            <Text style={[styles.previewText, { color: Colors.textPrimary }]}>
              Members: {membersPref}
            </Text>
          </View>
        </View>
      </Reanimated.View>

      {/* Gender Preference Pills */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(80)}>
        <Text style={styles.sectionTitle}>Gender</Text>
        <View style={styles.genderRow}>
          {genderOptions.map((g) => (
            <AnimatedPressable
              key={g}
              style={[styles.genderPill, genderFilter.includes(g) && styles.genderPillActive]}
              onPress={() => toggleGender(g)}
              accessibilityRole="button"
              accessibilityState={{ selected: genderFilter.includes(g) }}
              accessibilityLabel={`Toggle ${g} preference`}
              accessibilityHint="Adds or removes this preference from your feed filters"
              hapticFeedback="light"
              scaleValue={0.95}
            >
              <Text
                style={[styles.genderPillText, genderFilter.includes(g) && styles.genderPillTextActive]}
              >
                {g}
              </Text>
            </AnimatedPressable>
          ))}
        </View>
      </Reanimated.View>

      {/* Preference Rows */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(140)}>
        <Text style={styles.sectionTitle}>Your Preferences</Text>
        <SettingsCard>
          <SettingsCell
            icon="grid-outline"
            iconColor={Colors.textPrimary}
            title="Categories and sizes"
            value={categoriesAndSizesPref}
            isFirst
            onPress={() => setPickerMode('categories')}
          />
          <SettingsCell
            icon="barcode-outline"
            iconColor={Colors.textPrimary}
            title="Brands"
            value={brandsPref}
            onPress={() => setPickerMode('brands')}
          />
          <SettingsCell
            icon="people-outline"
            iconColor={Colors.textPrimary}
            title="Members"
            value={membersPref}
            isLast
            onPress={() => setPickerMode('members')}
          />
        </SettingsCard>
      </Reanimated.View>

      {/* Personalisation Info Card */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(180)}>
        <SettingsCard variant="tint" style={styles.personalisationInfoCard}>
          <View style={styles.infoCardRow}>
            <Ionicons name="sparkles-outline" size={20} color={Colors.brand} />
            <Text style={styles.infoText}>
              Personalisation helps us surface items you'll love. Your choices
              update your feed, search, and recommendations instantly.
            </Text>
          </View>
        </SettingsCard>
      </Reanimated.View>

      {/* Info Card */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(220)}>
        <View style={[styles.infoCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.brand} />
          <Text style={styles.infoText}>
            Your preferences are applied as filters across your feed and search. They never hide
            items permanently.
          </Text>
        </View>
      </Reanimated.View>

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
  heroLine: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginBottom: Space.xs,
    letterSpacing: Type.title.letterSpacing,
    lineHeight: Type.title.lineHeight,
  },
  heroSubtitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    lineHeight: Type.body.lineHeight,
    marginBottom: Space.lg,
    letterSpacing: Type.body.letterSpacing,
  },
  previewCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Space.md,
    marginBottom: Space.lg,
  },
  previewTitle: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Space.sm,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.xs,
  },
  previewText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  genderRow: {
    flexDirection: 'row',
    gap: Space.sm + Space.xs,
    marginBottom: Space.lg,
    flexWrap: 'wrap',
  },
  genderPill: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + Space.xs,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  genderPillActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  genderPillText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
    letterSpacing: Type.body.letterSpacing,
  },
  genderPillTextActive: {
    color: Colors.textInverse,
    fontFamily: Typography.family.semibold,
  },
  sectionTitle: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: Type.meta.letterSpacing,
    marginBottom: Space.sm,
    marginLeft: Space.xs,
  },
  personalisationInfoCard: {
    padding: Space.md,
  },
  infoCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    borderRadius: Radius.lg,
    padding: Space.md,
    borderWidth: 0.5,
    marginTop: Space.md,
  },
  infoText: {
    flex: 1,
    fontSize: Type.caption.size,
    color: Colors.textSecondary,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
});