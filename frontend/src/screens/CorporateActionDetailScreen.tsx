/**
 * CorporateActionDetailScreen — detail view for a single corporate action event.
 *
 * Spec 10 §7: corporate actions (distributions, votes, buyouts, etc.) must be
 * first-class timeline entries with detail views. This screen shows the full
 * details of a single event passed via route params.
 *
 * Per AGENTS.md §11: all data is passed via route params from the timeline.
 * No fabricated data. Missing fields show "—".
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { Space, Radius, Type, Typography, DockConstants } from '../theme/designTokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { haptics } from '../utils/haptics';
import {
  CoOwnMarketHeader,
  CoOwnStickyActionDock,
  CoOwnCorporateActionRow,
  type CoOwnCorporateActionType,
  type CoOwnCorporateActionStatus,
} from '../components/coown';
import { AppButton } from '../components/ui/AppButton';

type RouteT = RouteProp<RootStackParamList, 'CorporateActionDetail'>;
type NavT = StackNavigationProp<RootStackParamList>;

const ACTION_DESCRIPTIONS: Record<string, string> = {
  distribution: 'A cash distribution to unit-holders, proportional to settled units on the record date.',
  operating_cost: 'Operating costs deducted from the asset vehicle, reducing net asset value.',
  new_issuance: 'Additional units issued by the vehicle, increasing authorised or issued supply.',
  split: 'A unit split — existing units divided into more units at a fixed ratio.',
  consolidation: 'A unit consolidation — existing units merged into fewer units at a fixed ratio.',
  buyback: 'The vehicle operator repurchases units from holders at a stated price.',
  compulsory_buyout: 'A compulsory acquisition of remaining units by a majority holder.',
  revaluation: 'An independent revaluation of the underlying asset.',
  insurance_proceeds: 'Insurance proceeds distributed to unit-holders.',
  liquidation: 'Wind-down of the asset vehicle and distribution of remaining proceeds.',
  vote: 'A holder vote on a specified resolution.',
};

export default function CorporateActionDetailScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { colors, isDark } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();
  const insets = useSafeAreaInsets();

  const {
    assetId,
    actionType,
    dateLabel,
    effectLabel,
    amountLabel,
    status,
    recordDateLabel,
    paymentDateLabel,
  } = route.params;

  const typedActionType = actionType as CoOwnCorporateActionType;
  const typedStatus = status as CoOwnCorporateActionStatus;
  const description = ACTION_DESCRIPTIONS[actionType] ?? '—';
  const scrollBottomPadding = Math.max(insets.bottom, Space.md) + DockConstants.singleActionHeight;

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    if (assetId) navigation.replace('AssetDetail', { assetId });
    else navigation.navigate('CoOwnHub');
  }, [navigation, assetId]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <CoOwnMarketHeader
        title="Corporate action"
        subtitle={dateLabel}
        onBack={handleBack}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Event summary — the corporate action row as a non-interactive card */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
          <CoOwnCorporateActionRow
            type={typedActionType}
            status={typedStatus}
            dateLabel={dateLabel}
            effectLabel={effectLabel}
            amountLabel={amountLabel}
            recordDateLabel={recordDateLabel}
            paymentDateLabel={paymentDateLabel}
          />
        </Reanimated.View>

        {/* Description */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(60)}>
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>About this event</Text>
            <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
              {description}
            </Text>
          </View>
        </Reanimated.View>

        {/* Key dates */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(120)}>
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Key dates</Text>
            <View style={styles.dateRow}>
              <Text style={[styles.dateLabel, { color: colors.textMuted }]}>Event date</Text>
              <Text style={[styles.dateValue, { color: colors.textPrimary }]}>{dateLabel}</Text>
            </View>
            {recordDateLabel && (
              <View style={styles.dateRow}>
                <Text style={[styles.dateLabel, { color: colors.textMuted }]}>Record date</Text>
                <Text style={[styles.dateValue, { color: colors.textPrimary }]}>{recordDateLabel}</Text>
              </View>
            )}
            {paymentDateLabel && (
              <View style={styles.dateRow}>
                <Text style={[styles.dateLabel, { color: colors.textMuted }]}>Payment date</Text>
                <Text style={[styles.dateValue, { color: colors.textPrimary }]}>{paymentDateLabel}</Text>
              </View>
            )}
          </View>
        </Reanimated.View>

        {/* Effect */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(180)}>
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Effect on your position</Text>
            <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
              {effectLabel}
            </Text>
            {amountLabel && (
              <Text style={[styles.amountLabel, { color: amountLabel.startsWith('+') ? colors.success : amountLabel.startsWith('−') ? colors.danger : colors.textPrimary }]}>
                {amountLabel}
              </Text>
            )}
          </View>
        </Reanimated.View>

        {/* Status */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(240)}>
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Status</Text>
            <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
              {status === 'pending' && 'This event is pending and has not yet taken effect.'}
              {status === 'effective' && 'This event is effective — it has been applied to your position.'}
              {status === 'completed' && 'This event is completed.'}
              {status === 'cancelled' && 'This event was cancelled and will not take effect.'}
            </Text>
          </View>
        </Reanimated.View>
      </ScrollView>

      <CoOwnStickyActionDock>
        <AppButton
          title="Back to asset"
          onPress={() => { haptics.tap(); handleBack(); }}
          variant="secondary"
          size="lg"
          icon={<Ionicons name="arrow-back" size={16} color={colors.textPrimary} />}
          accessibilityLabel="Go back to asset detail"
          style={{ flex: 1 }}
        />
      </CoOwnStickyActionDock>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    gap: Space.md,
  },
  sectionCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
  },
  sectionTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.3,
    marginBottom: Space.sm,
  },
  sectionBody: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight + 2,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs,
  },
  dateLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
  },
  dateValue: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.body.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  amountLabel: {
    fontSize: Type.priceLarge.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
    marginTop: Space.sm,
  },
});
