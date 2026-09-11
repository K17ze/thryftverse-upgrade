import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, PressScale, Control } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { BottomSheet } from '../../BottomSheet';
import { FullscreenMediaViewer } from '../../product';
import { SaveToCollectionModal } from '../../closet/SaveToCollectionModal';
import { ShareSheet } from '../../ShareSheet';
import {
  CoOwnFirstTradeGuide,
  CoOwnRightsSheet,
  CoOwnRiskDisclosure,
  CoOwnSupplySheet,
  CoOwnOverflowSheet,
  CoOwnPriceAlertForm,
  type CoOwnRightsRow,
} from '..';
import { formatCoOwnIze } from '../../../utils/currency';
import type { MarketCoOwnAsset } from '../../../services/marketApi';

export interface AssetDetailModalsProps {
  asset: MarketCoOwnAsset;
  images: string[];
  fullscreenIndex: number;
  onActiveFullscreenIndexChange: (index: number) => void;
  fullscreenVisible: boolean;
  guideVisible: boolean;
  /** Full pending trade draft preserved through the education guide. */
  pendingTradeSide: { side: 'buy' | 'sell'; limitPrice?: number } | null;
  rightsSheetVisible: boolean;
  riskDisclosureVisible: boolean;
  supplySheetVisible: boolean;
  overflowVisible: boolean;
  priceAlertVisible: boolean;
  alertTargetPrice: string;
  alertCondition: 'above' | 'below';
  alertSubmitting: boolean;
  /** U52: Denomination currency code. */
  alertDenomination?: string;
  /** U52: Trigger basis for the price alert. */
  alertTriggerBasis?: 'last_trade' | 'reference';
  /** U52: Current observed price in GBP major units. */
  alertCurrentPriceGbp?: number | null;
  yourUnits: number | null;
  totalUnits: number;
  availableUnits: number;
  allocatedPct: number;
  viewerPct: number | null;
  feePct: number;
  rightsRows: CoOwnRightsRow[];
  isWatched: boolean;
  social: {
    collectionModalVisible: boolean;
    closeCollectionPicker: () => void;
    shareVisible: boolean;
    closeShare: () => void;
    isLiked: boolean;
    openShare: () => void;
  };
  onCloseSheet: (sheet: 'fullscreen' | 'guide' | 'rights' | 'riskDisclosure' | 'supply' | 'overflow') => void;
  onClearPendingTradeSide: () => void;
  onGuideComplete: () => void;
  onGuideContinueToTrade: () => void;
  onToggleFav: () => void;
  onToggleWatch: (assetId: string) => void;
  onClosePriceAlert: () => void;
  onAlertTargetPriceChange: (val: string) => void;
  onAlertConditionChange: (val: 'above' | 'below') => void;
  onCreatePriceAlert: () => void;
  onNavigateOrderHistory: () => void;
  onNavigatePriceAlerts: () => void;
  onNavigateIssue: () => void;
}

