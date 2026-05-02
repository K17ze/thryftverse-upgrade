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

interface Document {
  id: string;
  name: string;
  type: 'authenticity' | 'appraisal' | 'service' | 'provenance';
  date: string;
  verified: boolean;
}

interface PreviousOwner {
  id: string;
  name: string;
  handle?: string;
  acquiredDate: string;
  soldDate?: string;
}

interface DigitalPassportProps {
  itemName: string;
  itemId: string;
  qrCode?: string;
  previousOwners: PreviousOwner[];
  documents: Document[];
  serviceHistory?: string[];
  onScanQR?: () => void;
  onViewDocument?: (document: Document) => void;
  onViewServiceHistory?: () => void;
  style?: ViewStyle;
}

export function DigitalPassport({
  itemName,
  itemId,
  previousOwners,
  documents,
  serviceHistory,
  onScanQR,
  onViewDocument,
  onViewServiceHistory,
  style,
}: DigitalPassportProps) {
  const getDocumentIcon = (type: string) => {
    switch (type) {
      case 'authenticity':
        return { icon: 'shield-checkmark', color: Colors.success };
      case 'appraisal':
        return { icon: 'cash', color: Colors.brand };
      case 'service':
        return { icon: 'construct', color: '#FF9800' };
      case 'provenance':
        return { icon: 'time', color: '#64B5F6' };
      default:
        return { icon: 'document', color: Colors.textMuted };
    }
  };

  return (
    <View style={[styles.container, style]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.passportIcon}>
          <Ionicons name="id-card" size={24} color={Colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Digital Passport</Text>
          <Text style={styles.subtitle}>Verified authenticity & provenance</Text>
        </View>
      </View>

      {/* Item Info & QR */}
      <View style={styles.itemCard}>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={1}>
            {itemName}
          </Text>
          <Text style={styles.itemId}>ID: {itemId}</Text>
        </View>
        <TouchableOpacity style={styles.qrButton} onPress={onScanQR}>
          <Ionicons name="qr-code" size={32} color={Colors.textPrimary} />
          <Text style={styles.qrButtonText}>Scan to verify</Text>
        </TouchableOpacity>
      </View>

      {/* Verification Status */}
      <View style={styles.verificationCard}>
        <View style={styles.verificationRow}>
          <View style={styles.verificationItem}>
            <View style={[styles.checkIcon, { backgroundColor: `${Colors.success}15` }]}>
              <Ionicons name="checkmark" size={18} color={Colors.success} />
            </View>
            <View>
              <Text style={styles.verificationLabel}>Authenticated</Text>
              <Text style={styles.verificationValue}>Thryftverse Verified</Text>
            </View>
          </View>
          <View style={styles.verificationDivider} />
          <View style={styles.verificationItem}>
            <View style={[styles.checkIcon, { backgroundColor: `${Colors.success}15` }]}>
              <Ionicons name="checkmark" size={18} color={Colors.success} />
            </View>
            <View>
              <Text style={styles.verificationLabel}>Previous Owners</Text>
              <Text style={styles.verificationValue}>{previousOwners.length} verified</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Provenance Chain */}
      {previousOwners.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Item Provenance</Text>
          <View style={styles.provenanceList}>
            {previousOwners.map((owner, index) => (
              <View key={owner.id} style={styles.ownerRow}>
                <View style={styles.provenanceLine}>
                  <View style={styles.provenanceDot} />
                  {index < previousOwners.length - 1 && (
                    <View style={styles.provenanceConnector} />
                  )}
                </View>
                <View style={styles.ownerInfo}>
                  <Text style={styles.ownerName}>
                    {index === 0 ? '🏭 Original Owner' : owner.handle || owner.name}
                  </Text>
                  <Text style={styles.ownerDates}>
                    {owner.acquiredDate}
                    {owner.soldDate && ` → ${owner.soldDate}`}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Documents */}
      {documents.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Documents & Certificates</Text>
          <View style={styles.documentsList}>
            {documents.map((doc) => {
              const iconConfig = getDocumentIcon(doc.type);
              return (
                <TouchableOpacity
                  key={doc.id}
                  style={styles.documentCard}
                  onPress={() => onViewDocument?.(doc)}
                >
                  <View
                    style={[
                      styles.documentIcon,
                      { backgroundColor: `${iconConfig.color}15` },
                    ]}
                  >
                    <Ionicons
                      name={iconConfig.icon as any}
                      size={20}
                      color={iconConfig.color}
                    />
                  </View>
                  <View style={styles.documentInfo}>
                    <Text style={styles.documentName}>{doc.name}</Text>
                    <Text style={styles.documentDate}>{doc.date}</Text>
                  </View>
                  {doc.verified && (
                    <View style={styles.verifiedBadge}>
                      <Ionicons name="shield-checkmark" size={14} color={Colors.success} />
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Service History */}
      {serviceHistory && serviceHistory.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Service History</Text>
          <TouchableOpacity
            style={styles.serviceHistoryButton}
            onPress={onViewServiceHistory}
          >
            <Ionicons name="construct-outline" size={20} color={Colors.brand} />
            <View style={styles.serviceInfo}>
              <Text style={styles.serviceLabel}>Maintenance Records</Text>
              <Text style={styles.serviceValue}>
                {serviceHistory.length} service entries
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Blockchain Verification */}
      <View style={styles.blockchainCard}>
        <Ionicons name="link" size={20} color={Colors.brand} />
        <View style={styles.blockchainInfo}>
          <Text style={styles.blockchainLabel}>Blockchain Verified</Text>
          <Text style={styles.blockchainValue}>
            Authenticity recorded on immutable ledger
          </Text>
        </View>
      </View>
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
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  passportIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${Colors.brand}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 2,
  },
  itemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  itemId: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: 'monospace',
  },
  qrButton: {
    alignItems: 'center',
    padding: 8,
  },
  qrButtonText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
  },
  verificationCard: {
    backgroundColor: Colors.background,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  verificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verificationItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  verificationDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.border,
    marginHorizontal: 16,
  },
  checkIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verificationLabel: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  verificationValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  provenanceList: {
    backgroundColor: Colors.background,
    padding: 16,
    borderRadius: 12,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  provenanceLine: {
    width: 20,
    alignItems: 'center',
    marginRight: 12,
  },
  provenanceDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.brand,
  },
  provenanceConnector: {
    width: 2,
    height: 40,
    backgroundColor: Colors.border,
    marginTop: 4,
  },
  ownerInfo: {
    flex: 1,
    paddingBottom: 16,
  },
  ownerName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  ownerDates: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  documentsList: {
    gap: 8,
  },
  documentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.background,
    padding: 12,
    borderRadius: 10,
  },
  documentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  documentDate: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  verifiedBadge: {
    padding: 4,
  },
  serviceHistoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.background,
    padding: 14,
    borderRadius: 10,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  serviceValue: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  blockchainCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: `${Colors.brand}08`,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${Colors.brand}20`,
  },
  blockchainInfo: {
    flex: 1,
  },
  blockchainLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.brand,
    marginBottom: 2,
  },
  blockchainValue: {
    fontSize: 12,
    color: Colors.textMuted,
  },
});
