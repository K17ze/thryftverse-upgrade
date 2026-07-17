import React from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';

/** Vehicle document — tap to open. */
export interface CoOwnVehicleDocument {
  label: string;
  uri: string;
}

/** Vehicle props — the issuance vehicle structure (§01 §B, §04 §A6). */
export interface CoOwnVehicleFields {
  vehicleName?: string;
  legalForm?: string;
  jurisdiction?: string;
  operator?: string;
  custodian?: string;
  documents?: CoOwnVehicleDocument[];
}

export interface CoOwnIssuerCardProps extends CoOwnVehicleFields {
  username: string;
  avatarUri?: string | null;
  verified?: boolean;
  rating?: number | null;
  reviewCount?: number | null;
  location?: string | null;
  memberSince?: string | null;
  isFollowing?: boolean;
  onPress?: () => void;
  onMessage?: () => void;
  canMessage?: boolean;
}

export function CoOwnIssuerCard({
  username,
  avatarUri,
  verified,
  rating,
  reviewCount,
  location,
  memberSince,
  isFollowing,
  onPress,
  onMessage,
  canMessage,
  vehicleName,
  legalForm,
  jurisdiction,
  operator,
  custodian,
  documents,
}: CoOwnIssuerCardProps) {
  const { colors } = useAppTheme();
  const hasVehicle = vehicleName || legalForm || jurisdiction || operator || custodian || (documents && documents.length > 0);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Issuer ${username}${verified ? ', verified' : ''}${rating ? `, rating ${rating} stars` : ''}${vehicleName ? `, vehicle ${vehicleName}` : ''}`}
    >
      <View style={[styles.root, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.avatarWrap}>
          {avatarUri ? (
            <CachedImage uri={avatarUri} style={styles.avatar} contentFit="cover" transition={200} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="person" size={22} color={colors.textMuted} />
            </View>
          )}
        </View>

        <View style={styles.identity}>
          <View style={styles.nameRow}>
            <Text style={[styles.username, { color: colors.textPrimary }]} numberOfLines={1}>{username}</Text>
            {verified ? (
              <Ionicons name="checkmark-circle" size={15} color={colors.brand} />
            ) : null}
          </View>
          <Text style={[styles.role, { color: colors.textSecondary }]}>
            {hasVehicle && vehicleName ? vehicleName : 'Co-Own issuer'}
          </Text>

          <View style={styles.statsRow}>
            {rating != null ? (
              <View style={styles.statItem}>
                <Ionicons name="star" size={12} color={colors.brand} />
                <Text style={[styles.statText, { color: colors.textSecondary }]}>
                  {rating.toFixed(1)}{reviewCount != null ? ` (${reviewCount})` : ''}
                </Text>
              </View>
            ) : null}
            {location ? (
              <View style={styles.statItem}>
                <Ionicons name="location-outline" size={12} color={colors.textMuted} />
                <Text style={[styles.statText, { color: colors.textSecondary }]} numberOfLines={1}>{location}</Text>
              </View>
            ) : null}
            {memberSince ? (
              <View style={styles.statItem}>
                <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
                <Text style={[styles.statText, { color: colors.textSecondary }]}>Since {memberSince}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {onMessage && canMessage ? (
          <Pressable
            onPress={(e) => { e.stopPropagation(); onMessage(); }}
            style={[styles.msgBtn, { borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={`Message ${username}`}
          >
            <Ionicons name="chatbubble-outline" size={18} color={colors.textPrimary} />
          </Pressable>
        ) : null}

        {/* Vehicle section — new. Rendered when any vehicle field is present. */}
        {hasVehicle && (
          <View style={[styles.vehicleSection, { borderColor: colors.border }]}>
            {legalForm && (
              <VehicleRow icon="business-outline" label="Legal form" value={legalForm} colors={colors} />
            )}
            {jurisdiction && (
              <VehicleRow icon="globe-outline" label="Jurisdiction" value={jurisdiction} colors={colors} />
            )}
            {operator && (
              <VehicleRow icon="person-circle-outline" label="Operator" value={operator} colors={colors} />
            )}
            {custodian && (
              <VehicleRow icon="shield-checkmark-outline" label="Custodian" value={custodian} colors={colors} />
            )}
            {documents && documents.length > 0 && (
              <View style={styles.documentsSection}>
                <Text style={[styles.documentsHeader, { color: colors.textMuted }]}>Documents</Text>
                {documents.map((doc, i) => (
                  <Pressable
                    key={i}
                    onPress={(e) => { e.stopPropagation(); Linking.openURL(doc.uri); }}
                    style={styles.documentRow}
                    accessibilityRole="link"
                    accessibilityLabel={`Open document: ${doc.label}`}
                  >
                    <Ionicons name="document-text-outline" size={14} color={colors.textSecondary} />
                    <Text style={[styles.documentLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                      {doc.label}
                    </Text>
                    <Ionicons name="open-outline" size={12} color={colors.textMuted} />
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
}

/** A vehicle info row — icon + label + value. */
function VehicleRow({
  icon,
  label,
  value,
  colors,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  return (
    <View style={styles.vehicleRow}>
      <Ionicons name={icon} size={13} color={colors.textMuted} />
      <Text style={[styles.vehicleRowLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.vehicleRowValue, { color: colors.textSecondary }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** Alias for the upgraded component — the spec calls it CoOwnVehicleCard. */
export const CoOwnVehicleCard = CoOwnIssuerCard;

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    padding: Space.md,
  },
  avatarWrap: {
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  username: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
  },
  role: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
  },
  msgBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  // ── Vehicle section ──
  vehicleSection: {
    width: '100%',
    marginTop: Space.sm,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Space.xs,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    minHeight: 20,
  },
  vehicleRowLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
    width: 80,
  },
  vehicleRowValue: {
    flex: 1,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.body.letterSpacing,
  },
  documentsSection: {
    gap: Space.xs,
    marginTop: Space.xs,
  },
  documentsHeader: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
  },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: 2,
  },
  documentLabel: {
    flex: 1,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
  },
});
