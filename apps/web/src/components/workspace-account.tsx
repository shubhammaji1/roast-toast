"use client";
import Link from "next/link";
import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { SignIn, SignUp, useClerk, useUser } from "@clerk/nextjs";
import { send } from "@/lib/api";
import { useApp } from "./providers";
import { Loading } from "./ui";
import { accountAppearance } from "./account-appearance";
import { Bookmark, Lightbulb, CalendarCheck } from "lucide-react";

export function WorkspaceAccount() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)
    return (
      <div className="narrow-page">
        <h1 className="page-title">Save my workspace</h1>
        <p>
          Account sign-in is being set up. You can keep using your guest
          workspace in this browser.
        </p>
        <Link className="button secondary" href="/my-sprints">
          Back to My Sprints
        </Link>
      </div>
    );
  return <ClerkAccount />;
}
function ClerkAccount() {
  const { me, loading } = useApp();
  const { user, isLoaded, isSignedIn } = useUser();
  const clerk = useClerk();
  const params = useSearchParams();
  const router = useRouter();
  const mode = params.get("mode") === "signin" ? "signin" : "signup";
  const returnTo = params.get("returnTo") === "/new" ? "/new" : "/account";
  const returnToQuery = returnTo === "/new" ? "&returnTo=%2Fnew" : "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function action(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!isLoaded || loading) return <Loading />;
  return (
    <div className="workspace-account">
      <header className="workspace-account-intro">
      <span className="eyebrow">YOUR IDEAS, WHEREVER YOU GO</span>
      <h1>
        {isSignedIn ? "Your workspace account" : "Save my workspace"}
      </h1>
      <p className="muted">
        A home for your ideas and the steps that bring them to life.
        Sign in to keep building, wherever you are.
      </p>
      <ul className="account-benefits">
        <li><Lightbulb size={20} /><div><strong>Pick up where you left off</strong><span>Return to your pitches and saved drafts.</span></div></li>
        <li><CalendarCheck size={20} /><div><strong>Keep your next step in sight</strong><span>Follow your sprints, tests, and decisions.</span></div></li>
        <li><Bookmark size={20} /><div><strong>Keep useful ideas close</strong><span>Find your saved posts across devices.</span></div></li>
      </ul>
      <Link className="text-link" href="/feed">Back to the table <span aria-hidden="true">↗</span></Link>
      </header>
      <section className="account-auth-panel" aria-label={isSignedIn ? "Workspace settings" : "Account access"}>
      <div className="auth-brand"><span aria-hidden="true">✳</span> roast&amp;toast.</div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {!isSignedIn ? (
        <>
          <div
            className="auth-mode-switch"
            role="group"
            aria-label="Account action"
          >
            <button
              className="button secondary"
              aria-pressed={mode === "signup"}
              onClick={() =>
                router.push(`/account?mode=signup${returnToQuery}`)
              }
            >
              Create account
            </button>
            <button
              className="button secondary"
              aria-pressed={mode === "signin"}
              onClick={() =>
                router.push(`/account?mode=signin${returnToQuery}`)
              }
            >
              Sign in
            </button>
          </div>
          <p className="account-form-intro">{mode === "signup" ? "Create an account to save your workspace." : "Welcome back. Sign in to your workspace."}</p>
          {mode === "signup" ? (
            <SignUp
              appearance={accountAppearance}
              routing="hash"
              forceRedirectUrl={returnTo}
              signInUrl={`/account?mode=signin${returnToQuery}`}
            />
          ) : (
            <SignIn
              appearance={accountAppearance}
              routing="hash"
              forceRedirectUrl={returnTo}
              signUpUrl={`/account?mode=signup${returnToQuery}`}
            />
          )}
          <p className="account-link-note">Have work saved as a guest? After verifying your email, return here in this browser to link it to your account.</p>
        </>
      ) : (
        <div className="form">
          <p>
            Signed in as{" "}
            <strong>{user.primaryEmailAddress?.emailAddress}</strong>.
          </p>
          {me?.authProvider !== "clerk" ? (
            <p role="alert">
              We couldn’t connect your signed-in account to the workspace.
              Refresh the page to retry.
            </p>
          ) : (
            <>
              {!me.user?.emailVerified ? (
                <p>
                  Verify your primary email in your Clerk account before
                  attaching a workspace or enabling reminders.
                </p>
              ) : (
                <>
                  {me.guestWorkspaceAvailable ? (
                    <>
                      <p>
                        Your guest workspace is still in this browser. Attach it
                        to this verified account. Existing account workspaces
                        will not be overwritten.
                      </p>
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() =>
                          action(async () => {
                            await send("/workspace/link", {});
                            window.location.assign("/my-sprints");
                          })
                        }
                      >
                        Save this browser’s workspace to my account
                      </button>
                    </>
                  ) : (
                    <p>
                      Your workspace is available when you sign in on another
                      device.
                    </p>
                  )}
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={Boolean(me.profile?.sprintReminders)}
                      onChange={(event) => {
                        const enabled = event.target.checked;
                        void action(async () => {
                          await send(
                            "/workspace/preferences",
                            { sprintReminders: enabled },
                            "PATCH",
                          );
                          window.location.reload();
                        });
                      }}
                    />{" "}
                    Email me once during the last 24 hours of each active
                    sprint.
                  </label>
                  <p className="fine-print">
                    Turn reminders off here any time.{" "}
                    {me.emailConfigured
                      ? "Reminders go to your verified email."
                      : "Reminder delivery is not configured yet. Clerk verification and password recovery work separately."}
                  </p>
                </>
              )}
              <Link className="button secondary" href="/my-sprints">
                Open My Sprints
              </Link>
              <Link className="text-link" href="/profile">
                Profile and data settings
              </Link>
            </>
          )}
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              action(async () => {
                await clerk.signOut();
                window.location.assign("/account");
              })
            }
          >
            Sign out
          </button>
        </div>
      )}
      </section>
    </div>
  );
}
