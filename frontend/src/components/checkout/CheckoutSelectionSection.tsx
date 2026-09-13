import React from 'react';
import { View } from 'react-native';
import { CheckoutItemSummary } from './CheckoutItemSummary';
import { CheckoutSelectionRow } from './CheckoutSelectionRow';
import { CheckoutOnezeOption } from './CheckoutOnezeOption';
import { CheckoutTrustCluster } from './CheckoutTrustCluster';

interface SellerInfo {
  id: string;
  username: string | null;
  avatar: string | null;
}

interface Props {
  title: string;
  imageUrl: string;
  seller: SellerInfo;
  priceLabel: string;
  onPressSeller?: () => void;
  onPressMessage?: () => void;
  /** Row-config objects — the screen owns all derived text/conditional
   *  logic, this component owns the stacking order and layout. */
  addressRow: React.ComponentProps<typeof CheckoutSelectionRow>;
  deliveryRow: React.ComponentProps<typeof CheckoutSelectionRow>;
  paymentRow: React.ComponentProps<typeof CheckoutSelectionRow>;
  /** When set, the 1ZE wallet option row renders beneath payment. */
  onezeOption?: {
    onezeBalance: number;
    neededAmount: number;
    onPress: () => void;
  };
}

// The selection stack: item/seller summary, delivery address, delivery
// method, payment method, optional 1ZE wallet option and the inline trust
// cluster — rendered as one contiguous group inside the scroll content.
export function CheckoutSelectionSection({
  title,
  imageUrl,
  seller,
  priceLabel,
  onPressSeller,
  onPressMessage,
  addressRow,
  deliveryRow,
  paymentRow,
  onezeOption,
}: Props) {
  return (
    <View>
      <CheckoutItemSummary
        title={title}
        imageUrl={imageUrl}
        seller={seller}
        priceLabel={priceLabel}
        onPressSeller={onPressSeller}
        onPressMessage={onPressMessage}
      />

      {/* 3. Delivery address */}
      <CheckoutSelectionRow {...addressRow} />

      {/* 4. Delivery method */}
      <CheckoutSelectionRow {...deliveryRow} />

      {/* 5. Payment method — unified with address/delivery row family */}
      <CheckoutSelectionRow {...paymentRow} />

      {/* 5a. 1ZE wallet payment option — shown alongside card payment so
          the user sees both options side by side. Toggling switches the
          funding source between 1ZE wallet and card without changing any
          other checkout detail. */}
      {onezeOption && (
        <CheckoutOnezeOption
          onezeBalance={onezeOption.onezeBalance}
          neededAmount={onezeOption.neededAmount}
          onPress={onezeOption.onPress}
        />
      )}

      {/* Secure payment trust signal — placed inline near the payment method
          row where card-security anxiety peaks. Per 2026 UX research:
          "A 'Secure checkout' message next to the card number field is more
          effective than security badges in the footer." */}
      <CheckoutTrustCluster />
    </View>
  );
}
