import React from 'react';
import type { PublicProfileUser, ReportReason } from '../../services/profileApi';
import type { SellerTrustSummary } from '../../platform/product';
import { ProfileMoreSheet, ProfileReportSheet, ProfileBlockConfirmSheet, ProfileRestrictConfirmSheet } from '../profile/ProfileSheets';
import { PublicProfileConnectionsSheet } from '../profile/PublicProfileConnectionsSheet';
import { SellerResponseComposer } from '../profile/SellerResponseComposer';
import { ReviewReportSheet } from '../profile/ReviewReportSheet';
import { SharePassportModal } from '../profile/SharePassportModal';
import type {
  UserProfileConnectionsSheetState,
  UserProfileResponseComposerState,
  UserProfileReviewReportState,
} from '../../hooks/userprofile';

interface UserProfileSheetsProps {
  // More-actions sheet
  moreSheetVisible: boolean;
  onDismissMoreSheet: () => void;
  isBlocked: boolean;
  isMuted: boolean;
  isRestricted: boolean;
  onShare: () => void;
  onCopyLink: () => void;
  onReport: () => void;
  onMute: () => void;
  onUnmute: () => void;
  onRestrict: () => void;
  onUnrestrict: () => void;
  onBlock: () => void;
  onUnblock: () => void;
  // Report-user sheet
  reportSheetVisible: boolean;
  onDismissReportSheet: () => void;
  reportPending: boolean;
  onSubmitReport: (reason: ReportReason, details?: string) => void;
  // Block confirmation sheet
  blockConfirmVisible: boolean;
  onDismissBlockConfirm: () => void;
  displayHandle: string;
  blockPending: boolean;
  onConfirmBlock: () => void;
  // Restrict confirmation sheet
  restrictConfirmVisible: boolean;
  onDismissRestrictConfirm: () => void;
  restrictPending: boolean;
  onConfirmRestrict: () => void;
  // Followers / following connections sheet
  connectionsSheet: UserProfileConnectionsSheetState;
  onDismissConnections: () => void;
  targetUserId: string | undefined;
  followerCount: number;
  followingCount: number;
  onOpenProfile: (userId: string) => void;
  // Seller response composer (review reply)
  responseComposer: UserProfileResponseComposerState;
  onCloseResponseComposer: () => void;
  onSubmitResponse: (reviewId: string, text: string) => Promise<void>;
  // Review report sheet
  reviewReportSheet: UserProfileReviewReportState;
  onDismissReviewReport: () => void;
  onReviewReportSubmitted: () => void;
  onReviewReportError: (message: string) => void;
  // Share passport modal
  targetProfile: PublicProfileUser | null;
  passportVisible: boolean;
  onClosePassport: () => void;
  displayAvatar?: string;
  sellerTrust?: SellerTrustSummary | null;
  memberSince?: string;
}

/**
 * Consolidated sheet/modal layer for the public profile — more actions,
 * report user, block confirm, connections, seller response composer,
 * review report, and the share passport modal.
 */
export function UserProfileSheets({
  moreSheetVisible,
  onDismissMoreSheet,
  isBlocked,
  isMuted,
  isRestricted,
  onShare,
  onCopyLink,
  onReport,
  onMute,
  onUnmute,
  onRestrict,
  onUnrestrict,
  onBlock,
  onUnblock,
  reportSheetVisible,
  onDismissReportSheet,
  reportPending,
  onSubmitReport,
  blockConfirmVisible,
  onDismissBlockConfirm,
  displayHandle,
  blockPending,
  onConfirmBlock,
  restrictConfirmVisible,
  onDismissRestrictConfirm,
  restrictPending,
  onConfirmRestrict,
  connectionsSheet,
  onDismissConnections,
  targetUserId,
  followerCount,
  followingCount,
  onOpenProfile,
  responseComposer,
  onCloseResponseComposer,
  onSubmitResponse,
  reviewReportSheet,
  onDismissReviewReport,
  onReviewReportSubmitted,
  onReviewReportError,
  targetProfile,
  passportVisible,
  onClosePassport,
  displayAvatar,
  sellerTrust,
  memberSince,
}: UserProfileSheetsProps) {
  return (
    <>
      <ProfileMoreSheet
        visible={moreSheetVisible}
        onDismiss={onDismissMoreSheet}
        isSelfProfile={false}
        isBlocked={isBlocked}
        isMuted={isMuted}
        isRestricted={isRestricted}
        displayHandle={displayHandle}
        onShare={onShare}
        onCopyLink={onCopyLink}
        onReport={onReport}
        onMute={onMute}
        onUnmute={onUnmute}
        onRestrict={onRestrict}
        onUnrestrict={onUnrestrict}
        onBlock={onBlock}
        onUnblock={onUnblock}
      />
      <ProfileReportSheet
        visible={reportSheetVisible}
        onDismiss={onDismissReportSheet}
        isPending={reportPending}
        onSubmit={onSubmitReport}
      />
      <ProfileBlockConfirmSheet
        visible={blockConfirmVisible}
        onDismiss={onDismissBlockConfirm}
        displayHandle={displayHandle}
        isPending={blockPending}
        onConfirm={onConfirmBlock}
      />
      <ProfileRestrictConfirmSheet
        visible={restrictConfirmVisible}
        onDismiss={onDismissRestrictConfirm}
        displayHandle={displayHandle}
        isPending={restrictPending}
        onConfirm={onConfirmRestrict}
      />
      <PublicProfileConnectionsSheet
        visible={connectionsSheet.visible}
        onDismiss={onDismissConnections}
        userId={targetUserId}
        initialSegment={connectionsSheet.segment}
        followerCount={followerCount}
        followingCount={followingCount}
        onOpenProfile={onOpenProfile}
      />
      <SellerResponseComposer
        visible={responseComposer.visible}
        reviewId={responseComposer.reviewId}
        reviewerName={responseComposer.reviewerName}
        rating={responseComposer.rating}
        onClose={onCloseResponseComposer}
        onSubmit={onSubmitResponse}
      />
      <ReviewReportSheet
        visible={reviewReportSheet.visible}
        reviewId={reviewReportSheet.reviewId}
        onDismiss={onDismissReviewReport}
        onSubmitted={onReviewReportSubmitted}
        onError={onReviewReportError}
      />

      {targetProfile ? (
        <SharePassportModal
          visible={passportVisible}
          onClose={onClosePassport}
          username={targetProfile.username}
          displayName={targetProfile.displayName || targetProfile.username}
          avatarUri={displayAvatar}
          ratingAverage={sellerTrust?.rating ?? null}
          completedSales={sellerTrust?.completedSales ?? 0}
          verificationTier={sellerTrust?.verificationTier ?? (sellerTrust?.verified ? 'seller' : null)}
          memberSince={memberSince}
          bio={targetProfile.bio ?? null}
        />
      ) : null}
    </>
  );
}
