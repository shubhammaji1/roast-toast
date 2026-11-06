import Link from "next/link";
export default function Page() {
  return (
    <article className="legal-page">
      <span className="eyebrow">A FEW TABLE MANNERS</span>
      <h1>
        Roast the idea.
        <br />
        <em>Respect the person.</em>
      </h1>
      <p className="lede">
        An honest room works only when people feel safe enough to put something
        unfinished in it.
      </p>
      <h2>Be specific. Be useful.</h2>
      <p>
        Question an assumption, explain the risk, and offer a practical next
        step. Humor is welcome; humiliation isn’t.
      </p>
      <h2>Meet the creator where they are.</h2>
      <p>
        Respect their invited feedback tone. “Savage” means sharp thinking,
        never personal attacks, slurs, threats, or discrimination.
      </p>
      <h2>Bring your own work.</h2>
      <p>
        Don’t plagiarize, impersonate people, post private information, or
        promote scams. Disclose your connection to products you recommend. Label
        AI-generated material.
      </p>
      <h2>Keep money optional.</h2>
      <p>
        A coffee is appreciation. It never buys a positive review or a place at
        the table. Coffee links open the creator’s own Buy Me a Coffee page.
      </p>
      <h2>Help keep the room healthy.</h2>
      <p>
        Use the report action on ideas and roasts when something breaks these
        rules. Block members from their profiles. Moderators review reports, can
        hide content or suspend posting identities, and record their decisions.
        Appeals can be submitted in Your space.
      </p>
      <h2>Share thoughtfully.</h2>
      <p>
        Public ideas can be read and shared by anyone. Unlisted ideas are
        accessible to anyone with their link. Publishing an idea does not
        guarantee intellectual-property protection.
      </p>
      <Link className="button primary" href="/feed">
        Back to the table ↗
      </Link>
    </article>
  );
}
