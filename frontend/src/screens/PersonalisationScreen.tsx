import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { ActiveTheme, Colors } from '../constants/colors';
import { Space, Radius, Type } from '../theme/designTokens';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { useToast } from '../context/ToastContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { SettingsHeader } from '../components/settings/SettingsHeader';
import { SettingsCard } from '../components/settings/SettingsCard';
import { SettingsCell } from '../components/SettingsCell';

type PreferencePickerMode = 'categories' | 'brands' | 'members' | null;

const CATEGORY_SIZE_OPTIONS = ['Balanced', 'Mostly XS-S', 'Mostly M-L', 'All sizes'];
const BRAND_OPTIONS = ['Any', 'Streetwear first', 'Luxury first', 'Vintage first'];
const MEMBER_OPTIONS = ['Everyone', 'Verified sellers first', 'People I follow first'];

export default function PersonalisationScreen() {
  const navigation = useNavigation<any>();
  const [genderFilter, setGenderFilter] = useState<string[]>(['Women', 'Men']);
  const [categoriesAndSizesPref, setCategoriesAndSizesPref] = useState('Balanced');
  const [brandsPref, setBrandsPref] = useState('Any');
  const [membersPref, setMembersPref] = useState('Everyone');
  const [pickerMode, setPickerMode] = useState<PreferencePickerMode>(null);
  const { show } = useToast();

  const genderOptions = ['Women', 'Men', 'Kids', 'All'];

  const toggleGender = (g: string) => {
    setGenderFilter((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
    );
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
      setCategoriesAndSizesPref(value);
      show('Categories and sizes preference updated.', 'success');
      return;
    }
    if (pickerMode === 'brands') {
      setBrandsPref(value);
      show('Brand preference updated.', 'success');
      return;
    }
    if (pickerMode === 'members') {
      setMembersPref(value);
      show('Member preference updated.', 'success');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={Colors.background}
      />

      <SettingsHeader title="Personalisation" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
          <Text style={styles.heroLine}>See only good fits</Text>
          <Text style={styles.heroSubtitle}>
            Set your preferences to tailor your feed, search results and recommendations to your
            exact taste.
          </Text>
        </Reanimated.View>

        {/* Gender Preference Pills */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(80)}>
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
        <Reanimated.View entering={FadeInDown.duration(300).delay(160)}>
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

        {/* Info Card */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(240)}>
          <View style={styles.infoCard}>
            <Ionicons name="information-circle-outline" size={20} color={Colors.brand} />
            <Text style={styles.infoText}>
              Your preferences are applied as filters across your feed and search. They never hide
              items permanently.
            </Text>
          </View>
        </Reanimated.View>
      </ScrollView>

      <BottomSheetPicker
        visible={pickerMode !== null}
        onClose={() => setPickerMode(null)}
        title={pickerTitle}
        options={pickerOptions}
        selectedValue={selectedPickerValue}
        onSelect={handleSelectPreference}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
  },
  heroLine: {
    fontSize: Type.title.size,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
    marginBottom: Space.xs,
    letterSpacing: Type.title.letterSpacing,
    lineHeight: Type.title.lineHeight,
  },
  heroSubtitle: {
    fontSize: Type.body.size,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    lineHeight: Type.body.lineHeight,
    marginBottom: Space.lg,
    letterSpacing: Type.body.letterSpacing,
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
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  genderPillActive: {
    backgroundColor: `${Colors.brand}22`,
    borderColor: Colors.brand,
  },
  genderPillText: {
    fontSize: Type.body.size,
    fontFamily: 'Inter_500Medium',
    color: Colors.textMuted,
    letterSpacing: Type.body.letterSpacing,
  },
  genderPillTextActive: {
    color: Colors.brand,
    fontFamily: 'Inter_600SemiBold',
  },
  sectionTitle: {
    fontSize: Type.meta.size,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: Type.meta.letterSpacing,
    marginBottom: Space.sm,
    marginLeft: Space.xs,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
    padding: Space.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginTop: Space.md,
  },
  infoText: {
    flex: 1,
    fontSize: Type.caption.size,
    color: Colors.textSecondary,
    lineHeight: Type.caption.lineHeight,
    fontFamily: 'Inter_400Regular',
    letterSpacing: Type.caption.letterSpacing,
  },
});
