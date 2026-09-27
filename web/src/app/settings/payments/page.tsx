import type { Metadata } from 'next';
import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { PaymentMethodsView } from '@/components/settings/PaymentMethodsView';

export const metadata: Metadata = {
  title: 'Payment settings',
};

export default function PaymentsSettingsPage() {
  return (
    <SettingsScaffold title="Payments">
      <PaymentMethodsView />
    </SettingsScaffold>
  );
}
