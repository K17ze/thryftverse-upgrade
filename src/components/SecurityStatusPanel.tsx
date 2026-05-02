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

type SecurityLevel = 'secure' | 'warning' | 'critical';

interface SecurityStatusPanelProps {
  level: SecurityLevel;
  twoFactorEnabled: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  lastSecurityCheck?: string;
  onEnable2FA?: () => void;
  onVerifyEmail?: () => void;
  onVerifyPhone?: () => void;
  onViewDetails?: () => void;
  style?: ViewStyle;
}

export function SecurityStatusPanel({
  level,
  twoFactorEnabled,
  emailVerified,
  phoneVerified,
  lastSecurityCheck,
  onEnable2FA,
  onVerifyEmail,
  onVerifyPhone,
  onViewDetails,
  style,
}: SecurityStatusPanelProps) {
  const getStatusConfig = () => {
    switch (level) {
      case 'secure':
        return {
          icon: 'shield-checkmark',
          color: Colors.success,
          bgColor: `${Colors.success}15`,
          title: 'Your account is secure',
          subtitle: 'All security features are enabled',
        };
      case 'warning':
        return {
          icon: 'shield-half',
          color: '#FF9800',
          bgColor: '#FF980015',
          title: 'Security can be improved',
          subtitle: 'Complete recommended actions',
        };
      case 'critical':
        return {
          icon: 'shield-alert',
          color: Colors.danger,
          bgColor: `${Colors.danger}15`,
          title: 'Action required',
          subtitle: 'Your account needs attention',
        };
    }
  };

  const config = getStatusConfig();
  
  const completedChecks = [twoFactorEnabled, emailVerified, phoneVerified].filter(Boolean).length;
  const totalChecks = 3;

  return (
    <View style={[styles.container, style]}>
      {/* Status Header */}
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: config.bgColor }]}>
          <Ionicons name={config.icon as any} size={28} color={config.color} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{config.title}</Text>
          <Text style={styles.subtitle}>{config.subtitle}</Text>
        </View>
        <TouchableOpacity onPress={onViewDetails} style={styles.detailsButton}>
          <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Progress Ring */}
      <View style={styles.progressSection}>
        <View style={styles.progressRing}>
          <View style={[styles.progressCircle, { borderColor: config.color }]}>
            <Text style={[styles.progressText, { color: config.color }]}>
              {completedChecks}/{totalChecks}
            </Text>
          </View>
          <Text style={styles.progressLabel}>Security Score</Text>
        </View>
        
        {lastSecurityCheck && (
          <Text style={styles.lastCheck}>
            Last check: {lastSecurityCheck}
          </Text>
        )}
      </View>

      {/* Security Checklist */}
      <View style={styles.checklist}>
        <SecurityCheckItem
          icon="mail"
          label="Email verified"
          isComplete={emailVerified}
          onAction={!emailVerified ? onVerifyEmail : undefined}
          actionLabel="Verify"
        />
        <SecurityCheckItem
          icon="phone-portrait"
          label="Phone number verified"
          isComplete={phoneVerified}
          onAction={!phoneVerified ? onVerifyPhone : undefined}
          actionLabel="Verify"
        />
        <SecurityCheckItem
          icon="lock-closed"
          label="Two-factor authentication"
          isComplete={twoFactorEnabled}
          onAction={!twoFactorEnabled ? onEnable2FA : undefined}
          actionLabel="Enable"
        />
      </View>
    </View>
  );
}

interface SecurityCheckItemProps {
  icon: string;
  label: string;
  isComplete: boolean;
  onAction?: () => void;
  actionLabel?: string;
}

function SecurityCheckItem({ icon, label, isComplete, onAction, actionLabel }: SecurityCheckItemProps) {
  return (
    <View style={styles.checkItem}>
      <View style={styles.checkItemLeft}>
        <View style={[styles.checkIconContainer, isComplete && styles.checkIconContainerComplete]}>
          <Ionicons 
            name={icon as any} 
            size={18} 
            color={isComplete ? Colors.success : Colors.textMuted} 
          />
        </View>
        <Text style={[styles.checkLabel, isComplete && styles.checkLabelComplete]}>
          {label}
        </Text>
      </View>
      
      {isComplete ? (
        <View style={styles.completeBadge}>
          <Ionicons name="checkmark" size={14} color={Colors.success} />
        </View>
      ) : onAction ? (
        <TouchableOpacity onPress={onAction} style={styles.actionButton}>
          <Text style={styles.actionButtonText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// Device Management Component
interface DeviceManagementProps {
  activeDevices: number;
  lastActiveDevice?: string;
  onManageDevices?: () => void;
  style?: ViewStyle;
}

export function DeviceManagement({
  activeDevices,
  lastActiveDevice,
  onManageDevices,
  style,
}: DeviceManagementProps) {
  return (
    <TouchableOpacity onPress={onManageDevices} style={[styles.deviceContainer, style]}>
      <View style={styles.deviceHeader}>
        <View style={styles.deviceIconContainer}>
          <Ionicons name="phone-portrait-outline" size={22} color={Colors.brand} />
        </View>
        <View style={styles.deviceText}>
          <Text style={styles.deviceTitle}>Active Devices</Text>
          <Text style={styles.deviceCount}>{activeDevices} device{activeDevices !== 1 ? 's' : ''}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
      </View>
      
      {lastActiveDevice && (
        <Text style={styles.deviceLastActive}>
          Last active: {lastActiveDevice}
        </Text>
      )}
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
    marginBottom: 16,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
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
  detailsButton: {
    padding: 4,
  },
  progressSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  progressRing: {
    alignItems: 'center',
  },
  progressCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 24,
    fontWeight: '700',
  },
  progressLabel: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 8,
  },
  lastCheck: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 8,
  },
  checklist: {
    gap: 12,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  checkItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  checkIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkIconContainerComplete: {
    backgroundColor: `${Colors.success}20`,
  },
  checkLabel: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  checkLabelComplete: {
    color: Colors.textSecondary,
  },
  completeBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: `${Colors.success}20`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.brand,
    borderRadius: 14,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  deviceContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: `${Colors.brand}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  deviceText: {
    flex: 1,
  },
  deviceTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  deviceCount: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 2,
  },
  deviceLastActive: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 8,
    marginLeft: 52,
  },
});
