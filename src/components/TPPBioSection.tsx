import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

interface Policy {
  id: string;
  icon: string;
  label: string;
  value: string;
}

interface SocialLink {
  platform: 'instagram' | 'twitter' | 'tiktok' | 'website';
  url: string;
  handle?: string;
}

interface TPPBioSectionProps {
  description: string;
  location?: string;
  joined: string;
  policies?: Policy[];
  socialLinks?: SocialLink[];
  maxLength?: number;
  onPolicyPress?: (policy: Policy) => void;
  onSocialPress?: (link: SocialLink) => void;
  style?: ViewStyle;
}

export function TPPBioSection({
  description,
  location,
  joined,
  policies = [],
  socialLinks = [],
  maxLength = 150,
  onPolicyPress,
  onSocialPress,
  style,
}: TPPBioSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const shouldTruncate = description.length > maxLength;
  const displayText = isExpanded || !shouldTruncate
    ? description
    : `${description.slice(0, maxLength)}...`;

  const getSocialIcon = (platform: string) => {
    switch (platform) {
      case 'instagram':
        return 'logo-instagram';
      case 'twitter':
        return 'logo-twitter';
      case 'tiktok':
        return 'musical-notes';
      case 'website':
        return 'link';
      default:
        return 'link';
    }
  };

  const getSocialColor = (platform: string) => {
    switch (platform) {
      case 'instagram':
        return '#E4405F';
      case 'twitter':
        return '#1DA1F2';
      case 'tiktok':
        return '#000000';
      case 'website':
        return Colors.brand;
      default:
        return Colors.textMuted;
    }
  };

  return (
    <View style={[styles.container, style]}>
      {/* Location & Joined */}
      <View style={styles.metaRow}>
        {location && (
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.metaText}>{location}</Text>
          </View>
        )}
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.metaText}>{joined}</Text>
        </View>
      </View>

      {/* Bio Description */}
      <View style={styles.bioContainer}>
        <Text style={styles.bioText}>{displayText}</Text>
        {shouldTruncate && (
          <TouchableOpacity
            onPress={() => setIsExpanded(!isExpanded)}
            style={styles.expandButton}
          >
            <Text style={styles.expandText}>
              {isExpanded ? 'Show less' : 'Read more'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Policy Pills */}
      {policies.length > 0 && (
        <View style={styles.policiesContainer}>
          <Text style={styles.sectionLabel}>Policies</Text>
          <View style={styles.policiesRow}>
            {policies.map((policy) => (
              <TouchableOpacity
                key={policy.id}
                style={styles.policyPill}
                onPress={() => onPolicyPress?.(policy)}
              >
                <Ionicons
                  name={policy.icon as any}
                  size={14}
                  color={Colors.textMuted}
                />
                <View style={styles.policyTextContainer}>
                  <Text style={styles.policyLabel}>{policy.label}</Text>
                  <Text style={styles.policyValue}>{policy.value}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Social Links */}
      {socialLinks.length > 0 && (
        <View style={styles.socialContainer}>
          <Text style={styles.sectionLabel}>Links</Text>
          <View style={styles.socialRow}>
            {socialLinks.map((link, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.socialButton,
                  { backgroundColor: `${getSocialColor(link.platform)}15` },
                ]}
                onPress={() => onSocialPress?.(link)}
              >
                <Ionicons
                  name={getSocialIcon(link.platform) as any}
                  size={18}
                  color={getSocialColor(link.platform)}
                />
                {link.handle && (
                  <Text
                    style={[
                      styles.socialHandle,
                      { color: getSocialColor(link.platform) },
                    ]}
                  >
                    {link.handle}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  bioContainer: {
    marginBottom: 16,
  },
  bioText: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textPrimary,
  },
  expandButton: {
    marginTop: 4,
  },
  expandText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.brand,
  },
  policiesContainer: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  policiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  policyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  policyTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  policyLabel: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  policyValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  socialContainer: {
    marginBottom: 8,
  },
  socialRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  socialHandle: {
    fontSize: 13,
    fontWeight: '600',
  },
});
