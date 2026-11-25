import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Privacy",
  alternates: { canonical: "/privacy" },
};
export default function Page() {
  return (
    <article className="legal-page">
      <span className="eyebrow">YOUR DATA, IN PLAIN LANGUAGE</span>
      <h1>
        A little privacy.
        <br />
        <em>A lot of respect.</em>
      </h1>
      <p className="notice">
        Development privacy notice. This document requires operator details,
        retention periods, and legal review before public launch.
      </p>
      <h2>What this app stores</h2>
      <p>
        Browser identity, profile information, ideas, feedback, interactions,
        reports, collaboration requests, and optional creator support URLs are
        stored in Supabase PostgreSQL. Browser ownership uses HTTP-only session
        cookies. Idea and roast drafts may also be stored in your browser on
        this device. Optional member accounts use Clerk to manage sign-in
        credentials, email verification and recovery. This app links your Clerk
        identity to your workspace and uses your verified email for opted-in
        reminders. Linking a verified account preserves your workspace and
        revokes its old guest session.
      </p>
      <h2>Visitor activity and approximate location</h2>
      <p>
        We use an HTTP-only visitor analytics cookie to count browsers across
        tabs. While a page is visible, it sends an activity update approximately
        every 30 seconds. A browser is considered online for two minutes after
        its last update. We store its IP address, last visited page path, last
        activity time, and approximate city, region, and country in Supabase.
        URL query strings and fragments are not collected by this feature.
        Activity records are kept for 30 days. The analytics cookie expires
        after 30 days without a visit.
      </p>
      <p>
        We also keep an anonymous total visitor count that remains after
        individual activity records expire or are deleted. This aggregate
        contains no IP addresses or browser identifiers. Different browsers,
        cleared cookies, and expired cookies can count as new visitors.
      </p>
      <p>
        When location lookup is enabled, public IP addresses are sent to
        ipapi.com (APILayer) to estimate location. These estimates can reflect a
        VPN or network provider. Local addresses and failed lookups have no
        location. The public site displays only the online count; IP addresses,
        location breakdowns, and recent activity are restricted to verified
        moderators. See{" "}
        <a
          href="https://www.ideracorp.com/Legal/PrivacyPolicy"
          target="_blank"
          rel="noopener noreferrer"
        >
          ipapi.com’s privacy policy
        </a>
        .
      </p>
      <h2>Who can see what</h2>
      <p>
        Published public ideas and feedback are visible to everyone. Unlisted
        ideas are visible to anyone with the link. Saved drafts are visible only
        to their author. Private profile settings hide your bio, website,
        skills, and profile idea list, while your public contributions and name
        remain visible. Coffee links open an external provider with its own
        privacy terms.
      </p>
      <h2>Your controls</h2>
      <p>
        You can edit your profile, block members, export your data, and delete
        your browser data from Your space. Deletion hides your ideas and roasts,
        deletes the browser session, and anonymizes your community identity.
        Audit records may remain for accountability. Account holders can recover
        access by email and opt in or out of sprint reminder emails from My
        account. Email addresses and reminder preferences are not included in
        public profiles.
      </p>
      <h2>Local development</h2>
      <p>
        Member verification and recovery emails are handled by Clerk. Moderator
        emails and sprint reminders stay in a private development outbox when
        SMTP is not configured. Visitor counts work locally; local IP addresses
        are not sent for location lookup. No live payment provider or AI service
        is enabled. Application records are stored in your configured Supabase
        project. Unlinked guest work depends on its browser cookies. Link your
        workspace to a verified account before switching browsers; unsaved local
        drafts remain on their original device.
      </p>
      <h2>Before launch</h2>
      <p>
        The operator must supply a privacy contact, data-retention schedule,
        hosting and processor disclosures, and applicable legal rights. Do not
        use this development instance to collect sensitive personal information.
      </p>
    </article>
  );
}
