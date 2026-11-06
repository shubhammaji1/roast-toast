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
        this device.
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
        Audit records may remain for accountability.
      </p>
      <h2>Local development</h2>
      <p>
        Verification and password-reset emails stay in a private test inbox when
        no email provider is configured. No live payment provider, tracking
        service, or AI service is enabled. Application records are stored in
        your configured Supabase project. Clearing cookies loses editing access,
        so export anything you need before switching browsers.
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
