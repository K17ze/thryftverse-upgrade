import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Space, Control } from '../../../theme/designTokens';
import { EmptyState } from '../../EmptyState';
import { CachedImage } from '../../CachedImage';
import { AppIcon } from '../../common/AppIcon';
import { IconSize } from '../../../theme/iconTokens';
import type { SellerAnalyticsModel } from './useSellerAnalytics';

export function AnalyticsListings({ model }: { model: SellerAnalyticsModel }) {
 const { styles, colors, topPerformers, handleListingSelect, formatFromFiat, needsAttention, navigation } = model;
 return (<>
            {/* ── Top Performing Pieces ── */}
            <View style={{ marginTop: Space.xl }}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Top performing pieces</Text>
                <Text style={[styles.sectionSubtitleMuted, { color: colors.textMuted }]}>
                  Last {model.periodLabel}
                </Text>
              </View>

              {topPerformers.length > 0 ? (
                <View>
                  {topPerformers.map((item, idx) => (
                    <Pressable
                      key={item.id}
                      style={({ pressed }) => [
                        styles.topListingRow,
                        { borderBottomColor: colors.border, minHeight: Control.hit },
                        pressed && { opacity: 0.6 },
                      ]}
                      onPress={() => handleListingSelect(item.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`View analytics for ${item.title}`}
                      accessibilityHint="Opens detailed analytics for this piece"
                    >
                      <View style={styles.topListingRankBadge}>
                        <Text style={[styles.topListingRankText, { color: colors.textMuted }]}>
                          {String(idx + 1).padStart(2, '0')}
                        </Text>
                      </View>

                      <View style={[styles.topListingThumb, { backgroundColor: colors.surfaceAlt }]}>
                        {item.imageUrl ? (
                          <CachedImage uri={item.imageUrl} style={styles.topListingThumbImage} contentFit="cover" />
                        ) : (
                          <View style={styles.topListingThumbPlaceholder} />
                        )}
                      </View>

                      <View style={styles.topListingInfo}>
                        <Text style={[styles.topListingRowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={[styles.topListingRowMeta, { color: colors.textMuted }]}>
                          {item.views} views{item.likes > 0 ? ` · ${item.likes} saves` : ''}
                        </Text>
                      </View>

                      <View style={styles.topListingRight}>
                        <Text style={[styles.topListingRowPrice, { color: colors.brand }]}>
                          {formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}
                        </Text>
                        <AppIcon concept="forward" size={IconSize.xs} color="textMuted" opticalCenter accessible={false} />
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <EmptyState
                  icon="analytics"
                  title="No views recorded yet"
                  subtitle="Pieces with customer traffic and wishlist saves will rank here."
                />
              )}
            </View>

            {/* ── Needs Attention ── */}
            {needsAttention.length > 0 ? (
              <View style={{ marginTop: Space.xl }}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Velocity opportunities</Text>
                  <Text style={[styles.sectionSubtitleMuted, { color: colors.textMuted }]}>
                    {needsAttention.reduce((sum, i) => sum + i.offers, 0)} offers
                  </Text>
                </View>

                <View>
                  {needsAttention.map((item) => (
                    <View
                      key={item.id}
                      style={[styles.attentionRow, { borderBottomColor: colors.border }]}
                    >
                      <Pressable
                        style={styles.attentionContentPressable}
                        onPress={() => handleListingSelect(item.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`View analytics for ${item.title}`}
                      >
                        <View style={[styles.attentionImageWrap, { backgroundColor: colors.surfaceAlt }]}>
                          {item.imageUrl ? (
                            <CachedImage uri={item.imageUrl} style={styles.attentionImage} contentFit="cover" />
                          ) : (
                            <View style={styles.attentionImagePlaceholder} />
                          )}
                        </View>

                        <View style={styles.attentionInfo}>
                          <Text style={[styles.attentionTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={[styles.attentionIssue, { color: colors.warning }]}>
                            {item.views} views · {item.likes} saves
                          </Text>
                        </View>
                      </Pressable>

                      <Pressable
                        style={({ pressed }) => [
                          styles.adjustPriceButton,
                          { borderColor: colors.border, minHeight: Control.hit },
                          pressed && { opacity: 0.6 },
                        ]}
                        onPress={() => navigation.navigate('EditListing', { itemId: item.id, focus: 'price' })}
                        accessibilityRole="button"
                        accessibilityLabel={`Adjust price for ${item.title}`}
                      >
                        <Text style={[styles.adjustPriceButtonText, { color: colors.brand }]}>Adjust</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}


 </>);
}
