import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { Caption, BodyEmphasis, Meta } from '../ui/Text';
import { CachedImage } from '../CachedImage';
import * as WebBrowser from 'expo-web-browser';

interface LinkPreviewData {
  title?: string;
  description?: string;
  image?: string;
  domain?: string;
}

interface LinkPreviewCardProps {
  url: string;
  preview?: LinkPreviewData;
  onPress?: () => void;
  style?: ViewStyle;
}

// Simple regex to detect URLs
export function extractFirstUrl(text: string): string | null {
  const urlRegex = /https?:\/\/[^\s]+/i;
  const match = text.match(urlRegex);
  return match?.[0] ?? null;
}

export function LinkPreviewCard({
  url,
  preview,
  onPress,
  style,
}: LinkPreviewCardProps) {
  const [localPreview, setLocalPreview] = useState<LinkPreviewData | undefined>(preview);

  useEffect(() => {
    if (preview) return;
    // In a real app, you'd call a link preview API here
    // For now, generate a minimal preview from the URL
    try {
      const urlObj = new URL(url);
      setLocalPreview({
        domain: urlObj.hostname.replace(/^www\./, ''),
        title: urlObj.hostname,
      });
    } catch {
      setLocalPreview({ domain: 'Link' });
    }
  }, [url, preview]);

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    void WebBrowser.openBrowserAsync(url);
  };

  if (!localPreview) return null;

  return (
    <AnimatedPressable
      style={[styles.container, style]}
      onPress={handlePress}
      accessibilityRole="link"
      accessibilityLabel={`Open link to ${localPreview.domain}`}
      activeOpacity={0.7}
      scaleValue={0.98}
      hapticFeedback="light"
    >
      {localPreview.image && (
        <CachedImage
          uri={localPreview.image}
          style={styles.image}
          contentFit="cover"
        />
      )}
      <View style={styles.textWrap}>
        {localPreview.title && (
          <BodyEmphasis numberOfLines={1}>{localPreview.title}</BodyEmphasis>
        )}
        {localPreview.description && (
          <Caption color={Colors.textSecondary} numberOfLines={2}>
            {localPreview.description}
          </Caption>
        )}
        <View style={styles.domainRow}>
          <Ionicons name="link-outline" size={12} color={Colors.textMuted} />
          <Caption color={Colors.textMuted}>{localPreview.domain}</Caption>
        </View>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginTop: Space.xs + 2,
  },
  image: {
    width: '100%',
    height: 120,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
  },
  textWrap: {
    padding: Space.sm + 4,
    gap: 2,
  },
  domainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginTop: Space.xs,
  },
});