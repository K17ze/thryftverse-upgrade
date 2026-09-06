import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Control } from '../../../theme/designTokens';
import { CachedImage } from '../../CachedImage';
import { AppIcon } from '../../common/AppIcon';
import { IconSize } from '../../../theme/iconTokens';
import type { SellerAnalyticsModel } from './useSellerAnalytics';

export function AnalyticsListingScope({ model }: { model: SellerAnalyticsModel }) {
 const { styles, colors, listings, selectedListingId, handleListingSelect } = model;
 return (<>
            {/* ── Product Scope Horizontal Rail ── */}
            <View style={styles.productRailWrap}>
              <Text style={[styles.productRailHeader, { color: colors.textMuted }]}>
                Inspect individual piece analytics
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productRail}>
                <Pressable
                    style={({ pressed }) => [
                      styles.productChip,
                      !selectedListingId && styles.productChipActive,
                      { borderColor: !selectedListingId ? colors.textPrimary : colors.border, minHeight: Control.hit },
                      pressed && { opacity: 0.6 },
                    ]}
                  onPress={() => handleListingSelect(null)}
                  accessibilityRole="button"
                  accessibilityLabel="All store overview"
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                    <AppIcon
                      concept="dashboard"
                      size={IconSize.xs}
                      color={!selectedListingId ? 'textPrimary' : 'textSecondary'}
                      opticalCenter
                      accessible={false}
                    />
                  <Text
                    style={[
                      styles.productChipText,
                      { color: !selectedListingId ? colors.textPrimary : colors.textSecondary },
                      !selectedListingId && styles.productChipTextActive,
                    ]}
                  >
                    All ({listings.length})
                  </Text>
                </Pressable>

                {listings.map((item) => {
                  const isSelected = selectedListingId === item.id;
                  const imgUri = item.imageUrl ?? item.images?.[0];
                  return (
                    <Pressable
                      key={item.id}
                      style={({ pressed }) => [
                        styles.productChip,
                        isSelected && styles.productChipActive,
                        { borderColor: isSelected ? colors.brand : colors.border, minHeight: Control.hit },
                        pressed && { opacity: 0.6 },
                      ]}
                      onPress={() => handleListingSelect(isSelected ? null : item.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Filter analytics for ${item.title}`}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    >
                      {imgUri ? (
                        <CachedImage uri={imgUri} style={styles.productChipThumb} contentFit="cover" />
                      ) : (
                        <View style={[styles.productChipThumb, { backgroundColor: colors.surfaceAlt }]} />
                      )}
                      <Text
                        style={[
                          styles.productChipText,
                          { color: isSelected ? colors.textPrimary : colors.textSecondary },
                          isSelected && styles.productChipTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
 </>);
}
