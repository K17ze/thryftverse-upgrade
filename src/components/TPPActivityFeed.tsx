import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

interface ActivityItem {
  id: string;
  type: 'sold' | 'listed' | 'review';
  item?: {
    id: string;
    name: string;
    image: string;
    price: number;
    currency: string;
  };
  buyerName?: string;
  reviewerName?: string;
  rating?: number;
  timeAgo: string;
}

interface Milestone {
  type: 'first_sale' | '100_sales' | '5_star_streak' | 'top_seller';
  date: string;
  badge: string;
  description: string;
}

interface TPPActivityFeedProps {
  activities: ActivityItem[];
  milestones: Milestone[];
  visible: boolean;
  onPrivacyToggle?: () => void;
  onActivityPress?: (activity: ActivityItem) => void;
  style?: ViewStyle;
}

export function TPPActivityFeed({
  activities,
  milestones,
  visible,
  onPrivacyToggle,
  onActivityPress,
  style,
}: TPPActivityFeedProps) {
  if (!visible) {
    return (
      <View style={[styles.container, styles.hiddenContainer, style]}>
        <Ionicons name="eye-off-outline" size={40} color={Colors.textMuted} />
        <Text style={styles.hiddenTitle}>Activity Hidden</Text>
        <Text style={styles.hiddenSubtitle}>
          This seller has chosen to hide their activity
        </Text>
      </View>
    );
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'sold':
        return { name: 'cash-outline', color: Colors.success };
      case 'listed':
        return { name: 'add-circle-outline', color: Colors.brand };
      case 'review':
        return { name: 'star-outline', color: '#FFB800' };
      default:
        return { name: 'ellipse-outline', color: Colors.textMuted };
    }
  };

  const getActivityText = (activity: ActivityItem) => {
    switch (activity.type) {
      case 'sold':
        return (
          <Text style={styles.activityText}>
            <Text style={styles.boldText}>Sold</Text>{' '}
            {activity.item?.name}{' '}
            {activity.buyerName && (
              <>
                to <Text style={styles.boldText}>{activity.buyerName}</Text>
              </>
            )}
          </Text>
        );
      case 'listed':
        return (
          <Text style={styles.activityText}>
            <Text style={styles.boldText}>Listed</Text> {activity.item?.name}
          </Text>
        );
      case 'review':
        return (
          <Text style={styles.activityText}>
            Received a{' '}
            <Text style={[styles.boldText, { color: '#FFB800' }]}>
              {activity.rating}-star
            </Text>{' '}
            review from {activity.reviewerName}
          </Text>
        );
      default:
        return null;
    }
  };

  const getMilestoneIcon = (type: string) => {
    switch (type) {
      case 'first_sale':
        return { name: 'trending-up', color: Colors.brand };
      case '100_sales':
        return { name: 'trophy', color: '#FFB800' };
      case '5_star_streak':
        return { name: 'star', color: '#FFB800' };
      case 'top_seller':
        return { name: 'medal', color: '#9C27B0' };
      default:
        return { name: 'award', color: Colors.brand };
    }
  };

  return (
    <View style={[styles.container, style]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <TouchableOpacity onPress={onPrivacyToggle}>
          <Ionicons name="eye-outline" size={20} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Milestones */}
      {milestones.length > 0 && (
        <View style={styles.milestonesSection}>
          <Text style={styles.milestonesTitle}>Milestones</Text>
          <View style={styles.milestonesRow}>
            {milestones.slice(0, 3).map((milestone, index) => {
              const icon = getMilestoneIcon(milestone.type);
              return (
                <View key={index} style={styles.milestoneBadge}>
                  <View
                    style={[
                      styles.milestoneIcon,
                      { backgroundColor: `${icon.color}15` },
                    ]}
                  >
                    <Ionicons name={icon.name as any} size={20} color={icon.color} />
                  </View>
                  <Text style={styles.milestoneBadge}>{milestone.badge}</Text>
                  <Text style={styles.milestoneDate}>{milestone.date}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Activity Timeline */}
      <View style={styles.timeline}>
        {activities.slice(0, 5).map((activity, index) => {
          const icon = getActivityIcon(activity.type);
          const isLast = index === Math.min(activities.length, 5) - 1;

          return (
            <TouchableOpacity
              key={activity.id}
              style={styles.timelineItem}
              onPress={() => onActivityPress?.(activity)}
            >
              {/* Timeline Line */}
              {!isLast && <View style={styles.timelineLine} />}

              {/* Timeline Dot */}
              <View
                style={[
                  styles.timelineDot,
                  { backgroundColor: icon.color },
                ]}
              >
                <Ionicons name={icon.name as any} size={14} color="#FFFFFF" />
              </View>

              {/* Content */}
              <View style={styles.activityContent}>
                <View style={styles.activityHeader}>
                  {getActivityText(activity)}
                  <Text style={styles.timeAgo}>{activity.timeAgo}</Text>
                </View>

                {/* Item Preview */}
                {activity.item && (
                  <View style={styles.itemPreview}>
                    <Image
                      source={{ uri: activity.item.image }}
                      style={styles.itemPreviewImage}
                    />
                    <View style={styles.itemPreviewInfo}>
                      <Text style={styles.itemPreviewName} numberOfLines={1}>
                        {activity.item.name}
                      </Text>
                      <Text style={styles.itemPreviewPrice}>
                        {activity.item.currency} {activity.item.price.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    padding: 16,
  },
  hiddenContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  hiddenTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textMuted,
    marginTop: 12,
  },
  hiddenSubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  milestonesSection: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  milestonesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: 12,
  },
  milestonesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  milestoneBadge: {
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: 12,
    borderRadius: 12,
    flex: 1,
  },
  milestoneIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  milestoneBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  milestoneDate: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  timeline: {
    marginTop: 8,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 16,
    position: 'relative',
  },
  timelineLine: {
    position: 'absolute',
    left: 16,
    top: 32,
    width: 2,
    height: '100%',
    backgroundColor: Colors.border,
  },
  timelineDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    zIndex: 1,
  },
  activityContent: {
    flex: 1,
    paddingTop: 4,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  activityText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 20,
    paddingRight: 8,
  },
  boldText: {
    fontWeight: '600',
  },
  timeAgo: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  itemPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: Colors.background,
    padding: 8,
    borderRadius: 8,
  },
  itemPreviewImage: {
    width: 48,
    height: 48,
    borderRadius: 6,
    marginRight: 10,
  },
  itemPreviewInfo: {
    flex: 1,
  },
  itemPreviewName: {
    fontSize: 13,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  itemPreviewPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.brand,
  },
});
