import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { PressPresets } from '../../hooks/usePremiumPressFeedback';

export interface PartyStripData {
  id: string;
  username: string;
  displayName?: string;
  avatar?: string | null;
  location?: string | null;
  sellerAccountVerified?: boolean;
  issuerIdentityVerified?: boolean;
  roleLabel: string;
  badges?: string[];
}

export interface PartyFact {
  label: string;
  value: string;
}

export interface CommercePartyStripProps {
  party: PartyStripData;
  onOpenProfile: () => void;
  onMessage?: () => void;
  onFollow?: () => void;
  isFollowing?: boolean;
  messageLabel?: string;
  followLabel?: string;
  followingLabel?: string;
  showFollow?: boolean;
  facts?: PartyFact[];
}

export function CommercePartyStrip({
  party,
  onOpenProfile,
  onMessage,
  onFollow,
  isFollowing = false,
  messageLabel = 'Message',
  followLabel = 'Follow',
  followingLabel = 'Following',
  showFollow = false,
  facts = [],
}: CommercePartyStripProps) {
  const showSellerVerified = party.sellerAccountVerified === true;
  const showIssuerVerified = party.issuerIdentityVerified === true;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{party.roleLabel}</Text>

      <View style={styles.headerRow}>
        <AnimatedPressable
          style={styles.profileRow}
          onPress={onOpenProfile}
          {...PressPresets.card}
          accessibilityLabel={`View ${party.username} profile`}
          accessibilityRole="button"
        >
          <View style={styles.avatarWrap}>
            {party.avatar ? (
              <CachedImage
                uri={party.avatar}
                style={styles.avatar}
                containerStyle={{ width: 48, height: 48, borderRadius: 24 }}
                contentFit="cover"
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarFallbackText}>
                  {(party.username ?? 'S').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.profileInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.username} numberOfLines={1}>
                {party.displayName ?? party.username}
              </Text>
              {showSellerVerified && (
                <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
              )}
              {showIssuerVerified && (
                <Ionicons name="shield-checkmark-outline" size={14} color={Colors.success} />
              )}
            </View>
            {party.location ? (
              <Text style={styles.location} numberOfLines={1}>
                {party.location}
              </Text>
            ) : null}
            {party.badges && party.badges.length > 0 ? (
              <View style={styles.badgeRow}>
                {party.badges.slice(0, 3).map((badge) => (
                  <View key={badge} style={styles.badge}>
                    <Text style={styles.badgeText}>{badge}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </AnimatedPressable>

        <View style={styles.actionRow}>
          {showFollow && onFollow && (
            <AnimatedPressable
              style={[styles.followBtn, isFollowing && styles.followingBtn]}
              onPress={onFollow}
              {...PressPresets.primaryButton}
              accessibilityLabel={isFollowing ? `Unfollow ${party.username}` : `Follow ${party.username}`}
              accessibilityRole="button"
            >
              <Text style={[styles.followText, isFollowing && styles.followingText]}>
                {isFollowing ? followingLabel : followLabel}
              </Text>
            </AnimatedPressable>
          )}
          {onMessage && (
            <AnimatedPressable
              style={styles.messageBtn}
              onPress={onMessage}
              {...PressPresets.primaryButton}
              accessibilityLabel={`${messageLabel} ${party.username}`}
              accessibilityRole="button"
            >
              <Ionicons name="chatbubble-outline" size={16} color={Colors.textPrimary} />
              <Text style={styles.messageText}>{messageLabel}</Text>
            </AnimatedPressable>
          )}
        </View>
      </View>

      {facts.length > 0 && (
        <View style={styles.factsRow}>
          {facts.map((fact, i) => (
            <React.Fragment key={fact.label}>
              {i > 0 && <Text style={styles.factsSeparator}>·</Text>}
              <Text style={styles.factItem}>
                <Text style={styles.factLabel}>{fact.label}: </Text>
                <Text style={styles.factValue}>{fact.value}</Text>
              </Text>
            </React.Fragment>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Space.sm,
    marginHorizontal: Space.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    marginBottom: Space.sm,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  headerRow: {
    flexDirection: 'column',
    gap: Space.sm,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  avatarWrap: {
    flexShrink: 0,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontSize: 20,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  profileInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  username: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  location: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.sm,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  followBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: Colors.brand,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followingBtn: {
    backgroundColor: Colors.surfaceAlt,
  },
  followText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textInverse,
  },
  followingText: {
    color: Colors.textPrimary,
  },
  messageBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 10,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
  },
  messageText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  factsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: Space.sm,
    gap: 6,
  },
  factItem: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
  },
  factLabel: {
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  factValue: {
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  factsSeparator: {
    fontSize: 12,
    color: Colors.textMuted,
  },
});
