/**
 * GroupAvatarMosaic — composites 2–4 member avatars into a 2×2 grid that
 * fills the group avatar circle. Falls back to a single avatar or initials
 * when fewer than 2 members are available.
 *
 * Design principles (AGENTS.md §4):
 * - Real avatar or generated mosaic — never a blank circle.
 * - Composites live-update as members are selected/deselected.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CachedImage } from '../CachedImage';
import { useAppTheme } from '../../theme/ThemeContext';
import { Radius, Space, Type, TypeStyles, FontFamily } from '../../theme/designTokens';
import { colorForId } from '../../utils/avatarColor';

export interface MosaicMember {
  id: string;
  displayName?: string | null;
  avatar?: string | null;
}

interface GroupAvatarMosaicProps {
  members: MosaicMember[];
  size?: number;
  /** Optional uploaded group photo — takes precedence over the mosaic. */
  groupPhoto?: string | null;
  /** Fallback initials when fewer than 2 members have avatars. */
  fallbackInitials?: string;
  /** Stable id for deterministic placeholder color (group conversation id). */
  groupId?: string;
}

export function GroupAvatarMosaic({
  members,
  size = 88,
  groupPhoto,
  fallbackInitials = 'G',
  groupId,
}: GroupAvatarMosaicProps) {
  const { colors } = useAppTheme();
  const halfSize = (size - 3) / 2;
  const avatarRadius = halfSize / 2;
  const overflowCount = Math.max(0, members.length - 4);

  // If a group photo was uploaded, show it full.
  if (groupPhoto) {
    return (
      <View style={[styles.container, { width: size, height: size, borderRadius: Radius.full }]}>
        <CachedImage
          uri={groupPhoto}
          style={{ width: size, height: size, borderRadius: Radius.full }}
          contentFit="cover"
        />
      </View>
    );
  }

  // Filter to members with avatars, take first 4.
  const withAvatars = members.filter((m) => m.avatar).slice(0, 4);
  const initialsSource = members[0]?.displayName ?? fallbackInitials;

  // 0 or 1 avatars → show initials fallback on a deterministic color.
  if (withAvatars.length < 2) {
    const initials = (initialsSource || 'G')
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const colorSeed = groupId ?? members[0]?.id ?? fallbackInitials;
    const baseColor = colorForId(colorSeed);
    return (
      <View
        style={[
          styles.container,
          {
            width: size,
            height: size,
            borderRadius: Radius.full,
            backgroundColor: baseColor,
            borderWidth: 2,
            borderColor: colors.background,
            shadowColor: baseColor,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 3,
            position: 'relative',
          },
        ]}
      >
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: size * 0.45,
            backgroundColor: 'rgba(255,255,255,0.18)',
            borderTopLeftRadius: size / 2,
            borderTopRightRadius: size / 2,
          }}
        />
        <Text
          style={[
            styles.initials,
            {
              fontSize: size * 0.38,
              color: '#FFFFFF',
              fontFamily: FontFamily.bold,
            },
          ]}
        >
          {initials || 'G'}
        </Text>
      </View>
    );
  }

  // 2–4 avatars → 2×2 grid.
  const slots = withAvatars.slice(0, 4);
  // Pad to 4 slots with undefined so the grid renders empty cells.
  while (slots.length < 4) {
    slots.push(undefined as unknown as MosaicMember);
  }

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: Radius.full, backgroundColor: colors.surfaceAlt }]}>
      <View style={styles.grid}>
        {slots.map((member, i) => (
          <View
            key={member?.id ?? `empty-${i}`}
            style={[
              styles.cell,
              {
                width: halfSize,
                height: halfSize,
              },
            ]}
          >
            {member?.avatar ? (
              <CachedImage
                uri={member.avatar}
                style={{
                  width: halfSize,
                  height: halfSize,
                  borderTopLeftRadius: i === 0 ? Radius.full : 2,
                  borderTopRightRadius: i === 1 ? Radius.full : 2,
                  borderBottomLeftRadius: i === 2 ? Radius.full : 2,
                  borderBottomRightRadius: i === 3 ? Radius.full : 2,
                }}
                contentFit="cover"
              />
            ) : (
              <View
                style={[
                  styles.emptyCell,
                  {
                    width: halfSize,
                    height: halfSize,
                    backgroundColor: colors.border,
                  },
                ]}
              />
            )}
          </View>
        ))}
      </View>
      {overflowCount > 0 && (
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            minWidth: size * 0.36,
            height: size * 0.36,
            borderRadius: Radius.full,
            backgroundColor: colors.overlay,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 4,
          }}
        >
          <Text
            style={{
              fontSize: size * 0.22,
              fontFamily: TypeStyles.bodyEmphasis.fontFamily,
              color: colors.scrimTextPrimary,
            }}
          >
            +{overflowCount}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    height: '100%',
  },
  cell: {
    overflow: 'hidden',
  },
  emptyCell: {
    overflow: 'hidden',
  },
  initials: {
    fontFamily: TypeStyles.title.fontFamily,
    letterSpacing: -0.5,
  },
});
