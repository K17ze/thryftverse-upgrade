import type { AppIconName } from '@/components/ui/Icon';
import type { OrderActionItem } from '@/components/orders/OrderActionsSheet';
import type { IssueCategory } from '@/components/orders/IssueReportSheet';
import {
  isCancelledStatus,
  type OrderAction,
  type OrderExperience,
} from '@/components/orders/orderCapabilities';
import type { CounterpartyView } from '@/components/orders/OrderCounterpartyCard';
import type { User, CommerceOrder } from '@/lib/contracts/domain';
import type { SellerSummary } from '@/lib/api/services/users';

export const ACTION_LABEL: Record<OrderAction, string> = {
  pay: 'Pay now',
  dispatch: 'Mark as dispatched',
  propose_extension: 'Propose dispatch extension',
  respond_extension: 'Respond to extension',
  confirm_delivery: 'Confirm receipt',
  cancel: 'Cancel order',
  report_issue: 'Report a problem',
  view_resolution: 'View return request',
  leave_review: 'Leave a review',
  view_review: 'Reviewed — thanks',
  view_receipt: 'View receipt',
  track_order: 'Track parcel',
  inspect: 'Check your item',
  contact: 'Message',
};

export const ACTION_ICON: Partial<Record<OrderAction, AppIconName>> = {
  confirm_delivery: 'check',
  cancel: 'closeCircle',
  report_issue: 'flag',
  view_resolution: 'shield',
  leave_review: 'star',
  view_review: 'star',
  view_receipt: 'receipt',
  track_order: 'box',
  contact: 'chat',
  pay: 'card',
  dispatch: 'send',
};

export function toCounterparty(
  source: User | SellerSummary | null | undefined,
): CounterpartyView | null {
  if (!source) return null;
  if ('isVerified' in source) {
    return {
      id: source.id,
      username: source.username,
      avatar: source.avatar,
      isVerified: source.isVerified,
      rating: source.rating,
    };
  }
  return {
    id: source.id,
    username: source.username,
    avatar: source.avatar,
    isVerified: source.verified,
    rating: source.rating,
  };
}

export function buildContextualIssues(key: string): IssueCategory[] {
  if (key === 'delivery failed') {
    return [
      {
        id: 'delivery_failed',
        label: 'Delivery failed',
        description: 'The carrier could not deliver your parcel',
      },
    ];
  }
  if (key === 'returned') {
    return [
      {
        id: 'returned',
        label: 'Parcel returned',
        description: 'Your parcel was sent back to the seller',
      },
    ];
  }
  return [];
}

export interface BuildOrderSheetActionsParams {
  caps: OrderExperience['capabilities'];
  isBuyer: boolean;
  key: string;
  order: CommerceOrder | null | undefined;
  returnCase: unknown;
  handleAction: (action: OrderAction) => void;
  setReturnOpen: (open: boolean) => void;
  setProtectionOpen: (open: boolean) => void;
  navigateToItem: (listingId: string) => void;
}

export function buildOrderSheetActions({
  caps,
  isBuyer,
  key,
  order,
  returnCase,
  handleAction,
  setReturnOpen,
  setProtectionOpen,
  navigateToItem,
}: BuildOrderSheetActionsParams): OrderActionItem[] {
  return [
    ...(caps.secondaryActions as OrderAction[]).map((a: OrderAction) => ({
      key: a,
      label:
        a === 'contact'
          ? isBuyer
            ? 'Message seller'
            : 'Message buyer'
          : ACTION_LABEL[a],
      icon: ACTION_ICON[a] ?? 'forward',
      variant: (a === 'cancel'
        ? 'destructive'
        : a === 'confirm_delivery'
          ? 'primary'
          : 'default') as 'default' | 'primary' | 'destructive',
      onPress: () => handleAction(a),
    })),
    ...(isBuyer && (key === 'delivered' || key === 'completed') && !returnCase
      ? [
          {
            key: 'request_return',
            label: 'Request a return',
            icon: 'repeat' as const,
            variant: 'default' as const,
            onPress: () => setReturnOpen(true),
          },
        ]
      : []),
    ...(isBuyer && key !== 'created' && !isCancelledStatus(order?.status ?? '')
      ? [
          {
            key: 'buyer_protection',
            label: 'Buyer protection',
            icon: 'shield' as const,
            variant: 'default' as const,
            onPress: () => setProtectionOpen(true),
          },
        ]
      : []),
    ...(!isBuyer && order?.shippingLabelUrl
      ? [
          {
            key: 'shipping_label',
            label: 'Shipping label',
            icon: 'document' as const,
            variant: 'default' as const,
            onPress: () =>
              window.open(order.shippingLabelUrl!, '_blank', 'noopener,noreferrer'),
          },
        ]
      : []),
    {
      key: 'view_listing',
      label: 'View listing',
      icon: 'tag',
      variant: 'default',
      onPress: () => {
        if (order?.listingId) {
          navigateToItem(order.listingId);
        }
      },
    },
  ];
}
