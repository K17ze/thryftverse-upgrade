import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of service',
  description: 'The terms that govern buying and selling on ThryftVerse.',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-section-title font-semibold text-text-primary">{title}</h2>
      <div className="mt-3 space-y-4 text-body leading-relaxed text-text-secondary">
        {children}
      </div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-20 pt-10 sm:px-6 md:pt-14">
      <h1 className="text-display font-bold tracking-tight text-text-primary">
        Terms of service
      </h1>
      <p className="mt-3 text-body text-text-muted">Last updated: 1 September 2026</p>

      <Section title="The service">
        <p>
          ThryftVerse is a marketplace that connects people selling pre-loved
          fashion with people buying it. We provide the platform — listings,
          messaging, payment processing, Buyer Protection and delivery
          coordination. The contract of sale is between buyer and seller;
          ThryftVerse is never the seller of items listed by members.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          You must be at least 18 to buy or sell. Keep your credentials
          private — activity under your account is your responsibility. One
          account per person; business sellers operate under a verified seller
          account.
        </p>
        <p>
          We may suspend accounts that break these terms, abuse other members,
          or put transactions at risk.
        </p>
      </Section>

      <Section title="Selling">
        <p>
          Listings must be honest: real photographs of the actual item,
          accurate condition, brand and size, and disclosure of defects.
          Counterfeits, replicas and items infringing third-party rights are
          prohibited and removed without refund of fees.
        </p>
        <p>
          When an item sells you agree to dispatch within 5 working days using
          the label we provide. Payment is released to your wallet on
          confirmed delivery, minus our seller fee shown at listing time.
        </p>
      </Section>

      <Section title="Buying">
        <p>
          Pay only through ThryftVerse checkout — it’s the only way Buyer
          Protection applies. Payment is held until delivery is confirmed;
          you then have 2 days to report an item that isn’t as described.
        </p>
        <p>
          Sales are otherwise final. Agreeing to buy and failing to pay, or
          abusing the returns process, can lead to account restrictions.
        </p>
      </Section>

      <Section title="Fees">
        <p>
          Buyers pay a Buyer Protection fee at checkout — shown before you
          pay, always. Sellers pay a percentage fee on completed sales,
          deducted from the payout. Fees for promoted listings and optional
          services are shown where they’re offered.
        </p>
      </Section>

      <Section title="Content">
        <p>
          You keep ownership of what you post — listings, looks, posters,
          messages. You grant us a licence to display, distribute and promote
          that content on the platform and in our marketing of it. Content
          that is unlawful, deceptive or harmful is removed.
        </p>
      </Section>

      <Section title="Liability">
        <p>
          We work hard to keep the platform accurate and available, but we
          provide it “as is”. To the extent the law allows, we’re not liable
          for losses that aren’t reasonably foreseeable, for member content,
          or for items themselves — though Buyer Protection covers what it
          promises to cover. Nothing in these terms limits liability for
          fraud, or for death or personal injury caused by negligence.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          We’ll update these terms as the product evolves. Material changes
          are announced in-app at least 14 days before they take effect;
          continuing to use ThryftVerse after that means you accept them.
        </p>
      </Section>
    </div>
  );
}
