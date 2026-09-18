/**
 * LiveSellerSetupPhase — the broadcaster setup surface: local camera
 * framing preview, stream title field, and the ordered lot selection over
 * the seller's real active listings, with the go-live footer.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/ThemeContext';
import { useConnectivity } from '../../hooks/useConnectivity';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { Space, Radius } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { OfflineBanner } from '../OfflineBanner';
import {
  FlagshipScreen,
  FlagshipHeader,
  FlagshipState,
  SkeletonBlock,
  SkeletonTextLine } from '../flagship';
import { BroadcastPreview } from '../live/BroadcastPreview';
import type { ListingApiItem } from '../../services/listingsApi';
import { useSellerStyles } from './liveSellerStyles';

// ── Schedule presets ────────────────────────────────────────────────────────
// No datetime-picker dependency exists in the app, so scheduling offers a
// restrained preset list instead of a hand-rolled calendar. Each preset
// carries a resolved future ISO timestamp and a label + absolute time meta.

interface SchedulePreset {
  key: string;
  label: string;
  meta: string;
  iso: string;
}

function formatPresetMeta(at: Date): string {
  const now = new Date();
  const time = at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const sameDay = at.toDateString() === now.toDateString();
  if (sameDay) return time;
  const day = at.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} · ${time}`;
}

function buildSchedulePresets(): SchedulePreset[] {
  const now = Date.now();
  const presets: { key: string; label: string; at: Date }[] = [
    { key: 'in1h', label: 'In 1 hour', at: new Date(now + 60 * 60_000) },
    { key: 'in3h', label: 'In 3 hours', at: new Date(now + 3 * 60 * 60_000) },
  ];
  // "Tonight" = today 20:00 local — once that's less than ~30 min away it
  // stops being a useful preset and rolls to tomorrow evening.
  const tonight = new Date();
  tonight.setHours(20, 0, 0, 0);
  const tomorrowEve = new Date();
  tomorrowEve.setDate(tomorrowEve.getDate() + 1);
  tomorrowEve.setHours(19, 0, 0, 0);
  if (tonight.getTime() - now > 30 * 60_000) {
    presets.push({ key: 'tonight', label: 'Tonight', at: tonight });
    presets.push({ key: 'tomorrow', label: 'Tomorrow evening', at: tomorrowEve });
  } else {
    presets.push({ key: 'tomorrow', label: 'Tomorrow evening', at: tomorrowEve });
  }
  return presets.map((p) => ({ key: p.key, label: p.label, meta: formatPresetMeta(p.at), iso: p.at.toISOString() }));
}

function formatConfirmedLabel(iso: string): string {
  const at = new Date(iso);
  const day = at.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  const time = at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${day} at ${time}`;
}

interface LiveSellerSetupPhaseProps {
  title: string;
  onTitleChange: (text: string) => void;
  listings: ListingApiItem[] | null;
  listingsLoading: boolean;
  listingsError: string | null;
  selectedIds: string[];
  onToggleListing: (listingId: string) => void;
  onRetryListings: () => void;
  onCreateListing: () => void;
  onGoLive: () => void;
  goingLive: boolean;
  /**
   * Schedule path — creates the session with scheduledStartAt and returns
   * true on success. Optional: when the host screen does not provide it the
   * start-time picker is hidden and only "Go live" is offered.
   */
  onScheduleShow?: (scheduledStartAt: string) => Promise<boolean>;
  scheduling?: boolean;
  setupError: string | null;
  onBack: () => void;
}

