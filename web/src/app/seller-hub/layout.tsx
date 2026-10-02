import { SellerHubChrome } from '@/components/seller/SellerHubChrome';

/**
 * Seller-hub layout — below lg the pages render exactly as they did (the
 * horizontal SellerSectionNav tab strip stays page-level). At lg the tree
 * composes as a persistent left rail + fluid content column — the
 * /settings grammar. The pathname gate lives in the chrome client
 * component so standalone surfaces (label print sheet, catalog import,
 * quick replies) pass through untouched.
 */
export default function SellerHubLayout({ children }: { children: React.ReactNode }) {
  return <SellerHubChrome>{children}</SellerHubChrome>;
}
