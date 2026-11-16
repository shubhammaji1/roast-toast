import Link from "next/link";

export default function Page() {
  return (
    <article className="legal-page">
      <span className="eyebrow">ABOUT THE TABLE</span>
      <h1>
        Good ideas get better
        <br />
        <em>in good company.</em>
      </h1>
      <p className="lede">
        Roast &amp; Toast is a place to share early ideas, get useful feedback,
        and work out what to try next.
      </p>
      <h2>Find ideas from the community</h2>
      <p>
        Published public ideas appear on The table and in Explore. Browse by
        category or search for a topic to find ideas worth discussing.
      </p>
      <h2>Your ideas stay yours</h2>
      <p>
        Public posts are visible to everyone. Drafts are only visible to you,
        and unlisted ideas can be opened by people who have their link.
      </p>
      <div className="hero-actions">
        <Link className="button primary" href="/explore">
          Explore ideas
        </Link>
        <Link className="explore-link" href="/feed">
          Go to the table
        </Link>
      </div>
    </article>
  );
}
