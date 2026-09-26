import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description: 'ThryftVerse is the marketplace where pre-loved fashion gets a second life.',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-section-title font-semibold text-text-primary">{title}</h2>
      <div className="mt-3 space-y-4 text-body-large leading-relaxed text-text-secondary">
        {children}
      </div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-20 pt-10 sm:px-6 md:pt-14">
      <p className="text-label font-semibold uppercase tracking-[0.14em] text-text-muted">
        About ThryftVerse
      </p>
      <h1 className="mt-3 text-display font-bold tracking-tight text-text-primary">
        Fashion deserves a second life.
      </h1>
      <p className="mt-4 text-body-large leading-relaxed text-text-secondary">
        ThryftVerse is the marketplace where pre-loved fashion finds its next
        owner — and where the people who loved it first get paid fairly for
        letting it go.
      </p>

      <Section title="What we believe">
        <p>
          The most sustainable garment is the one that already exists. Every
          piece resold is fabric, water and labour that doesn’t need to be
          produced again — and style that doesn’t need to be re-invented.
        </p>
        <p>
          We built ThryftVerse because resale should feel as good as retail:
          beautiful media, honest descriptions, protected payments, and a
          community that treats second-hand as first choice.
        </p>
      </Section>

      <Section title="How it works">
        <p>
          Sellers photograph and list pieces in minutes. Buyers browse a feed
          curated like a magazine — looks, posters and live shows alongside the
          catalogue — and check out with Buyer Protection on every order.
        </p>
        <p>
          Money moves through the wallet: held safely until delivery, then
          withdrawable to your bank in a tap. No cash meet-ups, no
          payment-in-DMs, no risk.
        </p>
      </Section>

      <Section title="The community">
        <p>
          ThryftVerse is built by the people who use it — archive dealers,
          sneaker authenticators, vintage hunters and everyone clearing out a
          wardrobe with care. Our verification, review and protection systems
          exist so trust is the default, not the exception.
        </p>
      </Section>

      <Section title="Where we're going">
        <p>
          Circular fashion shouldn’t be a compromise. We’re building the tools —
          live shopping, editorial surfaces, sustainability grading — that make
          pre-loved the most interesting way to dress.
        </p>
      </Section>
    </div>
  );
}
