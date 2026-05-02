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

interface CommerceSectionProps {
  isSeller: boolean;
  sellerStatus?: 'active' | 'pending' | 'suspended' | 'unverified';
  payoutMethod?: {
    type: 'bank' | 'paypal' | 'card';
    last4: string;
    isDefault: boolean;
  };
  balance?: number;
  currency?: string;
  pendingOrders?: number;
  shippingProfiles?: number;
  onSetupPayout?: () => void;
  onAddShippingProfile?: () => void;
  onViewSellerDashboard?: () => void;
  onViewOrders?: () => void;
  style?: ViewStyle;
}

export function CommerceSection({
  isSeller,
  sellerStatus = 'unverified',
  payoutMethod,
  balance = 0,
  currency = 'USD',
  pendingOrders = 0,
  shippingProfiles = 0,
  onSetupPayout,
  onAddShippingProfile,
  onViewSellerDashboard,
  onViewOrders,
  style,
}: CommerceSectionProps) {
  if (!isSeller) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.notSellerHeader}>
          <View style={styles.commerceIconContainer}>
            <Ionicons name="storefront" size={28} color={Colors.brand} />
          </View>
          <View style={styles.notSellerText}>
            <Text style={styles.notSellerTitle}>Become a Seller</Text>
            <Text style={styles.notSellerSubtitle}>
              Start selling your items and reach thousands of buyers
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.becomeSellerButton}>
          <Text style={styles.becomeSellerButtonText}>Apply to Sell</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const getStatusConfig = () => {
    switch (sellerStatus) {
      case 'active':
        return {
          icon: 'checkmark-circle',
          color: Colors.success,
          bgColor: `${Colors.success}15`,
          label: 'Active Seller',
        };
      case 'pending':
        return {
          icon: 'time',
          color: '#FF9800',
          bgColor: '#FF980015',
          label: 'Verification Pending',
        };
      case 'suspended':
        return {
          icon: 'alert-circle',
          color: Colors.danger,
          bgColor: `${Colors.danger}15`,
          label: 'Account Suspended',
        };
      case 'unverified':
      default:
        return {
          icon: 'warning',
          color: '#FF9800',
          bgColor: '#FF980015',
          label: 'Verification Required',
        };
    }
  };

  const statusConfig = getStatusConfig();

  return (
    <View style={[styles.container, style]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.commerceIconContainer, { backgroundColor: statusConfig.bgColor }]}>
            <Ionicons name="storefront" size={24} color={statusConfig.color} />
          </View>
          <View>
            <Text style={styles.title}>Seller Dashboard</Text>
            <View style={styles.statusRow}>
              <Ionicons name={statusConfig.icon as any} size={14} color={statusConfig.color} />
              <Text style={[styles.statusLabel, { color: statusConfig.color }]}>
                {statusConfig.label}
              </Text>
            </View>
          </View>
        </View>
        <TouchableOpacity onPress={onViewSellerDashboard} style={styles.viewAllButton}>
          <Text style={styles.viewAllText}>View All</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.brand} />
        </TouchableOpacity>
      </View>

      {/* Balance Card */}
      <View style={styles.balanceCard}>
        <View>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmount}>
            {currency} {balance.toFixed(2)}
          </Text>
        </View>
        <TouchableOpacity style={styles.withdrawButton}>
          <Text style={styles.withdrawButtonText}>Withdraw</Text>
        </TouchableOpacity>
      </View>

      {/* Quick Stats */}
      <View style={styles.statsRow}>
        <TouchableOpacity onPress={onViewOrders} style={styles.statItem}>
          <View style={styles.statIconContainer}>
            <Ionicons name="cube" size={20} color={Colors.brand} />
          </View>
          <Text style={styles.statValue}>{pendingOrders}</Text>
          <Text style={styles.statLabel}>Pending Orders</Text>
        </TouchableOpacity>

        <View style={styles.statDivider} />

        <View style={styles.statItem}>
          <View style={styles.statIconContainer}>
            <Ionicons name="airplane" size={20} color={Colors.success} />
          </View>
          <Text style={styles.statValue}>{shippingProfiles}</Text>
          <Text style={styles.statLabel}>Shipping Profiles</Text>
        </View>
      </View>

      {/* Setup Checklist */}
      <View style={styles.checklist}>
        <Text style={styles.checklistTitle}>Complete Setup</Text>
        
        {!payoutMethod && (
          <TouchableOpacity onPress={onSetupPayout} style={styles.checklistItem}>
            <View style={styles.checklistIconContainer}>
              <Ionicons name="card" size={18} color={Colors.danger} />
            </View>
            <View style={styles.checklistText}>
              <Text style={styles.checklistItemTitle}>Add Payout Method</Text>
              <Text style={styles.checklistItemSubtitle}>Required to receive payments</Text>
            </View>
            <View style={styles.warningBadge}>
              <Text style={styles.warningBadgeText}>Required</Text>
            </View>
          </TouchableOpacity>
        )}

        {payoutMethod && (
          <View style={styles.checklistItem}>
            <View style={[styles.checklistIconContainer, { backgroundColor: `${Colors.success}15` }]}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
            </View>
            <View style={styles.checklistText}>
              <Text style={styles.checklistItemTitle}>Payout Method Added</Text>
              <Text style={styles.checklistItemSubtitle}>
                {payoutMethod.type === 'bank' && 'Bank Account'}
                {payoutMethod.type === 'paypal' && 'PayPal'}
                {payoutMethod.type === 'card' && 'Card'} ending in {payoutMethod.last4}
              </Text>
            </View>
            <Ionicons name="checkmark" size={18} color={Colors.success} />
          </View>
        )}

        {shippingProfiles === 0 && (
          <TouchableOpacity onPress={onAddShippingProfile} style={styles.checklistItem}>
            <View style={styles.checklistIconContainer}>
              <Ionicons name="airplane" size={18} color="#FF9800" />
            </View>
            <View style={styles.checklistText}>
              <Text style={styles.checklistItemTitle}>Add Shipping Profile</Text>
              <Text style={styles.checklistItemSubtitle}>Set up shipping rates</Text>
            </View>
            <View style={[styles.warningBadge, { backgroundColor: '#FF980020' }]}>
              <Text style={[styles.warningBadgeText, { color: '#FF9800' }]}>Recommended</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// Seller Analytics Preview
interface SellerAnalyticsProps {
  totalSales: number;
  totalOrders: number;
  avgOrderValue: number;
  currency: string;
  onViewAnalytics?: () => void;
  style?: ViewStyle;
}

export function SellerAnalytics({
  totalSales,
  totalOrders,
  avgOrderValue,
  currency,
  onViewAnalytics,
  style,
}: SellerAnalyticsProps) {
  return (
    <TouchableOpacity onPress={onViewAnalytics} style={[styles.analyticsContainer, style]}>
      <View style={styles.analyticsHeader}>
        <Text style={styles.analyticsTitle}>Performance</Text>
        <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
      </View>
      
      <View style={styles.analyticsGrid}>
        <View style={styles.analyticsItem}>
          <Text style={styles.analyticsValue}>{currency} {totalSales.toLocaleString()}</Text>
          <Text style={styles.analyticsLabel}>Total Sales</Text>
        </View>
        <View style={styles.analyticsItem}>
          <Text style={styles.analyticsValue}>{totalOrders}</Text>
          <Text style={styles.analyticsLabel}>Orders</Text>
        </View>
        <View style={styles.analyticsItem}>
          <Text style={styles.analyticsValue}>{currency} {avgOrderValue.toFixed(0)}</Text>
          <Text style={styles.analyticsLabel}>Avg. Order</Text>
        </View>
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
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  commerceIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: `${Colors.brand}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.brand,
  },
  balanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  balanceLabel: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  withdrawButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.brand,
    borderRadius: 20,
  },
  withdrawButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  statIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: Colors.border,
  },
  checklist: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 16,
  },
  checklistTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  checklistIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: `${Colors.danger}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checklistText: {
    flex: 1,
  },
  checklistItemTitle: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  checklistItemSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  warningBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: `${Colors.danger}15`,
    borderRadius: 12,
  },
  warningBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.danger,
  },
  notSellerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  notSellerText: {
    flex: 1,
    marginLeft: 12,
  },
  notSellerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  notSellerSubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 2,
  },
  becomeSellerButton: {
    backgroundColor: Colors.brand,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  becomeSellerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  analyticsContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  analyticsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  analyticsTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  analyticsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  analyticsItem: {
    alignItems: 'center',
    flex: 1,
  },
  analyticsValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  analyticsLabel: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
  },
});
