'use client';

import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { PaymentMethodsView } from '@/components/settings/PaymentMethodsView';

export default function PaymentsSettingsPage() {
  return (
    <SettingsScaffold title="Payments">
      <PaymentMethodsView />
    </SettingsScaffold>
  );
}
