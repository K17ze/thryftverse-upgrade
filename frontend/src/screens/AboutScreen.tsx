import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useToast } from '../context/ToastContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';

import { Space, Radius, Type, Typography, Control } from '../theme/designTokens';
type Props = NativeStackScreenProps<RootStackParamList, 'About'>;

export default function AboutScreen({ navigation }: Props) {
  const { show } = useToast();
  const { colors } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleOpenExternal = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      show('Unable to open link', 'error');
    }
  };

  return (
    <FlagshipScreen header={<FlagshipHeader title="About" subtitle="Thryftverse app information" onBack={() => navigation.goBack()} />}>
        {/* Hero summary — brand identity */}
        <Reanimated.View entering={FadeInDown.duration(300)} style={styles.heroCard}>
          <View style={styles.heroRow}>
            <View style={styles.brandIcon}>
              <Ionicons name="shirt-outline" size={32} color={colors.brand} />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.brandName}>Thryftverse</Text>
              <Text style={styles.brandVersion}>Version 1.0.0 (Build 2026.06.05)</Text>
            </View>
          </View>
        </Reanimated.View>

        <Reanimated.View entering={FadeInDown.duration(300).delay(60)}>
          <Text style={styles.sectionLabel}>Legal</Text>
          <View style={styles.rowGroup}>
            <AnimatedPressable
              onPress={() => void handleOpenExternal('https://thryftverse.app/terms')}
              activeOpacity={0.75}
              scaleValue={0.995}
              hapticFeedback="light"
            >
              <View style={[styles.rowRoot, styles.rowBorder]}>
                <View style={styles.rowIconWrap}>
                  <Ionicons name="document-text-outline" size={22} color={colors.textPrimary} />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowTitle}>Terms of Service</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </View>
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => void handleOpenExternal('https://thryftverse.app/privacy')}
              activeOpacity={0.75}
              scaleValue={0.995}
              hapticFeedback="light"
            >
              <View style={[styles.rowRoot, styles.rowBorder]}>
                <View style={styles.rowIconWrap}>
                  <Ionicons name="shield-checkmark-outline" size={22} color={colors.textPrimary} />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowTitle}>Privacy Policy</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </View>
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => void handleOpenExternal('https://thryftverse.app/cookies')}
              activeOpacity={0.75}
              scaleValue={0.995}
              hapticFeedback="light"
            >
              <View style={styles.rowRoot}>
                <View style={styles.rowIconWrap}>
                  <Ionicons name="cube-outline" size={22} color={colors.textPrimary} />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowTitle}>Cookie Policy</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </View>
            </AnimatedPressable>
          </View>
        </Reanimated.View>

        <Reanimated.View entering={FadeInDown.duration(300).delay(120)}>
          <Text style={styles.sectionLabel}>Support</Text>
          <View style={styles.rowGroup}>
            <AnimatedPressable
              onPress={() => navigation.navigate('HelpSupport')}
              activeOpacity={0.75}
              scaleValue={0.995}
              hapticFeedback="light"
            >
              <View style={styles.rowRoot}>
                <View style={styles.rowIconWrap}>
                  <Ionicons name="help-circle-outline" size={22} color={colors.textPrimary} />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowTitle}>Help Centre</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </View>
            </AnimatedPressable>
          </View>
        </Reanimated.View>

        <View style={{ height: Space.xl }} />
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  heroCard: {
    alignItems: 'center',
    marginVertical: Space.lg,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  heroText: {
    flex: 1,
  },
  brandIcon: {
    width: Space.xl + Space.xl,
    height: Space.xl + Space.xl,
    borderRadius: Radius.lg,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandName: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    letterSpacing: Type.title.letterSpacing,
  },
  brandVersion: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    letterSpacing: Type.caption.letterSpacing,
    marginTop: Space.xs - 2,
  },
  sectionLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    marginBottom: Space.smMd,
    marginTop: Space.lg,
    letterSpacing: Type.body.letterSpacing,
  },
  rowGroup: {
    backgroundColor: colors.surface,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Space.sm,
  },
  rowRoot: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    minHeight: Control.hit + Space.sm + Space.xs,
    gap: Space.smMd,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowIconWrap: {
    width: Space.xl - Space.xs,
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
    color: colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.body.lineHeight,
  },
  });
}