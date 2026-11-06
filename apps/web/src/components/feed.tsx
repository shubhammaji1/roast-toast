"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  Flame,
  SlidersHorizontal,
  Coffee,
  Plus,
  Check,
} from "lucide-react";
import { categories, type Idea, type Detail } from "@roast/domain";
import { api } from "../lib/api";
import { useApp } from "./providers";
import {
  Avatar,
  Cover,
  DemoLabel,
  Empty,
  ErrorState,
  Loading,
  SmallLink,
  Stage,
} from "./ui";
import { IdeaCard } from "./idea-card";

const tabs = [
  { key: "for-you", name: "For you" },
  { key: "latest", name: "Freshly pitched" },
  { key: "trending", name: "Getting attention" },
  { key: "needs-feedback", name: "Needs a roast" },
  { key: "building", name: "Being built" },
];
function useFeaturedIdea() {
  const { me } = useApp();
  return useQuery({
    queryKey: ["ideas", "featured", me?.user?.id],
    queryFn: async ({ signal }) => {
      const { ideas } = await api<{ ideas: Idea[] }>("/ideas?limit=1", {
        signal,
      });
      return ideas[0] ? api<Detail>(`/ideas/${ideas[0].id}`, { signal }) : null;
    },
  });
}
function useBuildingIdeas() {
  const { me } = useApp();
  return useQuery({
    queryKey: ["ideas", "building-preview", me?.user?.id],
    queryFn: ({ signal }) =>
      api<{ ideas: Idea[] }>("/ideas?tab=building&limit=3", { signal }),
  });
}
export function Landing() {
  const router = useRouter();
  const { guard } = useApp();
  const featured = useFeaturedIdea();
  const { data } = featured;
  const idea = data?.idea;
  const building = useBuildingIdeas();
  const buildingIdea = building.data?.ideas[0];
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow hero-kicker">
            <span className="live-dot" /> A LITTLE HEAT. A BETTER IDEA.
          </div>
          <h1>
            YOUR IDEA
            <br />
            ISN’T SPECIAL<span className="period">.</span>
            <br />
            <span className="hero-yet">
              Yet.
              <svg viewBox="0 0 180 16" aria-hidden="true">
                <path
                  d="M2 10C45 1 119 3 177 7M8 15C70 5 117 8 164 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                />
              </svg>
            </span>
          </h1>
          <p>
            Put it out there. Get brutally useful feedback.
            <br className="desktop-break" /> Find your people. Maybe even earn a
            coffee.
          </p>
          <div className="hero-actions">
            <button
              className="button primary"
              onClick={() => guard(() => router.push("/new"))}
            >
              Put my idea on the table
              <ArrowUpRight size={18} />
            </button>
            <Link className="explore-link" href="/feed">
              Explore the roasts
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="hero-footnote">
            <span className="scribble-arrow">↳</span> For the “what if” people.
            And the “here’s the thing” people.
          </div>
        </div>
        <div className="hero-preview">
          <span className="preview-annotation">
            An idea. A little friction. A better starting point.
            <svg viewBox="0 0 50 38" aria-hidden="true">
              <path
                d="M2 1c30 2 35 12 31 28m-8-7 8 9 10-8"
                stroke="currentColor"
                fill="none"
                strokeWidth="1.5"
              />
            </svg>
          </span>
          {idea ? (
            <div
              className={`featured-idea ${idea.cover || idea.coverImage ? "has-cover" : "text-only"}`}
            >
              <div className="featured-topline">
                <span>ON THE TABLE</span>
                {idea.demo && <DemoLabel />}
              </div>
              {(idea.cover || idea.coverImage) && (
                <Cover kind={idea.cover} mediaId={idea.coverImage} large />
              )}
              <div className="featured-copy">
                <span className="category-label">{idea.category}</span>
                <h2>
                  <Link href={`/ideas/${idea.id}`}>{idea.title}</Link>
                </h2>
                <div className="featured-author">
                  <Avatar person={idea.author} small />
                  <span>@{idea.author.username}</span>
                  <Stage stage={idea.stage} />
                </div>
              </div>
              {data?.roasts[0] && (
                <Link
                  href={`/ideas/${idea.id}?tab=roasts`}
                  className="featured-roast"
                >
                  <span className="mini-stamp">
                    <Flame size={13} /> HONEST ROAST
                  </span>
                  <p>“{data.roasts[0].punchline || data.roasts[0].critique}”</p>
                  <span>
                    Read the conversation
                    <ArrowUpRight size={13} />
                  </span>
                </Link>
              )}
            </div>
          ) : featured.error ? (
            <ErrorState
              error={featured.error}
              retry={() => featured.refetch()}
            />
          ) : (
            <div className="hero-placeholder">
              <Cover kind="tools" large />
              <p role={featured.isPending ? "status" : undefined}>
                {featured.isPending
                  ? "Pulling up a chair…"
                  : "Be the first to put an idea on the table."}
              </p>
            </div>
          )}
          <span className="preview-bottom">
            HALF-BAKED IS A PERFECTLY GOOD START.
          </span>
        </div>
      </section>
      <div className="table-divider">
        <span>LESS ECHO CHAMBER. MORE SOUNDING BOARD.</span>
        <span>
          Pitch it. <b>Roast it.</b> Build it.
          <span className="tiny-star">✳</span>
        </span>
      </div>
      <Feed landing />
      <section className="how-section">
        <div className="section-kicker">FROM “WHAT IF” TO “WHAT’S NEXT”</div>
        <h2>
          Good feedback
          <br />
          leaves a mark.<span> And a way forward.</span>
        </h2>
        <div className="how-steps">
          <div>
            <span>01 / THE PITCH</span>
            <h3>Put the rough idea out there.</h3>
            <p>
              A shared tool library for apartment buildings. Fewer drills
              gathering dust.
            </p>
          </div>
          <div>
            <span>02 / THE USEFUL ROAST</span>
            <h3>Find the bit you missed.</h3>
            <p>
              “What happens when someone breaks the drill?” A good question
              beats a polite like.
            </p>
          </div>
          <div>
            <span>03 / THE NEXT VERSION</span>
            <h3>Build something better.</h3>
            <p>
              Test condition photos and deposits in one building. Share what you
              learn.
            </p>
          </div>
        </div>
        <p className="fine-print">
          Product demonstration based on the sample tool-library idea.
        </p>
      </section>
      <section className="landing-bottom">
        <div className="appreciation">
          <Coffee size={38} strokeWidth={1.3} />
          <div>
            <span className="eyebrow">APPRECIATION, WITHOUT THE PRESSURE</span>
            <h2>Some ideas deserve a coffee.</h2>
            <p>
              A small thank-you for showing up and putting something out there.
              Always optional. Feedback is free.
            </p>
            <Link href="/explore" className="text-link">
              Find an idea to root for
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
        <div className="journey-preview">
          <span className="eyebrow">
            FROM ROASTED TO REAL{buildingIdea?.demo ? " · DEMO JOURNEY" : ""}
          </span>
          <h3>{buildingIdea?.title || "Your idea could be next."}</h3>
          <div>
            <span>
              <Check size={13} /> Hear the hard questions
            </span>
            <span>
              <Check size={13} /> Make the idea smaller
            </span>
            <span>
              <i className="live-dot" />
              {buildingIdea?.stage || "Build the first version"}
            </span>
          </div>
          <SmallLink
            href={
              buildingIdea
                ? `/ideas/${buildingIdea.id}?tab=journey`
                : "/building"
            }
          >
            {buildingIdea ? "Follow the build" : "Explore build journeys"}
          </SmallLink>
        </div>
      </section>
    </>
  );
}

