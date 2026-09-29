import type { Metadata } from 'next';
import { AuthLanding } from '@/components/auth/AuthLanding';

export const metadata: Metadata = {
  title: 'Sign in or join',
};

export default function AuthLandingPage() {
  return <AuthLanding />;
}
