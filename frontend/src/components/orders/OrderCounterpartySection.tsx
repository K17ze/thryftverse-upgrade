import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Stroke, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
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
  navigation }: Props) {
  const { colors } = useAppTheme();

  const themed = useMemo(() => ({
    sectionLabel: { color: colors.textMuted },
    counterpartyName: { color: colors.textPrimary },
    counterpartyBtn: { borderColor: colors.border },
    counterpartyBtnText: { color: colors.brand } }), [colors]);

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
    paddingVertical: Space.sm },
  counterpartyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm },
  counterpartyIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  counterpartyAvatar: {
    width: Space.xxl,
    height: Space.xxl,
    borderRadius: Radius.full },
  counterpartyName: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing },
  counterpartyActions: {
    flexDirection: 'row',
    gap: Space.sm },
  counterpartyBtn: {
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    minHeight: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  counterpartyBtnText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  counterpartyBtnPressed: {
    opacity: 0.7 },
  sectionLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.sm } });
