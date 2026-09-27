import type { Metadata } from 'next';
import { AuthLanding } from '@/components/auth/AuthLanding';

export const metadata: Metadata = {
  title: 'Sign up',
};

export default function AuthLandingPage() {
  return <AuthLanding />;
}
