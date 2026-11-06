"use client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Check,
  Flag,
  Flame,
  Handshake,
  Lightbulb,
  MessageCircle,
  Plus,
  Send,
  Share2,
  ThumbsUp,
  Pencil,
  Bell,
  CheckCheck,
} from "lucide-react";
import {
  roastSchema,
  stages,
  tones,
  type Detail,
  type Roast,
  type Idea,
} from "@roast/domain";
import { api, date, send } from "@/lib/api";
import {
  Avatar,
  Cover,
  DemoLabel,
  Empty,
  ErrorState,
  Loading,
  Modal,
  Stage,
} from "./ui";
import { useApp } from "./providers";
import { CoffeeLink, CoffeeSupport } from "./coffee";
import { useIdeaReaction } from "@/lib/use-idea-reaction";

const detailTabs = [
  { key: "idea", name: "The idea" },
  { key: "roasts", name: "Roast arena" },
  { key: "improvements", name: "Improvements" },
  { key: "journey", name: "Build journey" },
  { key: "support", name: "Support" },
];
export function IdeaDetail({ id }: { id: string }) {
  const params = useSearchParams();
  const requestedTab=params.get("tab");
  const tab=requestedTab==="supporters"?"support":requestedTab||"idea";
  const router = useRouter();
  const { me, guard, toast } = useApp();
  const client = useQueryClient();
  const reaction = useIdeaReaction(id);
  const [composer, setComposer] = useState(
    params.get("compose") === "1" && Boolean(me?.user),
  );
  const [form, setForm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<{
    id: string;
    type: "idea" | "roast";
  } | null>(null);
  const result = useQuery({
    queryKey: ["idea", id],
    queryFn: () => api<Detail>(`/ideas/${id}`),
  });
  const detail = result.data;
  const refresh = () => {
    client.invalidateQueries({ queryKey: ["idea", id] });
    client.invalidateQueries({ queryKey: ["ideas"] });
  };
  function react(kind: "interest" | "bookmark" | "follow", active: boolean) {
    if (!reaction.isPending) reaction.mutate({ kind, active });
  }
  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError("");
    try {
      if (form === "improvement") await send(`/ideas/${id}/improvements`, data);
      if (form === "milestone") await send(`/ideas/${id}/milestones`, data);
      if (form === "collaborate")
        await send(`/ideas/${id}/collaborations`, data);
      setForm("");
      refresh();
      toast(
        form === "collaborate"
          ? "Your note is with the creator. A good start."
          : form === "milestone"
            ? "Another step, on the record."
            : "A useful nudge. Your suggestion is on the table.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (result.isPending) return <Loading />;
  if (result.error)
    return <ErrorState error={result.error} retry={() => result.refetch()} />;
  if (!detail) return null;
  const { idea } = detail;
  const owner = me?.user?.id === idea.authorId;
  return (
    <div className="detail-page">
      <div className="back-row">
        <Link href="/feed">
          <ArrowLeft size={15} />
          Back to the table
        </Link>
        <div>
          {idea.demo && <DemoLabel />}
          {owner && (
            <Link href={`/ideas/${id}/edit`}>
              <Pencil size={14} />
              Edit idea
            </Link>
          )}
          <button
            aria-label="Share idea"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href);
                toast("Link copied.");
              } catch {
                toast("Copy this page’s address to share it.");
              }
            }}
          >
            <Share2 size={16} />
          </button>
          <button
            aria-label="Report idea"
            onClick={() => guard(() => setReport({ id, type: "idea" }))}
          >
            <Flag size={16} />
          </button>
        </div>
      </div>
      <header className="detail-header">
        <div className="detail-labels">
          <span className="category-label">{idea.category}</span>
          <Stage stage={idea.stage} />
        </div>
        <h1>{idea.title}</h1>
        <div className="detail-author">
          <Avatar person={idea.author} />
          <div>
            <Link href={`/people/${idea.author.username}`}>
              {idea.author.name}
            </Link>
            <span>
              @{idea.author.username}
              <span className="meta-dot">·</span>
              {date(idea.createdAt)}
            </span>
          </div>
          <span className="detail-version">VERSION {idea.version + 1}</span>
        </div>
        <p className="detail-pitch">{idea.pitch}</p>
        <div className="detail-actions">
          <button
            className="button primary"
            onClick={() => guard(() => setComposer(true))}
          >
            <Flame size={17} />
            Roast this idea
          </button>
          <button
            className={`button secondary ${idea.interested ? "selected" : ""}`}
            aria-pressed={idea.interested}
            disabled={busy || reaction.isPending}
            onClick={() => guard(() => react("interest", !idea.interested))}
          >
            {idea.interested ? <Check size={17} /> : <ThumbsUp size={17} />}I’d
            use this<span>{idea.interests}</span>
          </button>
          <CoffeeLink idea={idea} className="button secondary coffee-text" />
          <button
            className="icon-button"
            aria-pressed={idea.saved}
            aria-label={idea.saved ? "Unsave idea" : "Save idea"}
            disabled={busy || reaction.isPending}
            onClick={() => guard(() => react("bookmark", !idea.saved))}
          >
            <Bookmark size={19} fill={idea.saved ? "currentColor" : "none"} />
          </button>
        </div>
        {idea.demo && (
          <p className="demo-note">
            This is a demonstration idea. Sample identities, feedback, and
            milestones are fictional. Your own posts and replies are stored
            separately.
          </p>
        )}
      </header>
      <div className="detail-layout">
        <div>
          <div
            className="detail-tabs"
            role="tablist"
            aria-label="Idea details"
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const current = detailTabs.findIndex((t) => t.key === tab);
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? detailTabs.length - 1
                    : (current +
                        (event.key === "ArrowRight" ? 1 : -1) +
                        detailTabs.length) %
                      detailTabs.length;
              const buttons =
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button",
                );
              buttons[next]?.focus();
              router.replace(`/ideas/${id}?tab=${detailTabs[next].key}`, {
                scroll: false,
              });
            }}
          >
            {detailTabs.map((t) => (
              <button
                role="tab"
                id={`idea-tab-${t.key}`}
                tabIndex={tab === t.key ? 0 : -1}
                key={t.key}
                aria-selected={tab === t.key}
                aria-controls="idea-discussion-panel"
                onClick={() =>
                  router.replace(`/ideas/${id}?tab=${t.key}`, { scroll: false })
                }
                className={tab === t.key ? "active" : ""}
              >
                {t.name}
                {t.key === "roasts" && <span>{idea.roastCount}</span>}
              </button>
            ))}
          </div>
          <div
            className="detail-content"
            role="tabpanel"
            id="idea-discussion-panel"
            aria-labelledby={`idea-tab-${tab}`}
            tabIndex={0}
          >
            {tab === "idea" && (
              <>
                {(idea.cover || idea.coverImage) && (
                  <Cover kind={idea.cover} mediaId={idea.coverImage} large />
                )}
                <div className="idea-prose">
                  <section>
                    <span className="eyebrow">01 / THE PROBLEM</span>
                    <h2>What needs to change?</h2>
                    <p>
                      {idea.problem ||
                        "The creator is still shaping the problem. A thoughtful question might help."}
                    </p>
                  </section>
                  <section>
                    <span className="eyebrow">02 / THE IDEA</span>
                    <h2>A different way to do it.</h2>
                    <p>{idea.solution || idea.pitch}</p>
                  </section>
                  <section>
                    <span className="eyebrow">03 / THE PEOPLE</span>
                    <h2>Who’s this for?</h2>
                    <p>
                      {idea.audience ||
                        "An open question. Who would you test this with?"}
                    </p>
                  </section>
                  {idea.prototype && (
                    <a
                      className="button secondary"
                      href={idea.prototype}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Take a look at the prototype
                      <ArrowUpRight size={16} />
                    </a>
                  )}
                </div>
                <div className="idea-tags">
                  {idea.tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
              </>
            )}
            {tab === "roasts" && (
              <>
                <div className="discussion-heading">
                  <div>
                    <span className="eyebrow">
                      A LITTLE FRICTION IS A GOOD THING
                    </span>
                    <h2>The roast arena.</h2>
                    <p>Sharp on the idea. Kind to the person.</p>
                  </div>
                  <button
                    className="button secondary"
                    onClick={() => guard(() => setComposer(true))}
                  >
                    <Flame size={16} />
                    Add a roast
                  </button>
                </div>
                {detail.roasts.length ? (
                  detail.roasts.map((roast) => (
                    <RoastCard
                      roast={roast}
                      key={roast.id}
                      owner={owner}
                      refresh={refresh}
                      report={() =>
                        guard(() => setReport({ id: roast.id, type: "roast" }))
                      }
                    />
                  ))
                ) : (
                  <Empty title="The floor is open.">
                    A good first roast could change this idea’s direction. Be
                    useful.
                  </Empty>
                )}
              </>
            )}
            {tab === "improvements" && (
              <>
                <div className="discussion-heading">
                  <div>
                    <span className="eyebrow">
                      TURN “BUT WHAT IF” INTO “TRY THIS”
                    </span>
                    <h2>A way forward.</h2>
                  </div>
                  <button
                    className="button secondary"
                    onClick={() =>
                      guard(() => {
                        setError("");
                        setForm("improvement");
                      })
                    }
                  >
                    <Plus size={16} />
                    Suggest a change
                  </button>
                </div>
                {detail.improvements.length ? (
                  detail.improvements.map((s) => (
                    <article className="suggestion" key={s.id}>
                      <div className="suggestion-labels">
                        <span className="category-label">{s.category}</span>
                        <span className="stage progress">{s.state}</span>
                      </div>
                      <p>{s.body}</p>
                      <div className="suggestion-footer">
                        <Avatar person={s.author} small />
                        <span>{s.author.name}</span>
                        {owner && (
                          <select
                            aria-label="Suggestion status"
                            value={s.state}
                            onChange={async (e) => {
                              try {
                                await send(
                                  `/improvements/${s.id}`,
                                  { state: e.target.value },
                                  "PATCH",
                                );
                                refresh();
                              } catch (error) {
                                toast((error as Error).message);
                              }
                            }}
                          >
                            <option disabled>Suggested</option>
                            {[
                              "Exploring",
                              "Accepted",
                              "Declined",
                              "Implemented",
                            ].map((value) => (
                              <option key={value}>{value}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </article>
                  ))
                ) : (
                  <Empty title="Room to make it better.">
                    Suggest a small, specific change the creator could try.
                  </Empty>
                )}
              </>
            )}
            {tab === "journey" && (
              <>
                <div className="discussion-heading">
                  <div>
                    <span className="eyebrow">
                      FROM ROUGH IDEA TO REAL THING
                    </span>
                    <h2>One step at a time.</h2>
                  </div>
                  {owner && (
                    <button
                      className="button secondary"
                      onClick={() => {
                        setError("");
                        setForm("milestone");
                      }}
                    >
                      <Plus size={16} />
                      Post an update
                    </button>
                  )}
                </div>
                <div className="journey-timeline">
                  {detail.milestones.map((m) => (
                    <article key={m.id}>
                      <span className="timeline-node" />
                      <div className="timeline-meta">
                        {date(m.createdAt)}
                        <Stage stage={m.stage} />
                      </div>
                      <h3>{m.title}</h3>
                      <p>{m.body}</p>
                      <span className="fine-print">
                        {idea.demo
                          ? "Demonstration milestone"
                          : "Self-reported by the creator"}
                      </span>
                    </article>
                  ))}
                  <article>
                    <span className="timeline-node first" />
                    <span className="eyebrow">{date(idea.createdAt)}</span>
                    <h3>The idea is on the table.</h3>
                    <p>
                      Every build starts somewhere. This one started with a
                      question.
                    </p>
                  </article>
                </div>
                <div className="revision-list">
                  <h3>The idea, in versions.</h3>
                  {detail.revisions.map((r) => (
                    <div key={r.id}>
                      <span>V{r.version}</span>
                      <p>{r.title}</p>
                      <time>{date(r.createdAt)}</time>
                    </div>
                  ))}
                </div>
              </>
            )}
            {tab === "support" && <CoffeeSupport idea={idea} />}
          </div>
        </div>
        <aside className="detail-rail">
          <section>
            <span className="eyebrow">THE PERSON BEHIND THE “WHAT IF”</span>
            <Avatar person={idea.author} />
            <h3>{idea.author.name}</h3>
            <span className="muted">@{idea.author.username}</span>
            <p>
              {idea.author.bio ||
                "Putting an idea out there. One small step at a time."}
            </p>
            <Link
              className="text-link"
              href={`/people/${idea.author.username}`}
            >
              Meet the maker
              <ArrowUpRight size={14} />
            </Link>
          </section>
          <section>
            <h3>Keep this one close.</h3>
            <p>Follow along as the idea gets a little more real.</p>
            <button
              className="button secondary full"
              aria-pressed={idea.following}
              disabled={busy || reaction.isPending}
              onClick={() => guard(() => react("follow", !idea.following))}
            >
              {idea.following ? <Check size={16} /> : <Bell size={16} />}{" "}
              {idea.following ? "Following progress" : "Follow progress"}
            </button>
          </section>
          <section>
            <Lightbulb size={22} />
            <h3>See a better way?</h3>
            <p>A specific suggestion beats “love the idea” every time.</p>
            <button
              className="text-link"
              onClick={() =>
                guard(() => {
                  setError("");
                  setForm("improvement");
                })
              }
            >
              Suggest an improvement
              <ArrowUpRight size={14} />
            </button>
          </section>
          {!owner && (
            <section>
              <Handshake size={22} />
              <h3>Better built together.</h3>
              <p>Bring your skills. Tell the creator where you can help.</p>
              <button
                className="text-link"
                onClick={() =>
                  guard(() => {
                    setError("");
                    setForm("collaborate");
                  })
                }
              >
                Let’s build this
                <ArrowUpRight size={14} />
              </button>
            </section>
          )}
          <p className="rail-footer">
            POSTING AN IDEA DOES NOT PROTECT YOUR INTELLECTUAL PROPERTY.
          </p>
        </aside>
      </div>
      <RoastComposer
        idea={idea}
        open={composer}
        onOpenChange={setComposer}
        onSuccess={() => {
          refresh();
          router.replace(`/ideas/${id}?tab=roasts`, { scroll: false });
        }}
      />
      <Modal
        open={Boolean(form)}
        onOpenChange={(value) => !value && setForm("")}
        title={
          form === "improvement"
            ? "Make it a little better."
            : form === "milestone"
              ? "What moved forward?"
              : "Bring something to the table."
        }
        description={
          form === "collaborate"
            ? "Tell the creator what you can contribute and why this idea interests you."
            : "Be specific. Small steps count."
        }
      >
        <form className="form" onSubmit={submitForm}>
          {form === "improvement" && (
            <label>
              What kind of improvement?
              <select name="category">
                {[
                  "Product",
                  "Marketing",
                  "Feasibility",
                  "Business model",
                  "User experience",
                  "Distribution",
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
          {form === "milestone" && (
            <>
              <label>
                Update title
                <input name="title" required minLength={5} maxLength={140} />
              </label>
              <label>
                Current stage
                <select name="stage" defaultValue={idea.stage}>
                  {stages.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label>
            {form === "collaborate"
              ? "How would you help?"
              : form === "milestone"
                ? "What did you learn or build?"
                : "What would you change?"}
            <textarea
              name="body"
              rows={5}
              required
              minLength={form === "collaborate" ? 20 : 12}
              maxLength={2000}
            />
          </label>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy
              ? "Posting…"
              : form === "collaborate"
                ? "Send a collaboration request"
                : "Put it on the record"}
            <ArrowUpRight size={16} />
          </button>
        </form>
      </Modal>
      <ReportDialog target={report} close={() => setReport(null)} />
    </div>
  );
}

function RoastComposer({
  idea,
  open,
  onOpenChange,
  onSuccess,
}: {
  idea: Idea;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onSuccess: () => void;
}) {
  const { guard, toast, me } = useApp();
  const key = `rt:roast:v2:${me?.user?.id || "guest"}:${idea.id}`;
  const [tone, setTone] = useState<(typeof tones)[number]>(idea.tone);
  const [critique, setCritique] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [punchline, setPunchline] = useState("");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setCritique("");
    setSuggestion("");
    setPunchline("");
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw);
        setCritique(saved.critique || "");
        setSuggestion(saved.suggestion || "");
        setPunchline(saved.punchline || "");
      }
    } catch {
      /* Draft storage is optional. */
    }
  }, [key]);
  function draft(field: string, value: string) {
    const next = { critique, suggestion, punchline, [field]: value };
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* Storage full or blocked; keep the in-memory draft. */
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    guard(async () => {
      const parsed = roastSchema.safeParse({
        tone,
        critique,
        suggestion,
        punchline,
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0].message);
        return;
      }
      setBusy(true);
      setError("");
      try {
        await send(`/ideas/${idea.id}/roasts`, parsed.data);
        try {
          localStorage.removeItem(key);
        } catch {}
        setCritique("");
        setSuggestion("");
        setPunchline("");
        onOpenChange(false);
        onSuccess();
        toast("A little heat. A useful next step. Your roast is posted.");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    });
  }
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      wide
      title="Let’s hear the roast."
      description={`You’re roasting “${idea.title}”`}
    >
      <form className="form roast-form" onSubmit={submit}>
        <div className="tone-selector">
          {tones.map((t, i) => (
            <button
              key={t}
              type="button"
              disabled={i > tones.indexOf(idea.tone)}
              aria-pressed={tone === t}
              onClick={() => setTone(t)}
            >
              <span>
                {Array.from({ length: i + 1 }, (_, n) => (
                  <Flame key={n} size={16} />
                ))}
              </span>
              <strong>{t} roast</strong>
              <small>
                {i === 0
                  ? "Gentle & encouraging"
                  : i === 1
                    ? "Straight & thoughtful"
                    : "Sharp, never personal"}
              </small>
            </button>
          ))}
        </div>
        <p className="composer-rule">
          Creator’s invitation: {idea.tone.toLowerCase()} roast or gentler.
          Critique the idea, never the person.
        </p>
        <div className="composer-toolbar">
          <span>YOUR FEEDBACK</span>
          <button
            type="button"
            className="quiet-link"
            onClick={() => setPreview(!preview)}
          >
            {preview ? "Keep writing" : "Preview roast"}
          </button>
        </div>
        {preview ? (
          <div className="roast-preview">
            <span className="mini-stamp">{tone.toUpperCase()} ROAST</span>
            <p>{critique || "Your critique will appear here."}</p>
            <h4>A way forward</h4>
            <p>{suggestion || "Your suggestion will appear here."}</p>
            {punchline && <blockquote>“{punchline}”</blockquote>}
          </div>
        ) : (
          <>
            <label>
              What’s the weak spot?
              <textarea
                required
                minLength={12}
                maxLength={2000}
                rows={4}
                value={critique}
                onChange={(e) => {
                  setCritique(e.target.value);
                  draft("critique", e.target.value);
                }}
                placeholder="What assumption needs testing? Why does it matter?"
              />
              <span className="character-count">{critique.length}/2,000</span>
            </label>
            <label>
              Give them a way forward.
              <textarea
                required
                minLength={12}
                maxLength={1500}
                rows={3}
                value={suggestion}
                onChange={(e) => {
                  setSuggestion(e.target.value);
                  draft("suggestion", e.target.value);
                }}
                placeholder="One concrete change or experiment they could try."
              />
            </label>
            <label>
              The punchline <span className="optional">optional</span>
              <input
                maxLength={240}
                value={punchline}
                onChange={(e) => {
                  setPunchline(e.target.value);
                  draft("punchline", e.target.value);
                }}
                placeholder="A little wit. Zero personal attacks."
              />
            </label>
          </>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="composer-bottom">
          <span className="fine-print">
            Draft saved on this device as you type.
          </span>
          <button className="button primary" disabled={busy}>
            <Flame size={16} />
            {busy ? "Putting it on the table…" : "Serve the roast"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RoastCard({
  roast,
  owner,
  refresh,
  report,
}: {
  roast: Roast;
  owner: boolean;
  refresh: () => void;
  report: () => void;
}) {
  const { guard, toast } = useApp();
  const [reply, setReply] = useState(false);
  const [busy, setBusy] = useState(false);
  async function act(path: string, data: unknown = {}) {
    setBusy(true);
    try {
      await send(path, data);
      refresh();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="roast-card">
      <header>
        <div className="creator">
          <Avatar person={roast.author} small />
          <div>
            <Link href={`/people/${roast.author.username}`}>
              {roast.author.name}
            </Link>
            <span>
              {date(roast.createdAt)}
              {roast.author.demo ? " · Demo feedback" : ""}
            </span>
          </div>
        </div>
        <span className={`roast-tone tone-${roast.tone.toLowerCase()}`}>
          <Flame size={13} />
          {roast.tone} roast
        </span>
      </header>
      <p className="roast-critique">{roast.critique}</p>
      <div className="roast-suggestion">
        <Lightbulb size={16} />
        <div>
          <span>A WAY FORWARD</span>
          <p>{roast.suggestion}</p>
        </div>
      </div>
      {roast.punchline && <blockquote>“{roast.punchline}”</blockquote>}
      <footer>
        <button
          disabled={busy}
          aria-pressed={roast.voted}
          onClick={() =>
            guard(() =>
              act(`/roasts/${roast.id}/helpful`, { active: !roast.voted }),
            )
          }
        >
          <ThumbsUp size={15} />
          {roast.voted ? "Helpful, agreed" : "Helpful"}
          <b>{roast.helpful}</b>
        </button>
        <button onClick={() => guard(() => setReply(!reply))}>
          <MessageCircle size={15} />
          Reply{roast.replies.length ? ` · ${roast.replies.length}` : ""}
        </button>
        {owner && (
          <button
            disabled={busy}
            onClick={() => act(`/roasts/${roast.id}/acknowledge`)}
          >
            <CheckCheck size={15} />
            {roast.acknowledged ? "Acknowledged" : "Acknowledge"}
          </button>
        )}
        {!owner && roast.acknowledged && (
          <span className="acknowledged">
            <CheckCheck size={15} />
            Creator took note
          </span>
        )}
        <button
          className="report-button"
          aria-label="Report roast"
          onClick={report}
        >
          <Flag size={14} />
        </button>
      </footer>
      {roast.replies.map((r) => (
        <div className="reply" key={r.id}>
          <Avatar person={r.author} small />
          <div>
            <strong>{r.author.name}</strong>
            <p>{r.body}</p>
          </div>
        </div>
      ))}
      {reply && (
        <form
          className="reply-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const body = String(new FormData(form).get("body"));
            await act(`/roasts/${roast.id}/replies`, { body });
            form.reset();
          }}
        >
          <label className="sr-only" htmlFor={`reply-${roast.id}`}>
            Your reply
          </label>
          <input
            name="body"
            id={`reply-${roast.id}`}
            required
            minLength={2}
            maxLength={1500}
            placeholder="Keep the conversation useful…"
          />
          <button
            className="icon-button"
            disabled={busy}
            aria-label="Post reply"
          >
            <Send size={17} />
          </button>
        </form>
      )}
    </article>
  );
}

function ReportDialog({
  target,
  close,
}: {
  target: { id: string; type: "idea" | "roast" } | null;
  close: () => void;
}) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      open={Boolean(target)}
      onOpenChange={(v) => !v && close()}
      title="Keep the table a good place."
      description="Reports go to community moderators. The person you report won’t see your identity."
    >
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await send("/reports", {
              targetId: target!.id,
              targetType: target!.type,
              reason: String(new FormData(e.currentTarget).get("reason")),
            });
            close();
            toast(
              "Report received. Thank you for looking out for the community.",
            );
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          What should we look at?
          <textarea
            name="reason"
            rows={4}
            required
            minLength={10}
            maxLength={1000}
            placeholder="Tell us what happened and which rule it breaks."
          />
        </label>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? "Sending…" : "Send to moderators"}
        </button>
      </form>
    </Modal>
  );
}
