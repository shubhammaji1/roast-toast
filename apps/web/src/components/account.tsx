"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Coffee,
  Download,
  LogOut,
  Settings2,
  Mail,
  Check,
  Bell,
  ShieldCheck,
} from "lucide-react";
import {
  type Idea,
  type Profile,
  money,
  type CommunityConfig,
  defaultCommunityConfig,
} from "@roast/domain";
import { api, authClient, date, send } from "@/lib/api";
import { useApp } from "./providers";
import { Avatar, Empty, ErrorState, Loading, Modal } from "./ui";
import { IdeaCard } from "./idea-card";

export function ProfilePage({ username }: { username?: string }) {
  const { me, loading, guard, toast } = useApp();
  const client = useQueryClient();
  const target = username || me?.profile?.username;
  const result = useQuery({
    queryKey: ["profile", target],
    queryFn: () =>
      api<{ profile: Profile; ideas: Idea[]; private: boolean }>(
        `/profiles/${target}`,
      ),
    enabled: Boolean(target),
  });
  const [edit, setEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("ideas");
  const outbox = useQuery({
    queryKey: ["outbox"],
    queryFn: () =>
      api<{ id: string; subject: string; text: string }[]>("/dev/outbox"),
    enabled: Boolean(
      me?.demo &&
      me.user &&
      !me.user.anonymous &&
      !username &&
      tab === "settings",
    ),
  });
  const blocks = useQuery({
    queryKey: ["blocks"],
    queryFn: () =>
      api<{ id: string; blockedId: string; profile: Profile }[]>("/blocks"),
    enabled: Boolean(me?.user && !username && tab === "settings"),
  });
  if (!username && !loading && !me?.user)
    return (
      <Empty title="You bring the ideas. We’ll save you a seat.">
        <button
          className="button primary"
          onClick={() => guard(() => window.location.reload())}
        >
          Retry browser session
        </button>
      </Empty>
    );
  if (result.error) return <ErrorState error={result.error} />;
  if (!result.data) return <Loading />;
  const { profile: person, ideas } = result.data;
  const own = me?.user?.id === person.userId;
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await send(
        "/profiles/me",
        {
          name: data.get("name"),
          username: data.get("username"),
          bio: data.get("bio"),
          website: data.get("website"),
          skills: String(data.get("skills"))
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          private: data.get("private") === "on",
        },
        "PATCH",
      );
      await client.invalidateQueries();
      setEdit(false);
      toast("Looking more like you. Profile updated.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="profile-page">
      <div className="profile-cover">
        <span>
          A WORK IN PROGRESS.
          <br />
          <em>Aren’t we all?</em>
        </span>
        <span className="profile-cover-star">✳</span>
      </div>
      <div className="profile-identity">
        <Avatar person={person} linked={false} />
        <div>
          <h1>{person.name}</h1>
          <span>
            @{person.username}
            {person.demo ? " · Demonstration creator" : ""}
          </span>
        </div>
        {own ? (
          <button
            className="button secondary"
            onClick={() => {
              setError("");
              setEdit(true);
            }}
          >
            <Settings2 size={16} />
            Edit profile
          </button>
        ) : (
          me?.user && (
            <button
              className="quiet-link"
              onClick={async () => {
                try {
                  await send("/blocks", {
                    blockedId: person.userId,
                    active: true,
                  });
                  await client.invalidateQueries();
                  toast(
                    "This person is blocked. Manage blocks in your settings.",
                  );
                } catch (e) {
                  toast((e as Error).message);
                }
              }}
            >
              Block member
            </button>
          )
        )}
      </div>
      <div className="profile-bio">
        <p>
          {person.bio ||
            (result.data.private
              ? "This member keeps their profile private."
              : "Ideas in progress. A bio will follow.")}
        </p>
        <div>
          {person.skills.map((skill) => (
            <span className="skill" key={skill}>
              {skill}
            </span>
          ))}
          {person.website && (
            <a
              href={person.website}
              target="_blank"
              rel="noreferrer"
              className="text-link"
            >
              Personal website
              <ArrowUpRight size={14} />
            </a>
          )}
        </div>
      </div>
      <div className="detail-tabs">
        <button
          className={tab === "ideas" ? "active" : ""}
          onClick={() => setTab("ideas")}
        >
          Ideas on the table<span>{ideas.length}</span>
        </button>
        {own && (
          <>
            <button
              className={tab === "collaborations" ? "active" : ""}
              onClick={() => setTab("collaborations")}
            >
              Building together
            </button>
            <button
              className={tab === "settings" ? "active" : ""}
              onClick={() => setTab("settings")}
            >
              Account & privacy
            </button>
          </>
        )}
      </div>
      {tab === "ideas" && (
        <div className="profile-ideas">
          {ideas.length ? (
            ideas.map((idea) => <IdeaCard key={idea.id} idea={idea} />)
          ) : (
            <Empty
              title={
                result.data.private
                  ? "A little privacy, please."
                  : "The notebook is still open."
              }
            >
              {result.data.private
                ? "This member has chosen to hide their profile details and idea list."
                : "No published ideas here yet. Good things take a little thinking."}
            </Empty>
          )}
        </div>
      )}
      {tab === "collaborations" && own && <Collaborations />}
      {tab === "settings" && own && (
        <div className="settings-content">
          <section>
            <h2>Your space, your call.</h2>
            <p className="muted">
              {me?.user?.anonymous
                ? "Your posts and saved ideas belong to this browser. Keep its cookies to manage them later."
                : `Moderator: ${me?.user?.email}`}
            </p>
            <div className="settings-actions">
              <a
                className="button secondary"
                href="/api/v1/my-data"
                download
              >
                <Download size={16} />
                Export your data
              </a>
              {!me?.user?.anonymous && (
                <button
                  className="button secondary"
                  onClick={async () => {
                    await authClient.signOut();
                    await client.invalidateQueries();
                    window.location.assign("/");
                  }}
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              )}
              <Link className="button secondary" href="/creator-support">
                <Coffee size={16} />
                Creator support
              </Link>
            </div>
            {!me?.user?.anonymous && !me?.user?.emailVerified && (
              <button
                className="text-link"
                onClick={async () => {
                  const result = await authClient.sendVerificationEmail({
                    email: me!.user!.email,
                    callbackURL: "/profile",
                  });
                  toast(
                    result.error?.message ||
                      (me?.demo
                        ? "Verification link sent to your private test inbox below."
                        : "Verification email sent."),
                  );
                  outbox.refetch();
                }}
              >
                Verify your email
                <ArrowUpRight size={14} />
              </button>
            )}
          </section>
          {me?.demo && !me?.user?.anonymous && (
            <section className="test-inbox">
              <h3>
                <Mail size={18} />
                Your private test inbox
              </h3>
              <p className="muted">
                Development emails for your account only. Production uses SMTP.
              </p>
              {outbox.data?.map((mail) => (
                <details key={mail.id}>
                  <summary>{mail.subject}</summary>
                  <p>
                    {mail.text.split("\n").map((line, i) =>
                      /^https?:\/\//.test(line) ? (
                        <a key={i} href={line}>
                          {line}
                        </a>
                      ) : (
                        <span key={i}>
                          {line}
                          <br />
                        </span>
                      ),
                    )}
                  </p>
                </details>
              ))}
            </section>
          )}
          <section>
            <h3>Blocked members</h3>
            {blocks.data?.length ? (
              blocks.data.map((b) => (
                <div className="blocked-row" key={b.id}>
                  <span>{b.profile.name}</span>
                  <button
                    className="text-link"
                    onClick={async () => {
                      await send("/blocks", {
                        blockedId: b.blockedId,
                        active: false,
                      });
                      client.invalidateQueries({ queryKey: ["blocks"] });
                    }}
                  >
                    Unblock
                  </button>
                </div>
              ))
            ) : (
              <p className="muted">No blocked members.</p>
            )}
          </section>
          <section>
            <h3>Need a moderation decision reviewed?</h3>
            <form
              className="form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = e.currentTarget;
                try {
                  await send("/appeals", {
                    body: String(new FormData(f).get("body")),
                  });
                  f.reset();
                  toast("Your appeal is with the moderation team.");
                } catch (err) {
                  toast((err as Error).message);
                }
              }}
            >
              <label className="sr-only" htmlFor="appeal">
                Your appeal
              </label>
              <textarea
                id="appeal"
                name="body"
                required
                minLength={20}
                maxLength={2000}
                rows={3}
                placeholder="Explain what happened and what should be reconsidered."
              />
              <button className="button secondary">Submit an appeal</button>
            </form>
          </section>
          <section className="danger-zone">
            <h3>Delete your account</h3>
            <p>
              This removes your profile, signs you out, and hides your ideas and
              roasts. Payment audit records are retained and attributed to an
              anonymized account.
            </p>
            <button
              className="quiet-link danger"
              onClick={() => setDeleting(true)}
            >
              Delete my account
            </button>
          </section>
        </div>
      )}
      <Modal
        open={edit}
        onOpenChange={setEdit}
        title="A little more you."
        description="Help people get to know the person behind the ideas."
      >
        <form className="form" onSubmit={save}>
          <label>
            Name
            <input
              name="name"
              defaultValue={person.name}
              minLength={2}
              maxLength={60}
              required
            />
          </label>
          <label>
            Username
            <input
              name="username"
              defaultValue={person.username}
              pattern="[a-z0-9_]{3,24}"
              maxLength={24}
              required
            />
          </label>
          <label>
            Bio
            <textarea
              name="bio"
              defaultValue={person.bio}
              rows={3}
              maxLength={350}
            />
          </label>
          <label>
            Skills <span className="optional">comma separated, up to 8</span>
            <input name="skills" defaultValue={person.skills.join(", ")} />
          </label>
          <label>
            Website
            <input name="website" type="url" defaultValue={person.website} />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              name="private"
              defaultChecked={person.private}
            />
            <span>
              Hide my bio, skills, website, and idea list from my profile
            </span>
          </label>
          <p className="fine-print">
            Your name, username, and public posts remain visible in discussions
            and the feed.
          </p>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
          </button>
        </form>
      </Modal>
      <Modal
        open={deleting}
        onOpenChange={setDeleting}
        title="Leave the table?"
        description={
          me?.user?.anonymous
            ? "This removes your browser identity and hides your content. This cannot be undone."
            : "This cannot be undone. Sign in again first if your session is older than 10 minutes."
        }
      >
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setBusy(true);
            try {
              await send(
                "/my-data",
                {
                  confirmation: new FormData(e.currentTarget).get(
                    "confirmation",
                  ),
                },
                "DELETE",
              );
              if (!me?.user?.anonymous) await authClient.signOut();
              window.location.assign("/");
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Type {me?.user?.anonymous ? "DELETE MY DATA" : "DELETE MY ACCOUNT"}{" "}
            to confirm
            <input
              name="confirmation"
              required
              pattern={
                me?.user?.anonymous ? "DELETE MY DATA" : "DELETE MY ACCOUNT"
              }
            />
          </label>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button className="button danger-button" disabled={busy}>
            Permanently delete my data
          </button>
        </form>
      </Modal>
    </div>
  );
}