function ScheduleChoiceRow({
  label,
  meta,
  selected,
  onPress,
}: {
  label: string;
  meta?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useSellerStyles();
  return (
    <AnimatedPressable
      onPress={onPress}
      style={[styles.lotSelectRow, { borderBottomColor: colors.border }]}
      hapticFeedback="selection"
      scaleValue={0.99}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}${meta ? `, ${meta}` : ''}`}
    >
      <View style={styles.lotSelectInfo}>
        <Text style={[styles.lotSelectTitle, { color: colors.textPrimary }]}>{label}</Text>
        {meta ? (
          <Text style={[styles.lotSelectPrice, { color: colors.textSecondary }]}>{meta}</Text>
        ) : null}
      </View>
      {selected ? (
        <View style={[styles.lotOrderMark, { borderColor: colors.brand }]}>
          <AppIcon name="checkmark" size={IconSize.xs} color="brand" accessible={false} />
        </View>
      ) : (
        <View style={[styles.lotOrderMark, { borderColor: colors.border }]} />
      )}
    </AnimatedPressable>
  );
}

export function LiveSellerSetupPhase({
  title,
  onTitleChange,
  listings,
  listingsLoading,
  listingsError,
  selectedIds,
  onToggleListing,
  onRetryListings,
  onCreateListing,
  onGoLive,
  goingLive,
  onScheduleShow,
  scheduling = false,
  setupError,
  onBack }: LiveSellerSetupPhaseProps) {
  const { colors } = useAppTheme();
  const { isOffline } = useConnectivity();
  const { currencySymbol, formatFromFiat } = useFormattedPrice();
  const insets = useSafeAreaInsets();
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  const styles = useSellerStyles();

  // null = "Now" (go live immediately); an ISO string = a scheduled show.
  const [scheduledIso, setScheduledIso] = useState<string | null>(null);
  // Set once the schedule request succeeded — swaps the surface to the
  // confirmation state until the seller dismisses it.
  const [confirmedIso, setConfirmedIso] = useState<string | null>(null);
  const schedulePresets = useMemo(buildSchedulePresets, []);

  const showListingsLoading = listingsLoading && listings == null;
  const showListingsError = !listingsLoading && listingsError != null;
  const showListingsEmpty = !listingsLoading && !listingsError && listings != null && listings.length === 0;

  const isScheduleMode = scheduledIso != null && onScheduleShow != null;
  const actionPending = goingLive || scheduling;
  const actionDisabled = selectedIds.length === 0 || actionPending || isOffline;

  const handlePrimaryAction = () => {
    if (isScheduleMode && scheduledIso) {
      void onScheduleShow(scheduledIso)
        .then((ok) => {
          if (ok) setConfirmedIso(scheduledIso);
        })
        .catch(() => {
          // Errors are surfaced via setupError in the footer.
        });
      return;
    }
    onGoLive();
  };

  // ── Scheduled confirmation ──
  if (confirmedIso) {
    return (
      <FlagshipScreen
        testID="live-seller-scheduled"
        header={<FlagshipHeader title="Go live" onBack={onBack} />}
        scrollEnabled={false}
        contentStyle={styles.flushContent}
      >
        <FlagshipState
          variant="empty"
          icon="checkmark-circle-outline"
          title="Show scheduled"
          subtitle={`${formatConfirmedLabel(confirmedIso)} — your show will appear in Coming up.`}
          actionLabel="Done"
          onAction={onBack}
        />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      testID="live-seller-setup"
      header={
        <FlagshipHeader
          title="Go live"
          onBack={onBack}
        />
      }
      scrollEnabled={false}
      contentStyle={styles.flushContent}
      stickyFooter={
        <View style={[styles.footer, { paddingBottom: insets.bottom || Space.sm }]}>
          {setupError ? (
            <Text style={[styles.footerError, { color: colors.dangerText }]}>{setupError}</Text>
          ) : null}
          <AnimatedPressable
            onPress={handlePrimaryAction}
            disabled={actionDisabled}
            style={[
              styles.goLiveBtn,
              { backgroundColor: isScheduleMode ? colors.brand : colors.danger },
              actionDisabled && { opacity: 0.45 },
            ]}
            hapticFeedback="medium"
            accessibilityRole="button"
            accessibilityLabel={isScheduleMode ? 'Schedule show' : 'Go live'}
            accessibilityState={{ disabled: actionDisabled, busy: actionPending }}
          >
            {actionPending ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Text style={[styles.goLiveBtnText, { color: colors.textInverse }]}>
                {isScheduleMode ? 'Schedule show' : 'Go live'}
              </Text>
            )}
          </AnimatedPressable>
        </View>
      }
    >
      <OfflineBanner onRetry={onRetryListings} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.setupScroll}
      >
        {/* Local camera preview — honest label, real device feed */}
        <BroadcastPreview
          active
          facing="back"
          height={Math.round(SCREEN_HEIGHT * 0.32)}
          accessibilityLabel="Local camera preview"
        />
        <Text style={[styles.previewCaption, { color: colors.textMuted }]}>
          Camera preview — check framing before you go live
        </Text>

        {/* Stream title */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Stream title</Text>
          <TextInput
            style={[styles.titleInput, { color: colors.textPrimary, borderBottomColor: colors.border }]}
            placeholder="e.g. Vintage finds live auction"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={onTitleChange}
            maxLength={60}
            accessibilityLabel="Stream title"
          />
        </View>

        {/* Start time — only when the host screen wires the schedule path */}
        {onScheduleShow ? (
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Start time</Text>
            <View>
              <ScheduleChoiceRow
                label="Now"
                meta="Go live immediately"
                selected={scheduledIso == null}
                onPress={() => setScheduledIso(null)}
              />
              {schedulePresets.map((preset) => (
                <ScheduleChoiceRow
                  key={preset.key}
                  label={preset.label}
                  meta={preset.meta}
                  selected={scheduledIso === preset.iso}
                  onPress={() => setScheduledIso(preset.iso)}
                />
              ))}
            </View>
            {scheduledIso ? (
              <Text style={[styles.previewCaption, { color: colors.textMuted, textAlign: 'left' }]}>
                Scheduled shows appear in Coming up and followers get notified when you go live.
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Lot selection — real active listings */}
        <View style={styles.fieldGroup}>
          <View style={styles.lotHeaderRow}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              Lots{selectedIds.length > 0 ? ` · ${selectedIds.length} selected` : ''}
            </Text>
          </View>

          {showListingsLoading && (
            <View>
              {Array.from({ length: 4 }).map((_, i) => (
                <View key={`lot-skel-${i}`} style={[styles.lotSelectRow, { borderBottomColor: colors.border }]}>
                  <SkeletonBlock width={48} height={48} radius={Radius.md} />
                  <View style={styles.lotSelectInfo}>
                    <SkeletonTextLine width="65%" height={14} />
                    <SkeletonTextLine width="30%" height={12} />
                  </View>
                </View>
              ))}
            </View>
          )}

          {showListingsError && (
            <FlagshipState
              variant={isOffline ? 'offline' : 'error'}
              title="Listings unavailable"
              subtitle={listingsError ?? undefined}
              actionLabel="Try again"
              onAction={onRetryListings}
            />
          )}

          {showListingsEmpty && (
            <FlagshipState
              variant="empty"
              icon="pricetag-outline"
              title="No active listings"
              subtitle="List an item first — only your active listings can be sold live."
              actionLabel="Create a listing"
              onAction={onCreateListing}
            />
          )}

          {listings != null && listings.length > 0 && (
            <View>
              {listings.map((listing) => {
                const selected = selectedIds.includes(listing.id);
                const order = selectedIds.indexOf(listing.id);
                return (
                  <AnimatedPressable
                    key={listing.id}
                    onPress={() => onToggleListing(listing.id)}
                    style={[styles.lotSelectRow, { borderBottomColor: colors.border }]}
                    hapticFeedback="selection"
                    scaleValue={0.99}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${listing.title}, ${currencySymbol}${listing.priceGbp}`}
                  >
                    {listing.imageUrl || listing.images?.[0] ? (
                      <CachedImage
                        uri={listing.imageUrl ?? listing.images[0]}
                        style={styles.lotSelectThumb}
                        contentFit="cover"
                        accessible={false}
                      />
                    ) : (
                      <View style={[styles.lotSelectThumb, styles.lotSelectThumbFallback, { backgroundColor: colors.surfaceAlt }]}>
                        <AppIcon name="image" size={IconSize.sm} color="textMuted" accessible={false} />
                      </View>
                    )}
                    <View style={styles.lotSelectInfo}>
                      <Text style={[styles.lotSelectTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {listing.title}
                      </Text>
                      <Text style={[styles.lotSelectPrice, { color: colors.textSecondary }]}>
                        {formatFromFiat(listing.priceGbp, 'GBP')}
                      </Text>
                    </View>
                    {selected ? (
                      <View style={[styles.lotOrderMark, { borderColor: colors.brand }]}>
                        <Text style={[styles.lotOrderText, { color: colors.brand }]}>{order + 1}</Text>
                      </View>
                    ) : (
                      <View style={[styles.lotOrderMark, { borderColor: colors.border }]} />
                    )}
                  </AnimatedPressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </FlagshipScreen>
  );
}
