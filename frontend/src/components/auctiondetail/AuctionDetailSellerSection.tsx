import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, FontFamily, PressScale } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { CommerceDetailSellerRow } from '../commerce/detail';
import { RootStackParamList } from '../../navigation/types';
import { openProfile } from '../../navigation/openProfile';
import { useToast } from '../../context/ToastContext';
import { useSignupWall } from '../../hooks/useSignupWall';
import { useStore } from '../../store/useStore';
import { createDmConversationOnApi } from '../../services/chatApi';
import { useSellerTrust, useSellerFollow } from '../../platform/product';
import type { AuctionDetail } from '../../services/marketApi';

type NavT = NativeStackNavigationProp<RootStackParamList>;

interface Props {
  auction: AuctionDetail;
  isSeller: boolean;
  isLive: boolean;
  isUpcoming: boolean;
  isCancelLoading: boolean;
  onCancelAuction: () => void;
}

/**
 * Seller identity extension + seller cancel action.
 *
 * The rich seller row near identity is the primary seller presentation —
 * avatar, name, verification, stats, location, Follow and Message
 * actions. Tapping the row navigates to the full profile.
 *
 * The cancel action is restrained: a muted text link in a secondary
 * position, not a prominent CTA. Only shown to the seller when the
 * auction is still live or upcoming (cancellable states). Destructive
 * intent is signalled by the text, not by a red button.
 */
export function AuctionDetailSellerSection({
  auction,
  isSeller,
  isLive,
  isUpcoming,
  isCancelLoading,
  onCancelAuction,
}: Props) {
  const { colors } = useAppTheme();
  const navigation = useNavigation<NavT>();
  const { show } = useToast();
  const { requireAuth } = useSignupWall();
  const currentUser = useStore((state) => state.currentUser);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const [isResolvingConversation, setIsResolvingConversation] = React.useState(false);
  const { data: sellerTrustData } = useSellerTrust(auction.seller.id);
  const sellerFollowMutation = useSellerFollow(auction.seller.id);

  return (
    <>
      <View style={[styles.identityExtension, { borderTopColor: colors.borderSubtle }]}>
        <CommerceDetailSellerRow
          variant="rich"
          avatarUri={sellerTrustData?.avatar ?? auction.seller.avatarUrl ?? undefined}
          name={auction.seller.displayName ?? auction.seller.username}
          verified={sellerTrustData?.verified}
          ratingLine={
            sellerTrustData?.rating != null
              ? `${sellerTrustData.rating.toFixed(1)}${sellerTrustData?.reviewCount != null ? ` · ${sellerTrustData.reviewCount} reviews` : ''}`
              : undefined
          }
          statsLine={
            sellerTrustData
              ? [
                  sellerTrustData.completedSales != null ? `${sellerTrustData.completedSales} sales` : null,
                  sellerTrustData.responseRate != null ? `${sellerTrustData.responseRate}% response` : null,
                ].filter(Boolean).join(' · ') || undefined
              : undefined
          }
          locationLine={sellerTrustData?.location ?? undefined}
          onPress={() => openProfile(navigation, auction.seller.id, currentUser?.id)}
          primaryAction={
            !isSeller
              ? {
                  label: isResolvingConversation ? 'Starting…' : 'Message',
                  onPress: async () => {
                    if (!requireAuth('message_seller')) return;
                    if (isResolvingConversation) return;
                    setIsResolvingConversation(true);
                    try {
                      const conversation = await createDmConversationOnApi({
                        recipientUserId: auction.seller.id,
                      });
                      upsertConversation(conversation);
                      navigation.navigate('Chat', {
                        conversationId: conversation.id,
                        partnerUserId: auction.seller.id,
                      });
                    } catch {
                      show('Could not start conversation. Try again.', 'error');
                    } finally {
                      setIsResolvingConversation(false);
                    }
                  },
                }
              : undefined
          }
          secondaryAction={
            !isSeller
              ? {
                  label: sellerFollowMutation.isPending ? 'Following…' : (sellerTrustData?.isFollowing ? 'Following' : 'Follow'),
                  onPress: () => {
                    if (!requireAuth('follow_seller')) return;
                    sellerFollowMutation.mutate(undefined, {
                      onSuccess: (data) => {
                        show(data.isFollowing ? 'Followed seller' : 'Unfollowed seller', 'success');
                      },
                      onError: () => {
                        show('Could not follow seller. Try again.', 'error');
                      },
                    });
                  },
                }
              : undefined
          }
        />
      </View>

      {isSeller && (isLive || isUpcoming) && (
        <View style={styles.sellerCancelRow}>
          <Pressable
            onPress={onCancelAuction}
            disabled={isCancelLoading}
            accessibilityRole="button"
            accessibilityLabel="Cancel this auction"
            style={({ pressed }) => pressed && { opacity: 0.85, transform: [{ scale: PressScale.gentle }] }}
          >
            <Text style={[styles.sellerCancelText, { color: colors.textMuted }]}>
              {isCancelLoading ? 'Cancelling…' : 'Cancel auction'}
            </Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // ── Seller identity extension ──
  // Tight rhythm: the seller row follows the transaction surface
  // or terminal result. paddingVertical Space.sm + xs (12px) keeps
  // the seller row connected to the content above without excessive
  // white space, while the hairline border provides visual separation.
  identityExtension: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + Space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent', // overridden inline with theme color
  },
  // ── Seller cancel action ──
  // Restrained: a muted text link centered in a secondary position.
  // Not a prominent CTA — destructive intent is communicated by the
  // text itself, not by a red button or card container.
  sellerCancelRow: {
    alignItems: 'center',
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
  },
  sellerCancelText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
  },
});
