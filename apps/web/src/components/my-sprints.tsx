"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { SprintPage } from "@roast/domain";
import { api } from "@/lib/api";
import { Empty, ErrorState, Loading } from "./ui";
import { useApp } from "./providers";

const dayMs = 24 * 60 * 60 * 1000;
export function MySprints() {
  const { me, loading } = useApp();
  const [state, setState] = useState<"active" | "completed">("active");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const result = useInfiniteQuery({
    queryKey: ["my-sprints", me?.user?.id, state],
    enabled: Boolean(me?.user),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api<SprintPage>(`/my-sprints?state=${state}&offset=${pageParam}`),
    getNextPageParam: (page) => page.nextOffset ?? undefined,
  });
  const items = result.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div className="sprints-page">
      <header className="sprints-heading">
        <span className="eyebrow">FROM IDEA TO EVIDENCE</span>
        <h1>My Sprints</h1>
        <p>Your next small test, and what you learned from the last one.</p>
        <Link className="button secondary" href="/my-ideas">
          Start a sprint from my ideas
        </Link>
      </header>
      <div className="sprints-filters" role="group" aria-label="Sprint status">
        {(["active", "completed"] as const).map((value) => (
          <button
            key={value}
            className={`button ${state === value ? "primary" : "secondary"}`}
            aria-pressed={state === value}
            onClick={() => setState(value)}
          >
            {value === "active" ? "Active sprints" : "Completed sprints"}
          </button>
        ))}
      </div>
      {loading || (me?.user && result.isPending) ? (
        <Loading />
      ) : !me?.user ? (
        <Empty title="Your sprints belong here.">
          Refresh this page to reconnect to your browser identity.
        </Empty>
      ) : result.isError && !result.data ? (
        <ErrorState error={result.error} retry={() => result.refetch()} />
      ) : (
        <>
          {!items.length && (
            <Empty
              title={
                state === "active"
                  ? "Your next seven days start here."
                  : "No completed sprints yet."
              }
            >
              {state === "active"
                ? "Open an idea you own and choose Start a seven-day sprint. Pick one assumption and a small test."
                : "Finish an active sprint with evidence and a decision to keep your learning here."}
              <br />
                <Link
                  className="text-link"
                  href={state === "active" ? "/new" : "/my-ideas"}
                >
                  {state === "active"
                    ? "Pitch your first idea"
                    : "Open my ideas"}
                </Link>
            </Empty>
          )}
          <div className="sprints-grid">
            {items.map((item) => {
              const complete = ["Complete", "Inconclusive"].includes(
                item.status || "",
              );
              const elapsed = Math.max(
                0,
                now - Date.parse(item.sprint.startedAt),
              );
              const day = Math.min(7, Math.floor(elapsed / dayMs) + 1);
              const overdue = now >= Date.parse(item.sprint.deadline);
              const guidance =
                day <= 2
                  ? "Sharpen your pitch and ask relevant people for feedback."
                  : day <= 6
                    ? "Run your small test with potential customers and record what happens."
                    : "Compare your evidence with your success criteria and decide your next move.";
              const href = `/ideas/${item.ideaId}?tab=journey#sprint-${item.id}`;
              return (
                <article
                  className="experiment-card sprint-dashboard-card"
                  key={item.id}
                >
                  <div className="suggestion-labels">
                    <span className="eyebrow">
                      {complete
                        ? "SPRINT RECORD"
                        : overdue
                          ? "READY FOR REVIEW"
                          : `DAY ${day} OF 7`}
                    </span>
                    <span className="stage progress">
                      {item.status || "Planned"}
                    </span>
                  </div>
                  <h2>
                    <Link href={href}>{item.ideaTitle}</Link>
                  </h2>
                  <p>
                    <strong>Assumption:</strong> {item.hypothesis}
                  </p>
                  <p>
                    <strong>Target customer:</strong>{" "}
                    {item.sprint.targetCustomer}
                  </p>
                  <p>
                    <strong>Deadline:</strong>{" "}
                    <time dateTime={item.sprint.deadline}>
                      {new Date(item.sprint.deadline).toLocaleString(
                        undefined,
                        { dateStyle: "medium", timeStyle: "short" },
                      )}
                    </time>
                  </p>
                  {!complete && (
                    <>
                      <progress
                        value={Math.min(elapsed / dayMs, 7)}
                        max={7}
                        aria-label="Time elapsed in seven-day sprint"
                      />
                      <p className="fine-print">
                        Timeline progress reflects time elapsed, not tasks
                        completed.
                      </p>
                      <p>
                        <strong>Next action:</strong> {guidance}
                      </p>
                      <p>
                        <strong>Your test:</strong> {item.body}
                      </p>
                    </>
                  )}
                  {complete && (
                    <>
                      <p>
                        <strong>Evidence:</strong> {item.outcome}
                      </p>
                      <p>
                        <strong>Decision:</strong> {item.decision}
                      </p>
                    </>
                  )}
                  <div className="sprint-card-actions">
                    <Link className="button primary" href={href}>
                      {complete ? "Review results" : "Finish sprint"}
                    </Link>
                    {!complete && (
                      <Link
                        className="text-link"
                        href={
                          day <= 2 ? `/ideas/${item.ideaId}?tab=roasts` : href
                        }
                      >
                        {day <= 2 ? "Review feedback" : "Update progress"}
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {result.isError && result.data && (
            <ErrorState
              error={result.error}
              retry={() => result.fetchNextPage()}
            />
          )}
          {result.hasNextPage && (
            <button
              className="button secondary"
              disabled={result.isFetchingNextPage}
              onClick={() => result.fetchNextPage()}
            >
              {result.isFetchingNextPage ? "Loading…" : "Load more sprints"}
            </button>
          )}
        </>
      )}
      <p className="fine-print">
        {me?.user?.anonymous ? <>Keep these sprints when you change devices. <Link className="text-link" href="/account">Save my workspace</Link></> : <Link className="text-link" href="/account">Manage your account and sprint reminders</Link>}
      </p>
    </div>
  );
}
