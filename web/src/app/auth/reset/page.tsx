import type { Metadata } from 'next';
import { ResetPasswordView } from '@/components/auth/ResetPasswordView';

export const metadata: Metadata = {
  title: 'New password',
};

export default function ResetPasswordPage() {
  return <ResetPasswordView />;
}
