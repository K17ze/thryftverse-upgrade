import React from 'react';
import { View, ScrollView } from 'react-native';
import { FlagshipScreen, FlagshipHeader } from '../flagship';
import { CoOwnStateCanvas } from '../coown';
import { SkeletonLoader } from '../SkeletonLoader';
import { Space, Radius } from '../../theme/designTokens';
import { t } from '../../i18n';
import { walletScreenStyles as styles } from './walletScreenStyles';

interface WalletScaffoldProps {
  onBack: () => void;
  children: React.ReactNode;
}

/** Shared scaffold for the non-populated wallet states — same screen
 *  chrome (header, no scroll) as the populated surface. */
function WalletScaffold({ onBack, children }: WalletScaffoldProps) {
  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title={t('commerce.wallet.title')}
          onBack={onBack}
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      {children}
    </FlagshipScreen>
  );
}

/** Loading state — skeleton matching the final layout. */
export function WalletLoadingScreen({ onBack }: { onBack: () => void }) {
  return (
    <WalletScaffold onBack={onBack}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Balance hero skeleton */}
        <SkeletonLoader width="35%" height={13} borderRadius={Radius.sm} />
        <View style={{ height: Space.sm }} />
        <SkeletonLoader width="60%" height={40} borderRadius={Radius.sm} />
        <View style={{ height: Space.xs }} />
        <SkeletonLoader width="40%" height={14} borderRadius={Radius.sm} />
        {/* Action buttons skeleton */}
        <View style={{ height: Space.lg }} />
        <View style={styles.actionRow}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.actionBtn}>
              <SkeletonLoader width="100%" height={44} borderRadius={Radius.md} />
            </View>
          ))}
        </View>
        {/* Sub-balance rows skeleton */}
        <View style={{ height: Space.lg }} />
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.skeletonSubRow}>
            <SkeletonLoader width="35%" height={14} borderRadius={Radius.sm} />
            <View style={{ flex: 1 }} />
            <SkeletonLoader width={70} height={16} borderRadius={Radius.sm} />
          </View>
        ))}
      </ScrollView>
    </WalletScaffold>
  );
}

/** Error state — full-canvas retry. */
export function WalletErrorScreen({ onBack, onRetry }: { onBack: () => void; onRetry: () => void }) {
  return (
    <WalletScaffold onBack={onBack}>
      <CoOwnStateCanvas
        variant="error"
        actionLabel={t('commerce.wallet.action.tryAgain')}
        onAction={onRetry}
      />
    </WalletScaffold>
  );
}

export interface WalletEmptyScreenProps {
  onBack: () => void;
  onAddMoney: () => void;
  /** The AddMoneySheet modal — rendered by the screen so its props stay
   *  wired to wallet state. */
  children?: React.ReactNode;
}

/** Empty state — no available or reserved balance. */
export function WalletEmptyScreen({ onBack, onAddMoney, children }: WalletEmptyScreenProps) {
  return (
    <WalletScaffold onBack={onBack}>
      <CoOwnStateCanvas
        variant="empty"
        title={t('commerce.wallet.noBalanceYet')}
        subtitle={t('commerce.wallet.addMoneyToStart')}
        actionLabel={t('commerce.wallet.addMoney')}
        onAction={onAddMoney}
        emptyGraphicVariant="bag"
      />
      {children}
    </WalletScaffold>
  );
}
