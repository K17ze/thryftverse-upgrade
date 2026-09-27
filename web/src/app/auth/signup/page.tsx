import type { Metadata } from 'next';
import { SignupView } from '@/components/auth/SignupView';

export const metadata: Metadata = {
  title: 'Create account',
};

export default function SignupPage() {
  return <SignupView />;
}
