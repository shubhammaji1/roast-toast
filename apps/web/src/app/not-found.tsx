import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty">
      <span className="empty-mark">↗</span>
      <h1>This idea went somewhere else.</h1>
      <p>That page isn’t here. There are plenty of ideas at the table.</p>
      <Link className="button primary" href="/feed">
        Back to the table
      </Link>
    </div>
  );
}
