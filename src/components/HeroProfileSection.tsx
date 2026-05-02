import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { CachedImage } from './CachedImage';

interface HeroProfileSectionProps {
  avatarUrl?: string;
  name: string;
  handle: string;
  bio?: string;
  verified?: boolean;
  topSeller?: boolean;
  stats?: {
    items: number;
    sold: number;
    rating: number;
  };
  onEditPress?: () => void;
  onAvatarPress?: () => void;
  style?: ViewStyle;
}

export function HeroProfileSection({
  avatarUrl,
  name,
  handle,
  bio,
  verified = false,
  topSeller = false,
  stats,
  onEditPress,
  onAvatarPress,
  style,
}: HeroProfileSectionProps) {
  return (
    <View style={[styles.container, style]}>
      {/* Avatar and Basic Info Row */}
      <View style={styles.mainRow}>
        {/* Avatar */}
        <TouchableOpacity onPress={onAvatarPress} style={styles.avatarContainer}>
          {avatarUrl ? (
            <CachedImage
              uri={avatarUrl}
              style={styles.avatar}
              containerStyle={styles.avatar}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={36} color={Colors.textMuted} />
            </View>
          )}
          
          {/* Edit indicator */}
          <View style={styles.editBadge}>
            <Ionicons name="camera" size={12} color="#FFFFFF" />
          </View>
        </TouchableOpacity>

        {/* Name and Handle */}
        <View style={styles.infoContainer}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{name}</Text>
            {verified && (
              <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
            )}
          </View>
          
          <Text style={styles.handle}>@{handle}</Text>
          
          {topSeller && (
            <View style={styles.topSellerBadge}>
              <Ionicons name="star" size={12} color="#FFD700" />
              <Text style={styles.topSellerText}>Top Seller</Text>
            </View>
          )}
        </View>

        {/* Edit Button */}
        <TouchableOpacity onPress={onEditPress} style={styles.editButton}>
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
      </View>

      {/* Bio */}
      {bio && (
        <Text style={styles.bio} numberOfLines={2}>
          {bio}
        </Text>
      )}

      {/* Stats Row */}
      {stats && (
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.items}</Text>
            <Text style={styles.statLabel}>Items</Text>
          </View>
          
          <View style={styles.statDivider} />
          
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.sold}</Text>
            <Text style={styles.statLabel}>Sold</Text>
          </View>
          
          <View style={styles.statDivider} />
          
          <View style={styles.statItem}>
            <View style={styles.ratingRow}>
              <Text style={styles.statValue}>{stats.rating.toFixed(1)}</Text>
              <Ionicons name="star" size={14} color="#FFD700" />
            </View>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// Profile Completion Progress Bar
interface ProfileCompletionProps {
  percentage: number;
  onCompletePress?: () => void;
}

export function ProfileCompletion({
  percentage,
  onCompletePress,
}: ProfileCompletionProps) {
  return (
    <TouchableOpacity onPress={onCompletePress} style={styles.completionContainer}>
      <View style={styles.completionHeader}>
        <Text style={styles.completionText}>Complete your profile</Text>
        <Text style={styles.completionPercentage}>{percentage}%</Text>
      </View>
      
      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBar, { width: `${percentage}%` }]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.border,
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  infoContainer: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  handle: {
    fontSize: 15,
    color: Colors.textMuted,
    marginTop: 2,
  },
  topSellerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 6,
    alignSelf: 'flex-start',
    gap: 4,
  },
  topSellerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B8860B',
  },
  editButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  bio: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 12,
    lineHeight: 20,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.border,
    alignSelf: 'center',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  completionContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 24,
  },
  completionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  completionText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  completionPercentage: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.brand,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.brand,
    borderRadius: 2,
  },
});
