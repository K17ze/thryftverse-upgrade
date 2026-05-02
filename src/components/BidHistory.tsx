import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

interface Bid {
  id: string;
  rank: number;
  bidder: string;
  bidderAvatar?: string;
  amount: number;
  timeAgo: string;
  isAutoBid?: boolean;
  isYou?: boolean;
}

interface BidHistoryProps {
  bids: Bid[];
  totalBids: number;
  currency?: string;
  onViewAllPress?: () => void;
  maxDisplay?: number;
  style?: ViewStyle;
}

export function BidHistory({
  bids,
  totalBids,
  currency = '$',
  onViewAllPress,
  maxDisplay = 5,
  style,
}: BidHistoryProps) {
  const displayBids = bids.slice(0, maxDisplay);

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return { icon: 'trophy', color: '#FFB800' };
      case 2:
        return { icon: 'medal', color: '#C0C0C0' };
      case 3:
        return { icon: 'medal', color: '#CD7F32' };
      default:
        return { icon: 'ellipse', color: Colors.textMuted };
    }
  };

  const anonymizeBidder = (name: string) => {
    if (name.length <= 2) return name;
    return name.charAt(0) + '***' + name.charAt(name.length - 1);
  };

  return (
    <View style={[styles.container, style]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="list-outline" size={20} color={Colors.textPrimary} />
          <Text style={styles.title}>Bid History</Text>
        </View>
        {totalBids > maxDisplay && (
          <TouchableOpacity onPress={onViewAllPress}>
            <Text style={styles.viewAllText}>
              View All {totalBids} Bids
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Bid List */}
      <View style={styles.bidList}>
        {displayBids.map((bid, index) => {
          const rankConfig = getRankIcon(bid.rank);
          const isTopBid = bid.rank === 1;

          return (
            <View
              key={bid.id}
              style={[
                styles.bidRow,
                isTopBid && styles.topBidRow,
                index === displayBids.length - 1 && styles.lastRow,
              ]}
            >
              {/* Rank */}
              <View style={styles.rankContainer}>
                <Ionicons
                  name={rankConfig.icon as any}
                  size={20}
                  color={rankConfig.color}
                />
                <Text style={[styles.rankText, { color: rankConfig.color }]}>
                  #{bid.rank}
                </Text>
              </View>

              {/* Bidder Info */}
              <View style={styles.bidderInfo}>
                <Text style={[styles.bidderName, bid.isYou && styles.yourBidText]}>
                  {bid.isYou ? 'You' : anonymizeBidder(bid.bidder)}
                </Text>
                {bid.isAutoBid && (
                  <View style={styles.autoBidBadge}>
                    <Ionicons name="refresh" size={10} color={Colors.brand} />
                    <Text style={styles.autoBidText}>Auto</Text>
                  </View>
                )}
              </View>

              {/* Amount */}
              <Text style={[styles.amount, isTopBid && styles.topBidAmount]}>
                {currency}{bid.amount.toLocaleString()}
              </Text>

              {/* Time */}
              <Text style={styles.timeAgo}>{bid.timeAgo}</Text>
            </View>
          );
        })}
      </View>

      {/* Bid Activity Summary */}
      {totalBids > 0 && (
        <View style={styles.summary}>
          <Ionicons name="trending-up" size={16} color={Colors.success} />
          <Text style={styles.summaryText}>
            {totalBids} bids in the last 24 hours
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 16,
    marginHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.brand,
  },
  bidList: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    overflow: 'hidden',
  },
  bidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  topBidRow: {
    backgroundColor: `${Colors.success}08`,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  rankContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: 50,
  },
  rankText: {
    fontSize: 13,
    fontWeight: '600',
  },
  bidderInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bidderName: {
    fontSize: 14,
    color: Colors.textPrimary,
  },
  yourBidText: {
    fontWeight: '600',
    color: Colors.brand,
  },
  autoBidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: `${Colors.brand}15`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  autoBidText: {
    fontSize: 10,
    color: Colors.brand,
    fontWeight: '500',
  },
  amount: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    width: 80,
    textAlign: 'right',
  },
  topBidAmount: {
    color: Colors.success,
    fontSize: 16,
  },
  timeAgo: {
    fontSize: 12,
    color: Colors.textMuted,
    width: 50,
    textAlign: 'right',
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  summaryText: {
    fontSize: 13,
    color: Colors.success,
    fontWeight: '500',
  },
});
