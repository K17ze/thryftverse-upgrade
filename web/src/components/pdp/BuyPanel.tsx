'use client';

/**
 * BuyPanel — the sticky commerce column orchestrator.
 * Brand eyebrow → title → price hero with buyer-protection line →
 * seller card → CTA grammar (Buy now, Make an offer, Add to bag, Message) →
 * demand signal → quiet actions row → shipping + protection disclosure → bundle upsell.
 * Factored into domain components:
 * - useBuyPanelWorkflow: state, store hooks, auth gate, offer/alert mutations
 * - PdpPriceBlock: price, discounts, size guide trigger
 * - PdpSellerCard: seller avatar, rating, trust tier
 * - PdpActions: state-driven CTA buttons (Buy, Offer, Bag, Message, Withdraw)
 * - PdpShippingInfo: shipping rates, dispatch speed, return window, price alerts
 */

import dynamic from 'next/dynamic';
import type { Listing } from '@/lib/contracts/domain';
import { Icon } from '@/components/ui/Icon';
import { formatCount, timeAgo } from '@/lib/utils/format';
import { PdpPriceBlock } from './PdpPriceBlock';
import { PdpSellerCard } from './PdpSellerCard';
import { PdpActions } from './PdpActions';
import { PdpShippingInfo } from './PdpShippingInfo';
import { SizeGuideSheet } from './SizeGuideSheet';
import { BundleUpsellRow } from '@/components/bundle/BundleUpsellRow';
import { ListingReportMenu } from './ListingReportMenu';
import { SaveToBoardSheet } from '@/components/saved/SaveToBoardSheet';
import { useBuyPanelWorkflow } from './useBuyPanelWorkflow';

const OfferSheet = dynamic(
  () => import('./OfferSheet').then((m) => m.OfferSheet),
  { ssr: false },
);

interface BuyPanelProps {
  listing: Listing;
}

export function BuyPanel({ listing }: BuyPanelProps) {
  const workflow = useBuyPanelWorkflow(listing);
  const {
    show,
    wall,
    isSold,
    isOwner,
    seller,
    sellerBlocked,
    sellerTrust,
    sellerTrustPending,
    caps,
    effectiveStateCopy,
    activeOffer,
    withdrawOffer,
    isFav,
    inBag,
    signalLine,
    sizeGuide,
    sizeGuideOpen,
    setSizeGuideOpen,
    boardOpen,
    setBoardOpen,
    offerOpen,
    setOfferOpen,
    offerSending,
    showPriceAlert,
    priceAlertEnabled,
    priceAlertMutation,
    priceAlertQuery,
    handleTogglePriceAlert,
    handleHeart,
    handleSaveToBoard,
    handleAddToBag,
    handleBuyNow,
    handleMessage,
    handleShare,
    handleSendOffer,
    requireAuth,
  } = workflow;

  return (
    <div className="flex flex-col">
      <PdpPriceBlock
        listing={listing}
        isSold={isSold}
        hasSizeGuide={Boolean(sizeGuide)}
        onOpenSizeGuide={() => setSizeGuideOpen(true)}
      />

      <PdpSellerCard
        seller={seller}
        sellerTrust={sellerTrust}
        isOwner={isOwner}
        sellerBlocked={sellerBlocked}
      />

      <PdpActions
        listing={listing}
        isOwner={isOwner}
        isSold={isSold}
        sellerTrustPending={sellerTrustPending}
        effectiveStateCopy={effectiveStateCopy}
        canMessage={caps.canMessage}
        sellerBlocked={sellerBlocked}
        activeOffer={activeOffer}
        inBag={inBag}
        onBuyNow={handleBuyNow}
        onMakeOffer={() => {
          if (!requireAuth('purchase')) return;
          setOfferOpen(true);
        }}
        onAddToBag={handleAddToBag}
        onMessage={handleMessage}
        withdrawOffer={withdrawOffer}
        showToast={show}
      />

      {signalLine ? (
        <p className="tnum mt-2.5 text-caption text-text-secondary">{signalLine}</p>
      ) : null}

      {/* Quiet action row — Favourite affordance, count metrics, and overflow */}
      <div className="mt-3 flex items-center border-b border-border-subtle pb-4">
        <button
          type="button"
          onClick={handleHeart}
          aria-pressed={isFav}
          className="pressable -my-1 -ml-2 flex h-11 items-center gap-1.5 rounded-md px-2 text-caption font-medium text-text-secondary hover:text-text-primary"
        >
          <Icon name="heart" filled={isFav} size={16} className={isFav ? 'text-danger-text' : ''} />
          {isFav ? 'Favourited' : 'Favourite'}
        </button>
        <span className="ml-auto flex items-center gap-3 text-meta text-text-muted">
          {!signalLine ? (
            <>
              {typeof listing.views === 'number' ? (
                <span className="flex items-center gap-1">
                  <Icon name="eye" size={13} />
                  <span className="tnum">{formatCount(listing.views)}</span>
                </span>
              ) : null}
              {typeof listing.likes === 'number' ? (
                <span className="flex items-center gap-1">
                  <Icon name="heart" size={13} />
                  <span className="tnum">{formatCount(listing.likes)}</span>
                </span>
              ) : null}
            </>
          ) : null}
          {listing.createdAt ? <span>{timeAgo(listing.createdAt)}</span> : null}
        </span>
        {!isOwner ? (
          <ListingReportMenu
            listing={listing}
            className="-my-1 -mr-2"
            items={[
              {
                icon: 'bookmark',
                label: 'Save to board',
                onSelect: handleSaveToBoard,
              },
              {
                icon: 'share',
                label: 'Share',
                onSelect: () => void handleShare(),
              },
            ]}
          />
        ) : null}
      </div>

      {/* Delivery + protection + price-alert disclosure */}
      <PdpShippingInfo listing={listing} sellerLocation={seller?.location}>
        {showPriceAlert ? (
          <button
            type="button"
            role="switch"
            aria-checked={priceAlertEnabled}
            aria-busy={priceAlertMutation.isPending || priceAlertQuery.isPending}
            disabled={priceAlertMutation.isPending}
            onClick={handleTogglePriceAlert}
            className="pressable mt-2 flex w-full items-center gap-3 rounded-md py-1.5 text-left disabled:opacity-50"
          >
            <Icon
              name="notifications"
              filled={priceAlertEnabled}
              size={20}
              className={`shrink-0 ${priceAlertEnabled ? 'text-brand' : 'text-text-secondary'}`}
            />
            <span className="text-body font-medium text-text-primary">
              {priceAlertEnabled ? 'Price drop alerts on' : 'Notify me if the price drops'}
            </span>
            {priceAlertEnabled ? (
              <Icon name="check" size={16} className="ml-auto shrink-0 text-brand" />
            ) : null}
          </button>
        ) : null}
      </PdpShippingInfo>

      {sellerBlocked ? null : <BundleUpsellRow listing={listing} />}

      {wall}

      <OfferSheet
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        listing={listing}
        busy={offerSending}
        onSend={handleSendOffer}
      />

      <SizeGuideSheet
        open={sizeGuideOpen}
        onClose={() => setSizeGuideOpen(false)}
        guide={sizeGuide}
        currentSize={listing.size}
      />

      <SaveToBoardSheet
        open={boardOpen}
        onClose={() => setBoardOpen(false)}
        itemId={listing.id}
        itemLabel={listing.title}
      />
    </div>
  );
}
