import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CachedImage } from '../CachedImage';
import { useAppTheme } from '../../theme/ThemeContext';
import { Radius } from '../../theme/designTokens';
import { colorForId } from '../../utils/avatarColor';

import { Text } from 'react-native';

interface AvatarRingProps {
  uri?: string;
  size?: number;
  isUnread?: boolean;
  ringWidth?: number;
  fallbackInitials?: string;
  /**
   * Stable id (counterparty user id for DMs, conversation id for groups)
   * for the deterministic placeholder color — the same identity grammar
   * the chat top bar and group avatars use. Omit for a neutral fallback.
   */
  seedId?: string;
}

export function AvatarRing({
  uri,
  size = 52,
  isUnread = false,
  ringWidth = 2,
  fallbackInitials,
  seedId,
}: AvatarRingProps) {
  const { colors } = useAppTheme();

  const ringColor = isUnread ? colors.brand : 'transparent';
  // AVATAR_PALETTE fills are tuned for ≥3:1 against white initials.
  const seeded = !uri && seedId ? colorForId(seedId) : null;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Gold ring for unread */}
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: isUnread ? ringWidth : 0,
            borderColor: ringColor,
          },
        ]}
      >
        {uri ? (
          <CachedImage
            uri={uri}
            style={{
              width: size - (isUnread ? ringWidth * 2 : 0),
              height: size - (isUnread ? ringWidth * 2 : 0),
              borderRadius: (size - (isUnread ? ringWidth * 2 : 0)) / 2,
            }}
            contentFit="cover"
          />
        ) : fallbackInitials ? (
          <View
            style={{
              width: size - (isUnread ? ringWidth * 2 : 0),
              height: size - (isUnread ? ringWidth * 2 : 0),
              borderRadius: (size - (isUnread ? ringWidth * 2 : 0)) / 2,
              backgroundColor: seeded ?? colors.surface,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: size * 0.35, color: seeded ? '#FFFFFF' : colors.textPrimary, fontWeight: '600' }}>
              {fallbackInitials}
            </Text>
          </View>
        ) : null}
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  ring: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
});
