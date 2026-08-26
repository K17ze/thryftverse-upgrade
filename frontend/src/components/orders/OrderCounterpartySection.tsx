import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Typography, Radius, Type, Stroke, Control } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { haptics } from '../../utils/haptics';
import { openProfile } from '../../navigation/openProfile';

export interface CounterpartyInfo {
  role: 'Seller' | 'Buyer';
  id: string;
  username: string;
  avatar?: string | null;
}

interface Props {
  counterparty: CounterpartyInfo;
  listingId: string;
  currentUserId?: string;
  onMessage: (counterparty: CounterpartyInfo, listingId: string) => void;
  navigation: any;
}

export function OrderCounterpartySection({
  counterparty,
  listingId,
  currentUserId,
  onMessage,
  navigation,
}: Props) {
  const { colors } = useAppTheme();

  const themed = useMemo(() => ({
    sectionLabel: { color: colors.textMuted },
    counterpartyName: { color: colors.textPrimary },
    counterpartyBtn: { borderColor: colors.border },
    counterpartyBtnText: { color: colors.brand },
  }), [colors]);

  return (
    <View style={styles.counterpartySection}>
      <Text style={[styles.sectionLabel, themed.sectionLabel]}>{counterparty.role}</Text>
      <View style={styles.counterpartyRow}>
        <Pressable
          style={styles.counterpartyIdentity}
          onPress={() => { haptics.tap(); openProfile(navigation, counterparty.id, currentUserId); }}
          accessibilityRole="button"
          accessibilityLabel={`View ${counterparty.role} profile: ${counterparty.username}`}
        >
          <CachedImage
            uri={counterparty.avatar ?? ''}
            style={styles.counterpartyAvatar}
            contentFit="cover"
          />
          <Text style={[styles.counterpartyName, themed.counterpartyName]} numberOfLines={1}>
            @{counterparty.username}
          </Text>
        </Pressable>
        <View style={styles.counterpartyActions}>
          <Pressable
            style={({ pressed }) => [styles.counterpartyBtn, themed.counterpartyBtn, pressed && styles.counterpartyBtnPressed]}
            onPress={() => onMessage(counterparty, listingId)}
            accessibilityRole="button"
            accessibilityLabel={`Message ${counterparty.role.toLowerCase()}`}
          >
            <Text style={[styles.counterpartyBtnText, themed.counterpartyBtnText]}>Message</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.counterpartyBtn, themed.counterpartyBtn, pressed && styles.counterpartyBtnPressed]}
            onPress={() => { haptics.tap(); openProfile(navigation, counterparty.id, currentUserId); }}
            accessibilityRole="button"
            accessibilityLabel={`View ${counterparty.role.toLowerCase()} profile`}
          >
            <Text style={[styles.counterpartyBtnText, themed.counterpartyBtnText]}>View profile</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  counterpartySection: {
    paddingVertical: Space.sm,
  },
  counterpartyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  counterpartyIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  counterpartyAvatar: {
    width: Space.xxl,
    height: Space.xxl,
    borderRadius: Radius.full,
  },
  counterpartyName: {
    flex: 1,
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyStrong.letterSpacing,
  },
  counterpartyActions: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  counterpartyBtn: {
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    minHeight: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterpartyBtnText: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.caption.letterSpacing,
  },
  counterpartyBtnPressed: {
    opacity: 0.7,
  },
  sectionLabel: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.caption.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.sm,
  },
});
