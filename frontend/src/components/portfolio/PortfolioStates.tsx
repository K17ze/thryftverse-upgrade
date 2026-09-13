import React from 'react';
import { FlagshipScreen } from '../flagship';
import {
  CoOwnPortfolioSkeleton,
  CoOwnStateCanvas,
} from '../coown';
import { PortfolioHeader } from './PortfolioHeader';

interface PortfolioScaffoldProps {
  onBack: () => void;
  onOpenActivity: () => void;
  children: React.ReactNode;
}

/** Shared scaffold for the non-populated portfolio states — same screen
 *  chrome (header, no scroll, no padding) as the populated surface. */
function PortfolioScaffold({ onBack, onOpenActivity, children }: PortfolioScaffoldProps) {
  return (
    <FlagshipScreen
      header={<PortfolioHeader onBack={onBack} onOpenActivity={onOpenActivity} />}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      {children}
    </FlagshipScreen>
  );
}

export interface PortfolioStateScreenProps {
  onBack: () => void;
  onOpenActivity: () => void;
}

export function PortfolioLoadingScreen(props: PortfolioStateScreenProps) {
  return (
    <PortfolioScaffold {...props}>
      <CoOwnPortfolioSkeleton />
    </PortfolioScaffold>
  );
}

export interface PortfolioRetryScreenProps extends PortfolioStateScreenProps {
  onRetry: () => void;
}

export function PortfolioErrorScreen({ onRetry, ...props }: PortfolioRetryScreenProps) {
  return (
    <PortfolioScaffold {...props}>
      <CoOwnStateCanvas
        variant="error"
        title="Portfolio unavailable"
        subtitle="We couldn't load your holdings. Tap below to try again."
        actionLabel="Try again"
        onAction={onRetry}
      />
    </PortfolioScaffold>
  );
}

/**
 * Partial-failure state — holdings were fetched but every asset-detail
 * fetch failed. The user owns something, but we can't value or display
 * it. This is materially different from owning nothing — show a retry,
 * not an empty state.
 */
export function PortfolioPartialErrorScreen({ onRetry, ...props }: PortfolioRetryScreenProps) {
  return (
    <PortfolioScaffold {...props}>
      <CoOwnStateCanvas
        variant="error"
        title="Portfolio unavailable"
        subtitle="We fetched your holdings but couldn't load the asset details. Tap below to try again."
        actionLabel="Try again"
        onAction={onRetry}
      />
    </PortfolioScaffold>
  );
}

export interface PortfolioEmptyScreenProps extends PortfolioStateScreenProps {
  onBrowse: () => void;
}

export function PortfolioEmptyScreen({ onBrowse, ...props }: PortfolioEmptyScreenProps) {
  return (
    <PortfolioScaffold {...props}>
      <CoOwnStateCanvas
        variant="empty"
        title="No positions yet"
        subtitle="Buy units to start."
        actionLabel="Browse items"
        onAction={onBrowse}
        emptyGraphicVariant="bag"
      />
    </PortfolioScaffold>
  );
}