export function Feed({
  mode = "for-you",
  landing = false,
  initialQuery = "",
}: {
  mode?: string;
  landing?: boolean;
  initialQuery?: string;
}) {
  const [tab, setTab] = useState(mode === "explore" ? "for-you" : mode);
  const [category, setCategory] = useState("All ideas");
  const [query, setQuery] = useState(initialQuery);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const { me, guard } = useApp();
  const router = useRouter();
  const privateView = ["saved", "mine", "following"].includes(mode);
  const authorized = !privateView || Boolean(me?.user);
  const result = useInfiniteQuery({
    queryKey: ["ideas", tab, category, deferredQuery, me?.user?.id],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      api<{ ideas: Idea[]; nextCursor: string | null }>(
        `/ideas?${new URLSearchParams({ tab, category, q: deferredQuery, ...(pageParam ? { cursor: pageParam } : {}) })}`,
      ),
    getNextPageParam: (page) => page.nextCursor,
    enabled: authorized,
  });
  const ideas = result.data?.pages.flatMap((page) => page.ideas) || [];
  const Heading = landing ? "h2" : "h1";
  const heading =
    mode === "saved"
      ? "Worth coming back to."
      : mode === "mine"
        ? "Your ideas, out in the world."
        : mode === "building"
          ? "Less talking. More making."
          : initialQuery
            ? `Let’s find “${initialQuery}”.`
            : "Ideas on the table.";
  return (
    <section className="feed-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            {privateView
              ? "YOUR CORNER OF THE CAFÉ"
              : "THE COMMUNITY, IN PROGRESS"}
          </span>
          <Heading className={landing ? "section-title" : "page-title"}>
            {heading}
            <span className="heading-dot">↘</span>
          </Heading>
        </div>
        {mode === "mine" ? (
          <button
            className="button secondary"
            onClick={() => guard(() => router.push("/new"))}
          >
            <Plus size={17} />
            New idea
          </button>
        ) : (
          <span className="open-seats">
            <span className="live-dot" /> THERE’S A SEAT FOR YOUR IDEA
          </span>
        )}
      </div>
      <div className="feed-layout">
        <div className="feed-main">
          {!privateView && (
            <>
              <div className="feed-tabs" aria-label="Idea feeds">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    aria-pressed={tab === t.key}
                    className={tab === t.key ? "active" : ""}
                  >
                    {t.name}
                    {t.key === "needs-feedback" && <Flame size={13} />}
                  </button>
                ))}
                <button
                  className="filter-toggle icon-button"
                  aria-label="Toggle search and filters"
                  aria-expanded={filtersOpen}
                  onClick={() => setFiltersOpen(!filtersOpen)}
                >
                  <SlidersHorizontal size={16} />
                </button>
              </div>
              <div className="category-filters" aria-label="Categories">
                {categories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    aria-pressed={category === c}
                    className={category === c ? "active" : ""}
                  >
                    {c}
                  </button>
                ))}
              </div>
              {(filtersOpen || mode === "explore" || initialQuery) && (
                <label className="feed-search">
                  Search ideas
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="A problem, a topic, a tiny obsession…"
                  />
                </label>
              )}
            </>
          )}
          {!authorized ? (
            <Empty title="Keep the good ones close.">
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
            <ErrorState error={result.error} retry={() => result.refetch()} />
          ) : ideas.length ? (
            <div className="posts">
              {ideas.map((idea) => (
                <IdeaCard idea={idea} key={idea.id} />
              ))}
              {result.hasNextPage && (
                <button
                  className="button secondary load-more"
                  disabled={result.isFetchingNextPage}
                  onClick={() => result.fetchNextPage()}
                >
                  {result.isFetchingNextPage
                    ? "Pulling up more chairs…"
                    : "A few more ideas"}
                  <ArrowDownIcon />
                </button>
              )}
            </div>
          ) : (
            <Empty
              title={
                mode === "mine"
                  ? "Your first idea is waiting."
                  : mode === "saved"
                    ? "A little empty. A lot of potential."
                    : "No ideas at this table. Yet."
              }
            >
              {mode === "mine"
                ? "A rough thought is enough. You can save a draft before sharing."
                : mode === "saved"
                  ? "Tap the bookmark on any idea to keep it here."
                  : "Try another category or search. Or put your own idea out there."}
            </Empty>
          )}
          <div className="feed-endnote">
            <span>✳</span> Every big thing started as a slightly questionable
            idea.
          </div>
        </div>
        <CommunityRail />
      </div>
    </section>
  );
}
function ArrowDownIcon() {
  return <span aria-hidden="true">↓</span>;
}
function CommunityRail() {
  const building = useBuildingIdeas();
  const { data } = building;
  const { data: roastData } = useFeaturedIdea();
  const roast = roastData?.roasts.find((r) => r.punchline);
  return (
    <aside className="community-rail">
      <section className="rail-welcome">
        <span className="rail-sketch">↗</span>
        <span className="eyebrow">A SMALL REMINDER</span>
        <h3>
          Roast the idea.
          <br />
          <em>Not the human.</em>
        </h3>
        <p>
          Be sharp. Be specific. Leave them with something they can actually
          use.
        </p>
        <SmallLink href="/community">Our table manners</SmallLink>
      </section>
      <section className="rail-section">
        <div className="rail-heading">
          <h3>Out of the notebook</h3>
          <span className="live-dot" />
        </div>
        <p className="muted rail-subtitle">Ideas getting their hands dirty.</p>
        {data?.ideas.map((idea, i) => (
          <Link
            className="building-row"
            href={`/ideas/${idea.id}?tab=journey`}
            key={idea.id}
          >
            <span className="rail-number">0{i + 1}</span>
            <div>
              <strong>{idea.title}</strong>
              <span>
                <i />
                {idea.stage}
                {idea.demo ? " · Demo" : ""}
              </span>
            </div>
            <ArrowUpRight size={15} />
          </Link>
        ))}
        {building.error && (
          <ErrorState error={building.error} retry={() => building.refetch()} />
        )}
        {data?.ideas.length === 0 && (
          <p className="muted">The next build could be yours.</p>
        )}
        <SmallLink href="/building">See what’s being built</SmallLink>
      </section>
      {roast && (
        <section className="roast-pullquote">
          <span className="eyebrow">
            <Flame size={14} /> A ROAST WORTH READING
          </span>
          <blockquote>“{roast.punchline}”</blockquote>
          <div className="quote-author">
            <Avatar person={roast.author} small />
            <div>
              <strong>{roast.author.name}</strong>
              <span>
                {roastData?.idea.demo
                  ? "Demo community feedback"
                  : "Community feedback"}
              </span>
            </div>
          </div>
          <SmallLink href={`/ideas/${roast.ideaId}?tab=roasts`}>
            Read the whole roast
          </SmallLink>
        </section>
      )}
      <section className="rail-coffee">
        <Coffee size={26} strokeWidth={1.4} />
        <p>
          Good feedback is free.
          <br />
          <strong>Gratitude is a nice extra.</strong>
        </p>
        <span>
          Coffee support is optional.
          <br />
          Support goes through creators’ Buy Me a Coffee pages.
        </span>
      </section>
      <div className="rail-footer">
        NO PITCH DECK REQUIRED.
        <br />
        JUST A LITTLE COURAGE.
      </div>
    </aside>
  );
}
