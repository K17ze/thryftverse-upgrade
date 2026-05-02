import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { LinearGradient } from 'expo-linear-gradient';

interface TPPHeaderProps {
  avatar: {
    uri: string;
    size?: number;
    ring?: 'gradient' | 'verified' | 'none';
    status?: 'online' | 'recent' | 'offline';
  };
  name: string;
  handle: string;
  badges: {
    verified: boolean;
    topSeller: boolean;
    fastShipper: boolean;
    responseTime?: '< 1h' | '< 24h' | string;
  };
  stats: {
    items: number;
    sold: number;
    rating: number;
    reviewCount: number;
  };
  onMessage?: () => void;
  onFollow?: () => void;
  isFollowing?: boolean;
  isOwnProfile?: boolean;
  style?: ViewStyle;
}

export function TPPHeader({
  avatar,
  name,
  handle,
  badges,
  stats,
  onMessage,
  onFollow,
  isFollowing = false,
  isOwnProfile = false,
  style,
}: TPPHeaderProps) {
  const avatarSize = avatar.size || 84;
  const ringWidth = 4;
  const containerSize = avatarSize + ringWidth * 2;

  const getStatusColor = () => {
    switch (avatar.status) {
      case 'online':
        return Colors.success;
      case 'recent':
        return '#FFB800';
      case 'offline':
      default:
        return Colors.textMuted;
    }
  };

  const renderAvatar = () => {
    const image = (
      <Image
        source={{ uri: avatar.uri }}
        style={[
          styles.avatar,
          { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 },
        ]}
      />
    );

    if (avatar.ring === 'gradient') {
      return (
        <LinearGradient
          colors={['#FF6B6B', '#4ECDC4', '#45B7D1']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.avatarRing,
            { width: containerSize, height: containerSize, borderRadius: containerSize / 2 },
          ]}
        >
          <View
            style={[
              styles.avatarInner,
              { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 },
            ]}
          >
            {image}
          </View>
        </LinearGradient>
      );
    }

    if (avatar.ring === 'verified') {
      return (
        <View
          style={[
            styles.verifiedRing,
            { width: containerSize, height: containerSize, borderRadius: containerSize / 2 },
          ]}
        >
          {image}
        </View>
      );
    }

    return image;
  };

  return (
    <View style={[styles.container, style]}>
      {/* Avatar Section */}
      <View style={styles.avatarSection}>
        <View style={styles.avatarWrapper}>
          {renderAvatar()}
          {avatar.status && (
            <View
              style={[
                styles.statusIndicator,
                { backgroundColor: getStatusColor() },
              ]}
            />
          )}
          {/* Sold Badge Overlay */}
          {stats.sold > 0 && (
            <View style={styles.soldBadge}>
              <Text style={styles.soldBadgeText}>{stats.sold} sold</Text>
            </View>
          )}
        </View>

        {/* Trust Badges */}
        <View style={styles.badgesRow}>
          {badges.verified && (
            <View style={styles.badge}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
              <Text style={styles.badgeText}>Verified</Text>
            </View>
          )}
          {badges.topSeller && (
            <View style={[styles.badge, styles.topSellerBadge]}>
              <Ionicons name="trophy" size={14} color="#FFB800" />
              <Text style={[styles.badgeText, styles.topSellerText]}>Top Seller</Text>
            </View>
          )}
          {badges.fastShipper && badges.responseTime && (
            <View style={[styles.badge, styles.fastShipperBadge]}>
              <Ionicons name="time" size={14} color={Colors.brand} />
              <Text style={[styles.badgeText, styles.fastShipperText]}>
                Usually ships {badges.responseTime}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Info Section */}
      <View style={styles.infoSection}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.handle}>@{handle}</Text>

        {/* Stats Bar */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{stats.items}</Text>
            <Text style={styles.statLabel}>Items</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{stats.sold}</Text>
            <Text style={styles.statLabel}>Sold</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <View style={styles.ratingContainer}>
              <Text style={styles.statValue}>{stats.rating.toFixed(1)}</Text>
              <Ionicons name="star" size={12} color="#FFB800" style={styles.starIcon} />
            </View>
            <Text style={styles.statLabel}>({stats.reviewCount} reviews)</Text>
          </View>
        </View>
      </View>

      {/* Action Buttons */}
      {!isOwnProfile && (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.messageButton]}
            onPress={onMessage}
          >
            <Ionicons name="chatbubble" size={18} color={Colors.brand} />
            <Text style={styles.messageButtonText}>Message</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.followButton,
              isFollowing && styles.followingButton,
            ]}
            onPress={onFollow}
          >
            <Text
              style={[
                styles.followButtonText,
                isFollowing && styles.followingButtonText,
              ]}
            >
              {isFollowing ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    padding: 16,
    paddingTop: 20,
  },
  avatarSection: {
    alignItems: 'center',
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    resizeMode: 'cover',
  },
  avatarRing: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  avatarInner: {
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifiedRing: {
    borderWidth: 4,
    borderColor: Colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  soldBadge: {
    position: 'absolute',
    bottom: -4,
    left: '50%',
    transform: [{ translateX: -30 }],
    backgroundColor: Colors.textPrimary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  soldBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.success,
  },
  topSellerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 184, 0, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  topSellerText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFB800',
  },
  fastShipperBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  fastShipperText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.brand,
  },
  infoSection: {
    alignItems: 'center',
    marginTop: 12,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  handle: {
    fontSize: 15,
    color: Colors.textMuted,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 24,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.border,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  starIcon: {
    marginRight: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    paddingHorizontal: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  messageButton: {
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderWidth: 1,
    borderColor: Colors.brand,
  },
  messageButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.brand,
  },
  followButton: {
    backgroundColor: Colors.brand,
  },
  followingButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  followButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  followingButtonText: {
    color: Colors.textPrimary,
  },
});
