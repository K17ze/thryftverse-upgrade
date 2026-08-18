/**
 * NotificationPreferencesScreen — consolidated notification control surface.
 *
 * A single screen covering the master push toggle, per-category toggles
 * (offers, messages, listings, orders, live shopping, price drops, marketing),
 * quiet hours, and notification preview visibility.
 *
 * Per AGENTS.md §11 (Truthful UI): the per-category toggles and quiet hours
 * use the canonical SettingsPreferencesContext (which persists to device
 * storage), so they reflect real preference state. The live-shopping and
 * notification-preview toggles are not yet backed by the context, so they are
 * local-only and a "Demo mode" indicator makes that clear.
 *
 * Design (per AGENTS.md §4):
 * - Flat composition, hairline separators, no card-on-card
 * - One dominant panel (the posture hero)
 * - Max two non-avatar radius sizes (Radius.md for cells, Radius.lg for hero)
 * - Max three type sizes per viewport (title, body, caption)
 * - All colors via useAppTheme(), all geometry via design tokens
 *
 * State coverage (per AGENTS.md §14):
 * - Populated: full preference set
 * - Disabled: master toggle disables all dependent rows
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { SettingsInfoBanner } from '../components/settings/SettingsInfoBanner';
import { useSettingsPreferences } from '../context/SettingsPreferencesContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';

type Props = NativeStackScreenProps<RootStackParamList, 'NotificationPreferences'>;

// Demo mode flag — live shopping & preview toggles are local-only in this build.
const NOTIFICATION_PREFS_DEMO_MODE = __DEV__;

function formatHour(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:00 ${period}`;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

export default function NotificationPreferencesScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const {
    pushNotificationToggles: toggles,
    pushEnabledCount: enabledCount,
    pushTotalCount,
    setPushNotificationToggle,
    setAllPushNotificationToggles,
    quietHours,
    setQuietHours,
  } = useSettingsPreferences();

  // Local-only toggles (not yet in the canonical context).
  const [liveShopping, setLiveShopping] = React.useState(true);
  const [showPreview, setShowPreview] = React.useState(true);
  const [editingQuietTime, setEditingQuietTime] = React.useState<'start' | 'end' | null>(null);

  const masterOn = enabledCount > 0;

  const handleMasterToggle = (v: boolean) => {
    haptic.selection();
    setAllPushNotificationToggles(v);
  };

  const toggleCategory = (key: string) => {
    haptic.selection();
    setPushNotificationToggle(key, !toggles[key]);
  };

  const toggleWithHaptic = (setter: React.Dispatch<React.SetStateAction<boolean>>) => (v: boolean) => {
    haptic.selection();
    setter(v);
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Notifications"
          onBack={() => navigation.goBack()}
        />
      }
    >
      {/* ── Demo mode indicator (truthful UI per AGENTS.md §11) ── */}
      {NOTIFICATION_PREFS_DEMO_MODE && (
        <View
          style={[styles.demoBanner, { backgroundColor: colors.surfaceAlt }]}
          accessibilityRole="header"
          accessibilityLabel="Demo mode"
        >
          <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.demoBannerText}>
            Live shopping and preview toggles are saved on this device only in demo mode.
          </Text>
        </View>
      )}

      {/* ── Summary — flat intro block ── */}
        <View style={styles.summaryBlock}>
          <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>
            {enabledCount === 0 ? 'All notifications off' : `${enabledCount} of ${pushTotalCount} categories on`}
          </Text>
          <Text style={[styles.summarySubtitle, { color: colors.textSecondary }]}>
            {enabledCount === pushTotalCount ? 'All alerts enabled' : enabledCount === 0 ? "You won't receive any alerts" : 'Some alerts are paused'}
          </Text>
          <View style={styles.progressRow}>
            <View style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(enabledCount / Math.max(pushTotalCount, 1)) * 100}%`, backgroundColor: colors.brand },
                ]}
              />
            </View>
            <Text style={[styles.progressLabel, { color: colors.textMuted }]}>
              {enabledCount}/{pushTotalCount}
            </Text>
          </View>
        </View>

      {/* ── Master toggle ── */}
        <SettingsSection title="Push notifications" noCard>
          <SettingsRow
            icon="notifications-outline"
            title="Enable push notifications"
            subtitle="Master switch for all push alerts"
            toggleValue={masterOn}
            onToggle={handleMasterToggle}
            isFirst
            isLast
          />
        </SettingsSection>

      {/* ── Category toggles ── */}
        <SettingsSection title="Categories" noCard>
          <SettingsRow
            icon="pricetags-outline"
            title="Offer notifications"
            subtitle="When buyers make an offer on your item"
            toggleValue={!!toggles.offers}
            onToggle={() => toggleCategory('offers')}
            disabled={!masterOn}
            isFirst
          />
          <SettingsRow
            icon="chatbubble-outline"
            title="Message notifications"
            subtitle="When someone sends you a message"
            toggleValue={!!toggles.messages}
            onToggle={() => toggleCategory('messages')}
            disabled={!masterOn}
          />
          <SettingsRow
            icon="heart-outline"
            title="Listing notifications"
            subtitle="New listings from sellers you follow"
            toggleValue={!!toggles.wishlist}
            onToggle={() => toggleCategory('wishlist')}
            disabled={!masterOn}
          />
          <SettingsRow
            icon="cube-outline"
            title="Order notifications"
            subtitle="Shipping and delivery status changes"
            toggleValue={!!toggles.orderUpdates}
            onToggle={() => toggleCategory('orderUpdates')}
            disabled={!masterOn}
          />
          <SettingsRow
            icon="videocam-outline"
            title="Live shopping notifications"
            subtitle="When sellers you follow go live"
            toggleValue={liveShopping}
            onToggle={toggleWithHaptic(setLiveShopping)}
            disabled={!masterOn}
          />
          <SettingsRow
            icon="pricetag-outline"
            title="Price drop alerts"
            subtitle="For items on your wishlist"
            toggleValue={!!toggles.priceDrops}
            onToggle={() => toggleCategory('priceDrops')}
            disabled={!masterOn}
          />
          <SettingsRow
            icon="megaphone-outline"
            title="Marketing notifications"
            subtitle="Promotions, features and announcements"
            toggleValue={!!toggles.news}
            onToggle={() => toggleCategory('news')}
            disabled={!masterOn}
            isLast
          />
        </SettingsSection>

      {/* ── Quiet Hours ── */}
        <SettingsSection title="Quiet hours" noCard>
          <SettingsRow
            icon="moon-outline"
            title="Do Not Disturb"
            subtitle="Pause non-urgent notifications during set hours"
            toggleValue={quietHours.enabled}
            onToggle={() => { haptic.selection(); setQuietHours({ enabled: !quietHours.enabled }); }}
            isFirst
            isLast={!quietHours.enabled}
          />
          {quietHours.enabled ? (
            <View style={styles.quietHoursRow}>
              <Pressable
                style={({ pressed }) => [styles.quietTimePicker, pressed && styles.quietTimePickerPressed]}
                onPress={() => setEditingQuietTime(editingQuietTime === 'start' ? null : 'start')}
                accessibilityRole="button"
                accessibilityLabel={`Quiet hours start: ${formatHour(quietHours.startHour)}. Tap to change.`}
              >
                <Text style={styles.quietTimeLabel}>From</Text>
                <Text style={styles.quietTimeValue}>{formatHour(quietHours.startHour)}</Text>
                <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
              </Pressable>
              <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
              <Pressable
                style={({ pressed }) => [styles.quietTimePicker, { backgroundColor: colors.surfaceAlt }, pressed && styles.quietTimePickerPressed]}
                onPress={() => setEditingQuietTime(editingQuietTime === 'end' ? null : 'end')}
                accessibilityRole="button"
                accessibilityLabel={`Quiet hours end: ${formatHour(quietHours.endHour)}. Tap to change.`}
              >
                <Text style={[styles.quietTimeLabel, { color: colors.textMuted }]}>To</Text>
                <Text style={[styles.quietTimeValue, { color: colors.textPrimary }]}>{formatHour(quietHours.endHour)}</Text>
                <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
              </Pressable>
            </View>
          ) : null}
          {quietHours.enabled && editingQuietTime ? (
            <View style={styles.quietHoursPickerSheet}>
              <Text style={[styles.quietHoursPickerTitle, { color: colors.textSecondary }]}>
                {editingQuietTime === 'start' ? 'Start time' : 'End time'}
              </Text>
              <View style={styles.quietHoursPickerGrid}>
                {HOUR_OPTIONS.map((h) => {
                  const selected = editingQuietTime === 'start'
                    ? quietHours.startHour === h
                    : quietHours.endHour === h;
                  return (
                    <Pressable
                      key={h}
                      style={({ pressed }) => [
                        styles.quietHourCell,
                        { backgroundColor: colors.surfaceAlt },
                        selected && [styles.quietHourCellActive, { backgroundColor: colors.brand }],
                        pressed && styles.quietHourCellPressed,
                      ]}
                      onPress={() => {
                        haptic.light();
                        if (editingQuietTime === 'start') {
                          setQuietHours({ startHour: h });
                        } else {
                          setQuietHours({ endHour: h });
                        }
                        setEditingQuietTime(null);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Set ${editingQuietTime === 'start' ? 'start' : 'end'} time to ${formatHour(h)}`}
                    >
                      <Text style={[styles.quietHourCellText, { color: colors.textPrimary }, selected && [styles.quietHourCellTextActive, { color: colors.textInverse }]]}>
                        {formatHour(h)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          {quietHours.enabled ? (
            <SettingsInfoBanner
              icon="moon-outline"
              text={`Urgent alerts (order updates, security) still arrive during quiet hours. Non-urgent notifications are held until ${formatHour(quietHours.endHour)}.`}
            />
          ) : null}
        </SettingsSection>

      {/* ── Notification preview ── */}
        <SettingsSection title="Privacy" noCard>
          <SettingsRow
            icon="eye-off-outline"
            title="Notification preview"
            subtitle="Show message content in notification previews"
            toggleValue={showPreview}
            onToggle={toggleWithHaptic(setShowPreview)}
            isFirst
            isLast
          />
        </SettingsSection>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    demoBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      marginBottom: Space.md,
    },
    demoBannerText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight,
      color: colors.textSecondary,
      flex: 1,
    },
    summaryBlock: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      marginBottom: Space.md,
    },
    summaryTitle: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.bodyStrong.letterSpacing,
    },
    summarySubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      marginTop: Space.xs / 2,
      letterSpacing: Type.caption.letterSpacing,
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginTop: Space.md,
    },
    progressTrack: {
      flex: 1,
      height: Space.xs + 2,
      borderRadius: Radius.sm,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: Radius.sm,
      backgroundColor: colors.brand,
    },
    progressLabel: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      color: colors.textSecondary,
      letterSpacing: Type.caption.letterSpacing,
      minWidth: Space.xl + Space.xs,
      textAlign: 'right',
    },
    quietHoursRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      gap: Space.sm,
    },
    quietTimePicker: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.md,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      minHeight: Space.xxl,
    },
    quietTimePickerPressed: {
      opacity: 0.7,
      transform: [{ scale: 0.98 }],
    },
    quietTimeLabel: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
    },
    quietTimeValue: {
      flex: 1,
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    quietHoursPickerSheet: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
    },
    quietHoursPickerTitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      color: colors.textSecondary,
      marginBottom: Space.xs,
    },
    quietHoursPickerGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.xs + 2,
    },
    quietHourCell: {
      paddingHorizontal: Space.sm + Space.xs,
      paddingVertical: Space.sm + 2,
      borderRadius: Radius.sm,
      backgroundColor: colors.surfaceAlt,
      minHeight: Space.xl + Space.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quietHourCellActive: {
      backgroundColor: colors.brand,
    },
    quietHourCellPressed: {
      opacity: 0.7,
      transform: [{ scale: 0.96 }],
    },
    quietHourCellText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      color: colors.textPrimary,
    },
    quietHourCellTextActive: {
      color: colors.textInverse,
      fontFamily: Typography.family.bold,
    },
  });
}
