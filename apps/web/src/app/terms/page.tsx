import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Terms",
  alternates: { canonical: "/terms" },
};
export default function Page() {
  return (
    <article className="legal-page">
      <span className="eyebrow">A FAIR PLACE TO BUILD</span>
      <h1>
        Good company.
        <br />
        <em>Clear expectations.</em>
      </h1>
      <p className="notice">
        Draft terms for development. Operator identity, eligibility,
        jurisdiction, disputes, and payment terms require legal review before a
        public release.
      </p>
      <h2>Your ideas are yours</h2>
      <p>
        You retain rights in your content. By publishing, you allow the app to
        display it and let other people discuss it. Only share material you have
        permission to publish. Posting here does not establish or guarantee
        patent, copyright, trademark, confidentiality, or other
        intellectual-property protection.
      </p>
      <h2>Feedback is a perspective</h2>
      <p>
        Roasts, suggestions, and build updates are community contributions and
        may be incomplete or mistaken. They are not professional, investment,
        legal, or market advice. Test assumptions yourself before spending time
        or money.
      </p>
      <h2>Keep the table welcoming</h2>
      <p>
        Follow the community rules, respect privacy, and do not use the service
        for abuse, fraud, impersonation, spam, or unlawful activity. Moderation
        may hide content or suspend posting identities. You can appeal from Your
        space.
      </p>
      <h2>About coffee</h2>
      <p>
        Coffee buttons on ideas open that idea’s creator’s external Buy Me a
        Coffee page. The site-wide “Buy me a coffee” link supports the Roast &
        Toast operator. Payments, receipts, refunds, and any provider account
        requirements are handled by Buy Me a Coffee. Roast & Toast does not
        collect payment details or take a share of creator support.
      </p>
      <h2>A development service</h2>
      <p>
        This build is provided for evaluation. It has no uptime guarantee, and
        features may change. Back up data you want to keep. A production
        operator must finalize these terms before inviting public use.
      </p>
    </article>
  );
}
