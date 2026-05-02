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

interface DataUsageDashboardProps {
  storageUsed: number; // in MB
  storageTotal: number; // in MB
  cacheSize: number; // in MB
  downloadSize: number; // in MB
  onClearCache?: () => void;
  onManageStorage?: () => void;
  style?: ViewStyle;
}

export function DataUsageDashboard({
  storageUsed,
  storageTotal,
  cacheSize,
  downloadSize,
  onClearCache,
  onManageStorage,
  style,
}: DataUsageDashboardProps) {
  const usagePercentage = (storageUsed / storageTotal) * 100;
  
  const formatSize = (mb: number) => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${Math.round(mb)} MB`;
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return Colors.danger;
    if (percentage >= 75) return '#FF9800'; // Orange warning color
    return Colors.success;
  };

  return (
    <View style={[styles.container, style]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons name="pie-chart" size={24} color={Colors.brand} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Storage & Data</Text>
          <Text style={styles.subtitle}>
            {formatSize(storageUsed)} of {formatSize(storageTotal)} used
          </Text>
        </View>
        <TouchableOpacity onPress={onManageStorage} style={styles.manageButton}>
          <Text style={styles.manageButtonText}>Manage</Text>
        </TouchableOpacity>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBarBackground}>
          <View 
            style={[
              styles.progressBarFill, 
              { 
                width: `${Math.min(usagePercentage, 100)}%`,
                backgroundColor: getUsageColor(usagePercentage)
              }
            ]} 
          />
        </View>
        <Text style={[styles.percentageText, { color: getUsageColor(usagePercentage) }]}>
          {Math.round(usagePercentage)}%
        </Text>
      </View>

      {/* Breakdown */}
      <View style={styles.breakdownContainer}>
        <DataUsageItem
          icon="image"
          label="Media & Photos"
          size={storageUsed * 0.45}
          color={Colors.brand}
          formatSize={formatSize}
        />
        <DataUsageItem
          icon="document-text"
          label="Documents"
          size={storageUsed * 0.25}
          color="#4CAF50"
          formatSize={formatSize}
        />
        <DataUsageItem
          icon="cloud-download"
          label="Downloads"
          size={downloadSize}
          color="#2196F3"
          formatSize={formatSize}
        />
        <DataUsageItem
          icon="time"
          label="Cache"
          size={cacheSize}
          color="#FF9800"
          formatSize={formatSize}
          onClear={onClearCache}
        />
      </View>
    </View>
  );
}

interface DataUsageItemProps {
  icon: string;
  label: string;
  size: number;
  color: string;
  formatSize: (mb: number) => string;
  onClear?: () => void;
}

function DataUsageItem({ icon, label, size, color, formatSize, onClear }: DataUsageItemProps) {
  return (
    <View style={styles.usageItem}>
      <View style={[styles.usageIconContainer, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <View style={styles.usageTextContainer}>
        <Text style={styles.usageLabel}>{label}</Text>
        <Text style={styles.usageSize}>{formatSize(size)}</Text>
      </View>
      {onClear && (
        <TouchableOpacity onPress={onClear} style={styles.clearButton}>
          <Text style={styles.clearButtonText}>Clear</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// Network Usage Component
interface NetworkUsageProps {
  wifiUsage: number; // in MB
  cellularUsage: number; // in MB
  style?: ViewStyle;
}

export function NetworkUsage({ wifiUsage, cellularUsage, style }: NetworkUsageProps) {
  const formatSize = (mb: number) => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${Math.round(mb)} MB`;
  };

  const totalUsage = wifiUsage + cellularUsage;
  const wifiPercentage = totalUsage > 0 ? (wifiUsage / totalUsage) * 100 : 0;
  const cellularPercentage = totalUsage > 0 ? (cellularUsage / totalUsage) * 100 : 0;

  return (
    <View style={[styles.networkContainer, style]}>
      <Text style={styles.networkTitle}>Network Usage</Text>
      
      <View style={styles.networkBars}>
        <View style={styles.networkBarContainer}>
          <View style={styles.networkBarLabels}>
            <View style={styles.networkLabelRow}>
              <Ionicons name="wifi" size={16} color={Colors.success} />
              <Text style={styles.networkLabel}>Wi-Fi</Text>
            </View>
            <Text style={styles.networkValue}>{formatSize(wifiUsage)}</Text>
          </View>
          <View style={styles.networkBarBackground}>
            <View style={[styles.networkBarFill, { width: `${wifiPercentage}%`, backgroundColor: Colors.success }]} />
          </View>
        </View>

        <View style={styles.networkBarContainer}>
          <View style={styles.networkBarLabels}>
            <View style={styles.networkLabelRow}>
              <Ionicons name="cellular" size={16} color={Colors.brand} />
              <Text style={styles.networkLabel}>Cellular</Text>
            </View>
            <Text style={styles.networkValue}>{formatSize(cellularUsage)}</Text>
          </View>
          <View style={styles.networkBarBackground}>
            <View style={[styles.networkBarFill, { width: `${cellularPercentage}%`, backgroundColor: Colors.brand }]} />
          </View>
        </View>
      </View>
    </View>
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
    marginBottom: 16,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: `${Colors.brand}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 2,
  },
  manageButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.background,
    borderRadius: 16,
  },
  manageButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.brand,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  progressBarBackground: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  percentageText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 12,
    minWidth: 35,
  },
  breakdownContainer: {
    gap: 12,
  },
  usageItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  usageIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  usageTextContainer: {
    flex: 1,
  },
  usageLabel: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  usageSize: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: `${Colors.danger}15`,
    borderRadius: 14,
  },
  clearButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.danger,
  },
  networkContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  networkTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  networkBars: {
    gap: 16,
  },
  networkBarContainer: {
    gap: 8,
  },
  networkBarLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  networkLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  networkLabel: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  networkValue: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  networkBarBackground: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  networkBarFill: {
    height: '100%',
    borderRadius: 3,
  },
});
