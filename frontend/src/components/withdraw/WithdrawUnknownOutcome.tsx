import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FlagshipScreen, FlagshipHeader } from '../flagship';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

// Unknown outcome step — the withdrawal response was lost. We are polling
// the backend to determine whether the payout was committed. The user must
// not retry until the status is resolved.
export function WithdrawUnknownOutcome() {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Checking withdrawal"
          onBack={() => { /* prevent back — don't abandon reconciliation */ }}
          backIcon="arrow-back"
        />
      }
      scrollEnabled={false}
    >
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <Ionicons name="hourglass-outline" size={48} color={colors.textMuted} />
        <Text style={[styles.unknownTitle, { color: colors.textPrimary }]}>
          Confirming your request
        </Text>
        <Text style={[styles.unknownBody, { color: colors.textSecondary }]}>
          We lost connection while submitting your withdrawal. We are
          checking whether it went through. Please do not submit again
          until we confirm.
        </Text>
      </View>
    </FlagshipScreen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Space.xl, gap: Space.md },
  unknownTitle: { fontSize: TypographyV2.sectionTitle.size, fontFamily: TypographyV2.sectionTitle.fontFamily, textAlign: 'center' },
  unknownBody: { fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily, textAlign: 'center', lineHeight: TypographyV2.body.lineHeight },
});
