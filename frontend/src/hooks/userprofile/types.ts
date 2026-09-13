// Shared type vocabulary for the public user-profile surface.

export type UserProfileTab = 'Listings' | 'Looks' | 'About' | 'Reviews';
export type UserProfileShopSegment = 'forsale' | 'sold';
export type UserProfileConnectionsSegment = 'followers' | 'following';

export interface UserProfileConnectionsSheetState {
  visible: boolean;
  segment: UserProfileConnectionsSegment;
}

export interface UserProfileResponseComposerState {
  visible: boolean;
  reviewId: string;
  reviewerName?: string;
  rating?: number;
}

export interface UserProfileReviewReportState {
  visible: boolean;
  reviewId: string;
}
