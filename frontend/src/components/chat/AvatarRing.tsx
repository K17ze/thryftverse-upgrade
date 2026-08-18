import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CachedImage } from '../CachedImage';
import { useAppTheme } from '../../theme/ThemeContext';
import { Radius } from '../../theme/designTokens';

import { Text } from 'react-native';

interface AvatarRingProps {
  uri?: string;
  size?: number;
  isUnread?: boolean;
  ringWidth?: number;
  fallbackInitials?: string;
}

export function AvatarRing({
  uri,
  size = 52,
  isUnread = false,
  ringWidth = 2,
  fallbackInitials,
}: AvatarRingProps) {
  const { colors } = useAppTheme();

  const ringColor = isUnread ? colors.brand : 'transparent';

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
              backgroundColor: colors.surface,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: size * 0.35, color: colors.textPrimary, fontWeight: '600' }}>
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
