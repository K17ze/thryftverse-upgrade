import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';

export type CommerceStateType = 'loading' | 'error' | 'unavailable';

export interface CommerceStateCanvasProps {
  state: CommerceStateType;
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function CommerceStateCanvas({
  state,
  title,
  message,
  onRetry,
  retryLabel = 'Try again',
}: CommerceStateCanvasProps) {
  const insets = useSafeAreaInsets();

  const defaultTitle =
    state === 'loading' ? 'Loading...'
    : state === 'error' ? 'Something went wrong'
    : 'Unavailable';

  const defaultMessage =
    state === 'loading' ? ''
    : state === 'error' ? 'Pull down to refresh or try again.'
    : 'This item is no longer available.';

  return (
    <View style={[styles.container, { paddingTop: insets.top + 60 }]}>
      {state === 'loading' ? (
        <ActivityIndicator size="large" color={Colors.brand} />
      ) : (
        <View style={styles.iconWrap}>
          <Ionicons
            name={state === 'error' ? 'cloud-offline-outline' : 'cube-outline'}
            size={40}
            color={Colors.textMuted}
          />
        </View>
      )}

      <Text style={styles.title}>{title ?? defaultTitle}</Text>

      {state !== 'loading' && (
        <Text style={styles.message}>{message ?? defaultMessage}</Text>
      )}

      {state !== 'loading' && onRetry && (
        <Pressable
          style={styles.retryBtn}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
        >
          <Text style={styles.retryText}>{retryLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    backgroundColor: Colors.background,
  },
  iconWrap: {
    marginBottom: Space.md,
  },
  title: {
    fontSize: 18,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Space.xs,
  },
  message: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: Space.lg,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  retryText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
});
