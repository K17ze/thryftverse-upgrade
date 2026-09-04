import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { parseApiError } from '../lib/apiClient';
import { requestMyDataExport } from '../services/accountApi';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { SettingsSection } from '../components/settings/SettingsSection';
import { Space, Radius, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
type Props = NativeStackScreenProps<RootStackParamList, 'AccountControl'>;

export default function AccountControlScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const currentUser = useStore((state) => state.currentUser);
  const { show } = useToast();
  const haptic = useHaptic();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [isExporting, setIsExporting] = useState(false);

  const handleDownloadData = useCallback(async () => {
    if (!currentUser?.id) {
      show('Sign in before requesting a data export.', 'error');
      return;
    }
    setIsExporting(true);
    try {
      const result = await requestMyDataExport();
      const recordText = result.estimatedRecords > 0 ? ` (${result.estimatedRecords} records)` : '';
      show(`Data export generated${recordText}. Request ID: ${result.requestId}`, 'success');
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to export account data right now.');
      show(parsed.message, 'error');
    } finally {
      setIsExporting(false);
    }
  }, [currentUser?.id, show]);

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Account control"
          onBack={() => navigation.goBack()}
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: Space.md, paddingTop: Space.sm, paddingBottom: insets.bottom + Space.lg }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* Download data — flat section, no card wrapper or decorative icon circle */}
        <SettingsSection
          title="Download your data"
          description="We'll generate a data export covering your addresses, payment methods, orders, bids, co-own holdings and consent records. A request ID is issued for tracking."
        >
          <View style={styles.optionActionWrap}>
            <AnimatedPressable
              style={[styles.optionBtn, { borderColor: colors.border }]}
              onPress={handleDownloadData}
              disabled={isExporting}
              activeOpacity={0.8}
              scaleValue={0.98}
              hapticFeedback="medium"
              accessibilityRole="button"
              accessibilityLabel="Download your data"
              accessibilityState={{ disabled: isExporting }}
            >
              {isExporting ? (
                <ActivityIndicator size="small" color={colors.textPrimary} />
              ) : (
                <Text style={[styles.optionBtnText, { color: colors.textPrimary }]}>Request export</Text>
              )}
            </AnimatedPressable>
          </View>
        </SettingsSection>

        {/* Delete account — removed from this screen. The destructive
            delete ritual lives at the bottom of the settings hub as a
            dedicated danger row (§4 destructive separation principle).
            AccountControl now focuses on data export only. */}
      </KeyboardAwareScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  optionActionWrap: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  optionBtn: {
    borderRadius: Radius.md,
    paddingVertical: Space.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: Control.hit },
  optionBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing } });
}