export const AssetDetailModals = React.memo(function AssetDetailModals({
  asset,
  images,
  fullscreenIndex,
  onActiveFullscreenIndexChange,
  fullscreenVisible,
  guideVisible,
  pendingTradeSide,
  rightsSheetVisible,
  riskDisclosureVisible,
  supplySheetVisible,
  overflowVisible,
  priceAlertVisible,
  alertTargetPrice,
  alertCondition,
  alertSubmitting,
  alertDenomination = 'GBP',
  alertTriggerBasis = 'last_trade',
  alertCurrentPriceGbp = null,
  yourUnits,
  totalUnits,
  availableUnits,
  allocatedPct,
  viewerPct,
  feePct,
  rightsRows,
  isWatched,
  social,
  onCloseSheet,
  onClearPendingTradeSide,
  onGuideComplete,
  onGuideContinueToTrade,
  onToggleFav,
  onToggleWatch,
  onClosePriceAlert,
  onAlertTargetPriceChange,
  onAlertConditionChange,
  onCreatePriceAlert,
  onNavigateOrderHistory,
  onNavigatePriceAlerts,
  onNavigateIssue,
}: AssetDetailModalsProps) {
  const { colors } = useAppTheme();

  return (
    <>
      {/* Save to collection + share */}
      <SaveToCollectionModal
        visible={social.collectionModalVisible}
        itemId={asset.id}
        onClose={social.closeCollectionPicker}
      />
      <ShareSheet
        visible={social.shareVisible}
        onDismiss={social.closeShare}
        url={`https://thryftverse.com/asset/${asset.id}`}
        title={asset.title}
      />

      {/* Fullscreen media viewer */}
      <FullscreenMediaViewer
        images={images}
        initialIndex={fullscreenIndex}
        visible={fullscreenVisible}
        onActiveIndexChange={onActiveFullscreenIndexChange}
        onClose={() => onCloseSheet('fullscreen')}
      />

      {/* First-trade guided education */}
      <CoOwnFirstTradeGuide
        visible={guideVisible}
        onClose={() => {
          onCloseSheet('guide');
          onClearPendingTradeSide();
        }}
        onComplete={onGuideComplete}
        onContinueToTrade={pendingTradeSide ? onGuideContinueToTrade : undefined}
      />

      {/* Rights & risks sheet — 13-row modal */}
      <CoOwnRightsSheet
        visible={rightsSheetVisible}
        onClose={() => onCloseSheet('rights')}
        disclosureVersion={
          asset.rights
            ? asset.rights.version
              ? `Rights v${asset.rights.version}`
              : 'Version not available'
            : 'Unpublished'
        }
        rights={rightsRows}
      />

      {/* Risk disclosure bottom sheet */}
      <BottomSheet
        visible={riskDisclosureVisible}
        onDismiss={() => onCloseSheet('riskDisclosure')}
        snapPoint={0.7}
      >
        <View style={[styles.riskDisclosureSheetHeader, { borderBottomColor: colors.borderSubtle }]}>
          <Text style={[styles.riskDisclosureSheetTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
            Risk disclosure
          </Text>
          <Pressable
            onPress={() => onCloseSheet('riskDisclosure')}
            hitSlop={12}
            style={({ pressed }) => [styles.sheetCloseTarget, pressed && { opacity: 0.85, transform: [{ scale: PressScale.gentle }] }]}
            accessibilityLabel="Close risk disclosure"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        <ScrollView style={styles.riskDisclosureSheetScroll} contentContainerStyle={styles.riskDisclosureSheetContent}>
          <CoOwnRiskDisclosure
            disclosures={asset.riskDisclosures ?? null}
            onReportIssue={() => {
              onCloseSheet('riskDisclosure');
              onNavigateIssue();
            }}
          />
        </ScrollView>
      </BottomSheet>

      {/* Supply and cap table sheet */}
      <CoOwnSupplySheet
        visible={supplySheetVisible}
        onClose={() => onCloseSheet('supply')}
        unitPriceLabel={formatCoOwnIze(asset.unitPriceGbp)}
        totalUnits={totalUnits}
        availableUnits={availableUnits}
        allocatedPct={allocatedPct}
        viewerUnits={yourUnits}
        viewerPct={viewerPct}
        settlementMode={asset.settlementMode}
        feePct={feePct}
        holderCount={asset.holders}
        status={asset.isOpen ? (availableUnits > 0 ? 'open' : 'closed') : 'paused'}
        supply={{
          authorised: null,
          issued: null,
          publicFloat: null,
          treasury: null,
        }}
        rightsVersion={asset.rights?.version ? `v${asset.rights.version}` : undefined}
      />

      {/* Overflow sheet — lower-frequency actions */}
      <CoOwnOverflowSheet
        visible={overflowVisible}
        onClose={() => onCloseSheet('overflow')}
        onShare={social.openShare}
        onOrderHistory={onNavigateOrderHistory}
        onToggleFav={onToggleFav}
        isFav={social.isLiked}
        onWatch={() => {
          onToggleWatch(asset.id);
          onCloseSheet('overflow');
        }}
        isWatched={isWatched}
        onPriceAlert={() => {
          onCloseSheet('overflow');
          onNavigatePriceAlerts();
        }}
        onReport={() => {
          onCloseSheet('overflow');
          onNavigateIssue();
        }}
      />

      {/* Price alert creation modal */}
      <CoOwnPriceAlertForm
        visible={priceAlertVisible}
        onClose={onClosePriceAlert}
        alertTargetPrice={alertTargetPrice}
        onAlertTargetPriceChange={onAlertTargetPriceChange}
        alertCondition={alertCondition}
        onAlertConditionChange={onAlertConditionChange}
        alertSubmitting={alertSubmitting}
        onSubmit={onCreatePriceAlert}
        denomination={alertDenomination}
        triggerBasis={alertTriggerBasis}
        currentPriceGbp={alertCurrentPriceGbp}
      />
    </>
  );
});

const styles = StyleSheet.create({
  riskDisclosureSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetCloseTarget: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riskDisclosureSheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
  },
  riskDisclosureSheetScroll: {
    flex: 1,
  },
  riskDisclosureSheetContent: {
    padding: Space.md,
  },
});
