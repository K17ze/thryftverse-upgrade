import type { Metadata } from 'next';
import { OnboardingView } from './OnboardingView';

export const metadata: Metadata = {
  title: 'Welcome',
};

export default function OnboardingPage() {
  return <OnboardingView />;
}