function Collaborations() {
  const { me, toast } = useApp();
  const client = useQueryClient();
  const result = useQuery({
    queryKey: ["collaborations"],
    queryFn: () =>
      api<
        {
          id: string;
          creatorId: string;
          author: Profile;
          body: string;
          state: string;
          ideaId: string;
        }[]
      >("/collaborations"),
  });
  if (result.isPending) return <Loading />;
  if (result.error) return <ErrorState error={result.error} />;
  return (
    <div className="collaborations">
      {result.data?.length ? (
        result.data.map((r) => (
          <article className="suggestion" key={r.id}>
            <span className="eyebrow">
              {r.creatorId === me?.user?.id
                ? "INCOMING REQUEST"
                : "YOUR REQUEST"}{" "}
              · {r.state}
            </span>
            <h3>{r.author.name}</h3>
            <p>{r.body}</p>
            <Link className="text-link" href={`/ideas/${r.ideaId}`}>
              View idea
              <ArrowUpRight size={14} />
            </Link>
            {r.creatorId === me?.user?.id && r.state === "pending" && (
              <div className="inline-actions">
                {["accepted", "declined"].map((state) => (
                  <button
                    className="button secondary"
                    key={state}
                    onClick={async () => {
                      try {
                        await send(
                          `/collaborations/${r.id}`,
                          { state },
                          "PATCH",
                        );
                        client.invalidateQueries({
                          queryKey: ["collaborations"],
                        });
                      } catch (e) {
                        toast((e as Error).message);
                      }
                    }}
                  >
                    {state === "accepted" ? "Accept request" : "Decline"}
                  </button>
                ))}
              </div>
            )}
          </article>
        ))
      ) : (
        <Empty title="Better together starts with a hello.">
          Visit an idea and choose “Let’s build this” to offer your skills.
        </Empty>
      )}
    </div>
  );
}

