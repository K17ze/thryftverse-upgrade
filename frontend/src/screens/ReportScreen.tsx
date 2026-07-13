import React, { useState } from 'react';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import { View,
  Text,
  StyleSheet,
  StatusBar
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { Typography, Space } from '../theme/designTokens';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';

const REASONS = [
  "Spam or misleading",
  "Inappropriate content",
  "Counterfeit item",
  "Seller unresponsive",
  "Other"
];

export default function ReportScreen() {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useAppTheme();
  const route = useRoute<any>();

  // Could be 'item' or 'user'
  const reportType = route.params?.type || 'item';

  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = () => {
    if (selectedReason) {
      setIsSubmitted(true);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <View style={styles.header}>
        <AnimatedPressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Report {reportType === 'user' ? 'User' : 'Item'}</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAwareScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {isSubmitted ? (
          <View style={styles.successState}>
            <Ionicons name="checkmark-circle-outline" size={64} color={colors.success} />
            <Text style={styles.successTitle}>Report Submitted</Text>
            <Text style={styles.successText}>Thank you for helping keep the Thryftverse safe. Our moderation team will review this shortly.</Text>
            <AnimatedPressable style={styles.primaryBtn} onPress={() => navigation.goBack()} activeOpacity={0.9}>
              <Text style={styles.primaryText}>Return</Text>
            </AnimatedPressable>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.promptText}>Why are you reporting this {reportType}?</Text>

            <View style={styles.reasonsList}>
              {REASONS.map((reason) => (
                <AnimatedPressable
                  key={reason}
                  style={[styles.reasonRow, selectedReason === reason && styles.selectedRow]}
                  onPress={() => setSelectedReason(reason)}
                >
                  <Text style={[styles.reasonText, selectedReason === reason && styles.selectedText]}>{reason}</Text>
                  {selectedReason === reason && (
                    <Ionicons name="checkmark" size={20} color={colors.textInverse} />
                  )}
                </AnimatedPressable>
              ))}
            </View>

            <View style={styles.footer}>
              <AnimatedPressable
                style={[styles.primaryBtn, !selectedReason && styles.disabledBtn]}
                onPress={handleSubmit}
                activeOpacity={0.9}
                disabled={!selectedReason}
              >
                <Text style={styles.primaryText}>Submit Report</Text>
              </AnimatedPressable>
            </View>
          </View>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontFamily: Typography.family.bold, textTransform: 'capitalize' },

  content: { flex: 1, paddingHorizontal: 24 },
  contentContainer: { paddingTop: 32, paddingBottom: 40 },
  form: { flex: 1 },

  promptText: { fontSize: 18, fontFamily: Typography.family.semibold, marginBottom: 24 },

  reasonsList: { gap: 12 },
  reasonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  selectedRow: {
  },
  reasonText: { fontSize: 15, fontFamily: Typography.family.medium },
  selectedText: { fontFamily: Typography.family.bold },

  footer: { marginTop: Space.md },
  primaryBtn: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  disabledBtn: { opacity: 0.5 },
  primaryText: { fontSize: 16, fontFamily: Typography.family.bold },

  successState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
  },
  successTitle: {
    fontSize: 24,
    fontFamily: Typography.family.bold,
    marginTop: 24,
  },
  successText: {
    fontSize: 16,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    marginVertical: 16,
    lineHeight: 24,
    maxWidth: '80%',
  }
});