import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { Space, Radius, Type } from '../theme/designTokens';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import { useHaptic } from '../hooks/useHaptic';
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
  const haptic = useHaptic();

  const profileStrength = useMemo(() => {
    let score = 0;
    const total = 4;
    if (genderFilter.length > 0 && !(genderFilter.length === 1 && genderFilter[0] === 'All')) score++;
    if (categoriesAndSizesPref !== 'Balanced') score++;
    if (brandsPref !== 'Any') score++;
    if (membersPref !== 'Everyone') score++;
    return { score, total, percent: Math.round((score / total) * 100) };
  }, [genderFilter, categoriesAndSizesPref, brandsPref, membersPref]);

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
      {/* Profile Strength */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
        <View style={styles.strengthHeader}>
          <Text style={styles.strengthLabel}>Profile strength</Text>
          <Text style={[styles.strengthValue, { color: profileStrength.percent === 100 ? Colors.success : Colors.brand }]}>
            {profileStrength.percent}%
          </Text>
        </View>
        <View style={[styles.strengthTrack, { backgroundColor: Colors.surfaceAlt }]}>
          <View
            style={[
              styles.strengthFill,
              {
                width: `${profileStrength.percent}%`,
                backgroundColor: profileStrength.percent === 100 ? Colors.success : Colors.brand,
              },
            ]}
          />
        </View>
        <Text style={styles.strengthHint}>
          {profileStrength.percent === 100
            ? 'Your profile is fully tuned. Great finds ahead.'
            : `${profileStrength.total - profileStrength.score} more preference${profileStrength.total - profileStrength.score === 1 ? '' : 's'} will unlock better recommendations.`}
        </Text>
      </Reanimated.View>

      {/* Visual Preview */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(40)}>
        <View style={[styles.previewCard, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <View style={styles.previewHeader}>
            <Ionicons name="options-outline" size={18} color={Colors.brand} />
            <Text style={[styles.previewTitle, { color: Colors.textMuted }]}>YOUR FILTERS</Text>
          </View>
          <View style={styles.previewRow}>
            <Ionicons name="filter-outline" size={16} color={Colors.textSecondary} />
            <Text style={[styles.previewText, { color: Colors.textPrimary }]}>
              Gender: {genderFilter.length > 0 ? genderFilter.join(', ') : 'All'}
            </Text>
          </View>
          <View style={styles.previewRow}>
            <Ionicons name="grid-outline" size={16} color={Colors.textSecondary} />
            <Text style={[styles.previewText, { color: Colors.textPrimary }]}>
              Categories: {categoriesAndSizesPref}
            </Text>
          </View>
          <View style={styles.previewRow}>
            <Ionicons name="barcode-outline" size={16} color={Colors.textSecondary} />
            <Text style={[styles.previewText, { color: Colors.textPrimary }]}>
              Brands: {brandsPref}
            </Text>
          </View>
          <View style={styles.previewRow}>
            <Ionicons name="people-outline" size={16} color={Colors.textSecondary} />
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
            onPress={() => { haptic.light(); setPickerMode('categories'); }}
          />
          <SettingsCell
            icon="barcode-outline"
            iconColor={Colors.textPrimary}
            title="Brands"
            value={brandsPref}
            onPress={() => { haptic.light(); setPickerMode('brands'); }}
          />
          <SettingsCell
            icon="people-outline"
            iconColor={Colors.textPrimary}
            title="Members"
            value={membersPref}
            isLast
            onPress={() => { haptic.light(); setPickerMode('members'); }}
          />
        </SettingsCard>
      </Reanimated.View>

      {/* Footer Note */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(180)}>
        <View style={styles.footerNote}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.footerNoteText}>
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
  strengthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Space.xs,
  },
  strengthLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: Type.meta.letterSpacing,
  },
  strengthValue: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.meta.letterSpacing,
  },
  strengthTrack: {
    height: 6,
    borderRadius: Radius.full,
    overflow: 'hidden',
    marginBottom: Space.sm,
  },
  strengthFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  strengthHint: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    lineHeight: Type.caption.lineHeight,
    marginBottom: Space.lg,
    letterSpacing: Type.caption.letterSpacing,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.sm,
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
  footerNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    borderRadius: Radius.lg,
    padding: Space.md,
    backgroundColor: Colors.surfaceAlt,
    marginTop: Space.md,
  },
  footerNoteText: {
    flex: 1,
    fontSize: Type.caption.size,
    color: Colors.textSecondary,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
});