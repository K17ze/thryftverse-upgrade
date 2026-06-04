import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { ActiveTheme, Colors } from '../constants/colors';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { Space, Radius, Type } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Typography } from '../constants/typography';

type Props = StackScreenProps<RootStackParamList, 'PrivacySettings'>;

interface RowDef {
  icon: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  toggleValue?: boolean;
  onToggle?: (v: boolean) => void;
  isFirst?: boolean;
  isLast?: boolean;
}

function SettingRow({
  icon,
  title,
  subtitle,
  value,
  onPress,
  toggleValue,
  onToggle,
  isFirst,
  isLast,
}: RowDef) {
  return (
    <AnimatedPressable
      onPress={onPress}
      activeOpacity={0.75}
      scaleValue={0.995}
      hapticFeedback="light"
      disabled={!onPress && !onToggle}
    >
      <View style={[styles.rowRoot, !isLast && styles.rowBorder]}>
        <View style={styles.rowIconWrap}>
          <Ionicons name={icon as any} size={22} color={Colors.textPrimary} />
        </View>
        <View style={styles.rowTextWrap}>
          <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.rowSubtitle} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        <View style={styles.rowRight}>
          {value ? <Text style={styles.rowValue} numberOfLines={1}>{value}</Text> : null}
          {onToggle ? (
            <View style={styles.toggleTrack}>
              <View style={[styles.toggleKnob, toggleValue ? styles.toggleKnobOn : styles.toggleKnobOff]} />
            </View>
          ) : onPress ? (
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          ) : null}
        </View>
      </View>
    </AnimatedPressable>
  );
}

export default function PrivacySettingsScreen({ navigation }: Props) {
  const { show } = useToast();
  const accountPreferences = useStore((s) => s.accountPreferences);
  const updateAccountPreferences = useStore((s) => s.updateAccountPreferences);
  const blockedCount = useStore((s) => s.blockedUsers.length);

  const handleOpenExternal = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      show('Unable to open link', 'error');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={Colors.background}
      />

      <View style={styles.header}>
        <AnimatedPressable
          onPress={() => navigation.goBack()}
          style={styles.headerBack}
          scaleValue={0.92}
          hapticFeedback="light"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Privacy Controls</Text>
        <View style={styles.headerBack} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Profile visibility */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
          <Text style={styles.sectionLabel}>Profile</Text>
          <View style={styles.rowGroup}>
            <SettingRow
              icon="eye-outline"
              title="Private Profile"
              subtitle="Only approved followers can see your full profile and listings"
              toggleValue={accountPreferences.privateProfile}
              onToggle={(v) => updateAccountPreferences({ privateProfile: v })}
              isFirst
              isLast
            />
          </View>
        </Reanimated.View>

        {/* Activity */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(60)}>
          <Text style={styles.sectionLabel}>Activity</Text>
          <View style={styles.rowGroup}>
            <SettingRow
              icon="bag-outline"
              title="Holiday Mode"
              subtitle="Pause your listings and hide your shop while you’re away"
              toggleValue={accountPreferences.holidayMode}
              onToggle={(v) => updateAccountPreferences({ holidayMode: v })}
              isFirst
              isLast
            />
          </View>
        </Reanimated.View>

        {/* Safety */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(120)}>
          <Text style={styles.sectionLabel}>Safety</Text>
          <View style={styles.rowGroup}>
            <SettingRow
              icon="people-circle-outline"
              title="Blocked users"
              value={blockedCount > 0 ? `${blockedCount}` : 'None'}
              onPress={() => navigation.navigate('BlockedUsers')}
              isFirst
            />
            <SettingRow
              icon="chatbubble-ellipses-outline"
              title="Chat privacy"
              subtitle="Who can message me, read receipts, and more"
              onPress={() => navigation.navigate('ChatSettings')}
              isLast
            />
          </View>
        </Reanimated.View>

        {/* Data */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(180)}>
          <Text style={styles.sectionLabel}>Data & transparency</Text>
          <View style={styles.rowGroup}>
            <SettingRow
              icon="document-text-outline"
              title="Privacy Policy"
              onPress={() => void handleOpenExternal('https://thryftverse.app/privacy')}
              isFirst
            />
            <SettingRow
              icon="shield-checkmark-outline"
              title="Terms of Service"
              onPress={() => void handleOpenExternal('https://thryftverse.app/terms')}
              isLast
            />
          </View>
        </Reanimated.View>

        <View style={{ height: Space.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 4,
  },
  headerBack: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
    lineHeight: Type.subtitle.lineHeight,
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
  },
  sectionLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginBottom: Space.sm + 4,
    marginTop: Space.lg,
    letterSpacing: Type.body.letterSpacing,
  },
  rowGroup: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Space.sm,
  },
  rowRoot: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Space.md,
    minHeight: 56,
    gap: Space.sm + 4,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowIconWrap: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.body.lineHeight,
  },
  rowSubtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 2,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  rowValue: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    maxWidth: 140,
    letterSpacing: Type.body.letterSpacing,
  },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.textPrimary,
  },
  toggleKnobOn: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.brand,
  },
  toggleKnobOff: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.textMuted,
  },
});
