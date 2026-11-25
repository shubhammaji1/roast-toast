/** The configured browser origin, shared by CSRF, authentication and public links. */
export function applicationOrigin(): string {
  const configured = process.env.APP_ORIGIN?.trim() || "http://localhost:3000";
  const message =
    "APP_ORIGIN must be an HTTP(S) origin such as https://your-site.vercel.app, without credentials, a page path, query, or fragment.";
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error(message);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(message);
  return url.origin;
}