export function NotificationsPage() {
  const { me, loading, guard, toast } = useApp();
  const client = useQueryClient();
  const result = useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      api<
        {
          id: string;
          body: string;
          readAt: string | null;
          ideaId?: string;
          createdAt: string;
        }[]
      >("/notifications"),
    enabled: Boolean(me?.user),
  });
  return (
    <div className="narrow-page">
      <span className="eyebrow">THE CONVERSATION CONTINUES</span>
      <div className="section-heading">
        <h1 className="page-title">A little word from the table.</h1>
        {Boolean(result.data?.length) && (
          <button
            className="text-link"
            onClick={async () => {
              try {
                await send("/notifications/read", {});
                client.invalidateQueries({ queryKey: ["notifications"] });
              } catch (e) {
                toast((e as Error).message);
              }
            }}
          >
            Mark all read
            <Check size={15} />
          </button>
        )}
      </div>
      {!loading && !me?.user ? (
        <Empty title="Your updates will find you here.">
          <button
            className="button primary"
            onClick={() => guard(() => window.location.reload())}
          >
            Retry browser session
          </button>
        </Empty>
      ) : result.isPending ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} />
      ) : result.data?.length ? (
        result.data.map((n) => (
          <Link
            key={n.id}
            href={n.ideaId ? `/ideas/${n.ideaId}` : "/profile"}
            className={`notification-row ${n.readAt ? "" : "unread"}`}
          >
            <Bell size={20} />
            <div>
              <p>{n.body}</p>
              <time>{date(n.createdAt)}</time>
            </div>
            <ArrowUpRight size={16} />
          </Link>
        ))
      ) : (
        <Empty title="A quiet moment. Enjoy it.">
          Roasts, replies, and updates from ideas you follow will appear here.
        </Empty>
      )}
    </div>
  );
}

