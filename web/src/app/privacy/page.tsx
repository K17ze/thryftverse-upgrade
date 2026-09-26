import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'How ThryftVerse collects, uses and protects your data.',
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

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-20 pt-10 sm:px-6 md:pt-14">
      <h1 className="text-display font-bold tracking-tight text-text-primary">
        Privacy policy
      </h1>
      <p className="mt-3 text-body text-text-muted">Last updated: 1 September 2026</p>

      <Section title="What we collect">
        <p>
          We collect what the service needs to work: your account details
          (username, email), the listings and content you create, orders and
          transactions, messages between members, and the technical data that
          keeps the platform fast and secure (device type, approximate
          location, usage patterns).
        </p>
        <p>
          When you verify your identity or sell at volume, we may collect
          identity documents — handled by our verification partner and never
          displayed publicly.
        </p>
      </Section>

      <Section title="How we use it">
        <p>
          Your data runs the marketplace: it powers your feed, processes
          payments and payouts, protects transactions under Buyer Protection,
          and keeps the community safe through fraud and counterfeit
          detection.
        </p>
        <p>
          We personalise discovery — the feed, recommended items, saved
          searches — from what you browse and favourite. You can clear this
          history from Settings at any time.
        </p>
      </Section>

      <Section title="What we share">
        <p>
          Other members see your public profile: username, avatar, listings,
          ratings and reviews. Your email, address, payment details and
          messages are never public.
        </p>
        <p>
          We share data only with the processors that run the platform —
          payment providers, shipping carriers, identity verification — under
          contracts that limit them to what we ask them to do. We do not sell
          your personal data.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          Account data lives as long as your account does. Transaction records
          are retained for the period tax and consumer law requires. Messages
          are kept until both parties delete them. When you delete your
          account, public content is anonymised and personal data is erased
          within 30 days.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can access, correct, export or delete your data from Settings,
          or by writing to us. You can object to personalisation and marketing
          at any time. If you’re in the UK or EEA, you also have the right to
          lodge a complaint with your data protection authority.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Data is encrypted in transit and at rest. Payment details are held
          by our payment processor — ThryftVerse never stores full card
          numbers. Two-factor authentication is available for every account
          and required for payouts.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy or your data:{' '}
          <a
            href="mailto:privacy@thryftverse.example"
            className="text-text-primary underline decoration-border underline-offset-4 hover:decoration-text-muted"
          >
            privacy@thryftverse.example
          </a>
        </p>
      </Section>
    </div>
  );
}
