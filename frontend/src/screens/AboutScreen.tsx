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
import { useToast } from '../context/ToastContext';
import { Space, Radius, Type } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Typography } from '../constants/typography';

type Props = StackScreenProps<RootStackParamList, 'About'>;

export default function AboutScreen({ navigation }: Props) {
  const { show } = useToast();

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
        <Text style={styles.headerTitle}>About</Text>
        <View style={styles.headerBack} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Reanimated.View entering={FadeInDown.duration(300).delay(0)} style={styles.brandWrap}>
          <View style={styles.brandIcon}>
            <Ionicons name="shirt-outline" size={40} color={Colors.brand} />
          </View>
          <Text style={styles.brandName}>Thryftverse</Text>
          <Text style={styles.brandVersion}>Version 1.0.0 (Build 2026.06.05)</Text>
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
                  <Ionicons name="document-text-outline" size={22} color={Colors.textPrimary} />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowTitle}>Terms of Service</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
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
                  <Ionicons name="shield-checkmark-outline" size={22} color={Colors.textPrimary} />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowTitle}>Privacy Policy</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
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
                  <Ionicons name="cube-outline" size={22} color={Colors.textPrimary} />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowTitle}>Cookie Policy</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
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
                  <Ionicons name="help-circle-outline" size={22} color={Colors.textPrimary} />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowTitle}>Help Centre</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </View>
            </AnimatedPressable>
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
  brandWrap: {
    alignItems: 'center',
    marginVertical: Space.xl,
    gap: Space.sm,
  },
  brandIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandName: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  brandVersion: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    letterSpacing: Type.caption.letterSpacing,
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
});