export function CoffeeHistory() {
  return (
    <div className="narrow-page">
      <span className="eyebrow">SUPPORT THE PERSON BEHIND THE IDEA</span>
      <h1 className="page-title">A coffee, direct to the creator.</h1>
      <p>
        Creators can add their Buy Me a Coffee page when publishing or editing
        an idea. The coffee button opens that page in a new tab.
      </p>
      <p>
        Payments, receipts, and refunds are handled by Buy Me a Coffee and the
        creator. Roast & Toast does not store payment details or verify
        donations.
      </p>
      <a
        className="button primary"
        href="https://buymeacoffee.com/signup"
        target="_blank"
        rel="noopener noreferrer"
      >
        Create a Buy Me a Coffee account
        <ArrowUpRight size={16} />
      </a>
      <Link className="button secondary" href="/new">
        Pitch an idea
      </Link>
    </div>
  );
}

export function ResetPassword() {
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="narrow-page">
      <span className="eyebrow">BACK TO THE TABLE</span>
      <h1 className="page-title">A fresh start.</h1>
      {done ? (
        <p className="success-note">
          Password changed. You can now sign in with your new password.
        </p>
      ) : (
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const token =
              new URLSearchParams(window.location.search).get("token") || "";
            const result = await authClient.resetPassword({
              newPassword: String(
                new FormData(e.currentTarget).get("password"),
              ),
              token,
            });
            setBusy(false);
            if (result.error)
              setError(
                result.error.message ||
                  "This reset link is invalid. Request a new one.",
              );
            else setDone(true);
          }}
        >
          <label>
            New password
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
          </label>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Set new password"}
          </button>
        </form>
      )}
    </div>
  );
}

