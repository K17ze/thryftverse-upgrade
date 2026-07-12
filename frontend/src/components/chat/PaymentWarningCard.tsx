import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';

export interface PaymentWarningCardProps {
  /** Whether this warning has been dismissed by the user */
  dismissed: boolean;
  /** Called when the user dismisses the warning */
  onDismiss: () => void;
  /** Called when the user taps "Report" */
  onReport?: () => void;
  /** Whether the warning is shown for the current user's own message */
  isMe: boolean;
}

/**
 * Inline warning card shown below chat messages that contain off-platform
 * payment patterns (PayPal, bank transfer, WhatsApp, etc.).
 *
 * Non-blocking: the message is still sent. The card appears below the message
 * bubble to educate the user about Buyer Protection.
 *
 * Per spec 10.9: "warning renders under the triggering message locally;
 * no false-block of sending; events logged for trust ops."
 */
export function PaymentWarningCard({ dismissed, onDismiss, onReport, isMe }: PaymentWarningCardProps) {
  if (dismissed) return null;

  return (
    <View style={[styles.container, isMe && styles.containerMe]}>
      <View style={styles.iconWrap}>
        <Ionicons name="warning" size={16} color={Colors.danger} />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title}>Keep payments on ThryftVerse</Text>
        <Text style={styles.body}>
          Off-platform payments aren't covered by Buyer Protection. If this is a
          legitimate transaction, complete it in the app to stay protected.
        </Text>
        {onReport && (
          <Pressable
            style={styles.reportBtn}
            onPress={onReport}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Report this conversation"
          >
            <Ionicons name="flag-outline" size={12} color={Colors.danger} />
            <Text style={styles.reportBtnText}>Report</Text>
          </Pressable>
        )}
      </View>
      <Pressable
        style={styles.closeBtn}
        onPress={onDismiss}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel="Dismiss warning"
      >
        <Ionicons name="close" size={14} color={Colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    marginHorizontal: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    backgroundColor: `${Colors.danger}12`,
    borderWidth: 1,
    borderColor: `${Colors.danger}50`,
  },
  containerMe: {
    marginHorizontal: 0,
    alignSelf: 'flex-end',
    maxWidth: '85%',
  },
  iconWrap: {
    paddingTop: 1,
    flexShrink: 0,
  },
  textCol: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.danger,
  },
  body: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  reportBtnText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.danger,
  },
  closeBtn: {
    paddingTop: 2,
    flexShrink: 0,
  },
});