export function AdminPage() {
  const { me, loading, openAuth, toast } = useApp();
  const client = useQueryClient();
  const [tab, setTab] = useState("reports");
  const result = useQuery({
    queryKey: ["admin"],
    queryFn: () => api<Record<string, any[]>>("/admin"),
    enabled: me?.profile?.role === "admin",
  });
  async function update(path: string, body: unknown) {
    try {
      await send(path, body, "PATCH");
      await client.invalidateQueries({ queryKey: ["admin"] });
      toast("Decision recorded in the audit log.");
    } catch (e) {
      toast((e as Error).message);
    }
  }
  if (!loading && !me?.user)
    return (
      <Empty title="Community moderation.">
        <button className="button primary" onClick={openAuth}>
          Moderator sign-in
        </button>
      </Empty>
    );
  if (me?.profile?.role !== "admin")
    return (
      <Empty title="A table for the moderation team.">
        This area requires a verified moderator account.
        <button className="button primary" onClick={openAuth}>
          Moderator sign-in
        </button>
      </Empty>
    );
  return (
    <div className="admin-page">
      <span className="eyebrow">
        <ShieldCheck size={15} /> COMMUNITY STEWARDSHIP
      </span>
      <h1 className="page-title">Keep the table in good shape.</h1>
      <div className="detail-tabs">
        {["reports", "users", "appeals", "orders", "audit", "settings"].map(
          (t) => (
            <button
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
              key={t}
            >
              {t}
            </button>
          ),
        )}
      </div>
      {tab === "settings" ? (
        <AdminSettings />
      ) : result.isPending ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} />
      ) : (
        <div className="admin-rows">
          {result.data?.[tab]?.length ? (
            result.data[tab].map((row) => (
              <article className="admin-row" key={row.id}>
                {tab === "reports" ? (
                  <>
                    <span className="eyebrow">
                      {row.targetType} · {row.state}
                    </span>
                    <p>{row.reason}</p>
                    {row.state === "open" && (
                      <form
                        className="form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          update(`/admin/reports/${row.id}`, {
                            state: f.get("state"),
                            resolution: f.get("resolution"),
                            hide: f.get("hide") === "on",
                          });
                        }}
                      >
                        <label>
                          Decision
                          <select name="state">
                            <option value="resolved">Resolve</option>
                            <option value="dismissed">Dismiss</option>
                          </select>
                        </label>
                        <label>
                          Reason
                          <input
                            name="resolution"
                            required
                            minLength={10}
                            maxLength={1000}
                          />
                        </label>
                        <label className="checkbox">
                          <input type="checkbox" name="hide" />
                          <span>Hide reported content</span>
                        </label>
                        <button className="button secondary">
                          Record decision
                        </button>
                      </form>
                    )}
                  </>
                ) : tab === "users" ? (
                  <>
                    <h3>{row.name}</h3>
                    <p>
                      @{row.username} · {row.role}
                      {row.demo ? " · Demo identity" : ""}
                    </p>
                    {row.role !== "admin" && !row.demo && (
                      <form
                        className="inline-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          update(`/admin/users/${row.id}`, {
                            suspended: !row.suspended,
                            reason: String(
                              new FormData(e.currentTarget).get("reason"),
                            ),
                          });
                        }}
                      >
                        <label className="sr-only" htmlFor={`reason-${row.id}`}>
                          Decision reason
                        </label>
                        <input
                          id={`reason-${row.id}`}
                          name="reason"
                          required
                          minLength={10}
                          placeholder="Reason for this decision"
                        />
                        <button className="button secondary">
                          {row.suspended
                            ? "Restore account"
                            : "Suspend account"}
                        </button>
                      </form>
                    )}
                  </>
                ) : tab === "appeals" ? (
                  <>
                    <span className="eyebrow">{row.state}</span>
                    <p>{row.body}</p>
                    {row.state === "open" && (
                      <div className="inline-actions">
                        <button
                          className="button secondary"
                          onClick={() =>
                            update(`/admin/appeals/${row.id}`, {
                              state: "accepted",
                            })
                          }
                        >
                          Accept & restore account
                        </button>
                        <button
                          className="button secondary"
                          onClick={() =>
                            update(`/admin/appeals/${row.id}`, {
                              state: "declined",
                            })
                          }
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </>
                ) : tab === "orders" ? (
                  <p>
                    {money(row.amount)} · {row.mode} · {row.state} ·{" "}
                    {date(row.createdAt)}
                  </p>
                ) : (
                  <>
                    <span className="eyebrow">
                      {row.action} · {date(row.createdAt)}
                    </span>
                    <p>{row.detail || row.targetId}</p>
                  </>
                )}
              </article>
            ))
          ) : (
            <Empty title="Nothing needs attention here." />
          )}
        </div>
      )}
    </div>
  );
}

function AdminSettings() {
  const { toast } = useApp();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const config = useQuery({
    queryKey: ["config"],
    queryFn: () => api<CommunityConfig>("/community-settings"),
  });
  if (config.isPending) return <Loading />;
  if (config.error) return <ErrorState error={config.error} />;
  if (!config.data) return null;
  return (
    <form
      className="form settings-content"
      style={{ paddingTop: 25 }}
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        const data = new FormData(event.currentTarget);
        try {
          await send(
            "/admin/community-settings",
            {
              publishingEnabled: data.get("publishing") === "on",
              coffeeEnabled: data.get("coffee") === "on",
              categories: data.getAll("category"),
              coffeePresets: config.data!.coffeePresets,
            },
            "PATCH",
          );
          await client.invalidateQueries();
          toast("Community settings saved and recorded.");
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>A few settings for the room.</h2>
      <label className="checkbox">
        <input
          type="checkbox"
          name="publishing"
          defaultChecked={config.data.publishingEnabled}
        />
        <span>Allow new published pitches (drafts stay available)</span>
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          name="coffee"
          defaultChecked={config.data.coffeeEnabled}
        />
        <span>Show creator Buy Me a Coffee links</span>
      </label>
      <fieldset>
        <legend>Categories open to new pitches</legend>
        {defaultCommunityConfig.categories.map((category) => (
          <label className="checkbox" key={category}>
            <input
              type="checkbox"
              name="category"
              value={category}
              defaultChecked={config.data!.categories.includes(category)}
            />
            <span>{category}</span>
          </label>
        ))}
      </fieldset>

      <p className="fine-print">
        Coffee buttons open external creator pages. Existing ideas remain
        readable when a category closes.
      </p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy}>
        {busy ? "Saving…" : "Save community settings"}
      </button>
    </form>
  );
}
