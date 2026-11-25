"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe2, RefreshCw, Users } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "./providers";
import { ErrorState } from "./ui";

type Online = {
  online: number;
  activeWindowSeconds: number;
  totalVisitors?: number;
};
type Location = {
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
};
type Analytics = Online & {
  visitorsToday: number;
  visitors30d: number;
  windowDays: number;
  topLocations: (Location & { visitors: number })[];
  recentVisitors: (Location & {
    id: string;
    ip: string | null;
    path: string;
    lastSeenAt: string;
  })[];
};

const onlineKey = ["visitor-online"];
const refreshInterval = 30_000;

function formatVisitorTotal(totalVisitors: number) {
  return new Intl.NumberFormat("en", {
    notation: totalVisitors >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(totalVisitors);
}

function visitorTotalTitle(totalVisitors: number) {
  return `${totalVisitors.toLocaleString()} browser visitors recorded since tracking began. Different browsers and cleared or expired cookies can count again.`;
}

export function VisitorTracker() {
  const pathname = usePathname();
  const { loading } = useApp();
  const client = useQueryClient();

  useEffect(() => {
    if (loading) return;
    let request: AbortController | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    async function heartbeat() {
      if (document.visibilityState !== "visible" || request) return;
      const controller = new AbortController();
      request = controller;
      timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const result = await api<Online>("/analytics/heartbeat", {
          method: "POST",
          body: JSON.stringify({ path: pathname }),
          cache: "no-store",
          signal: controller.signal,
        });
        if (!disposed && !controller.signal.aborted)
          client.setQueryData(onlineKey, result);
      } catch {
        // Analytics must never interrupt browsing or show a false zero.
      } finally {
        clearTimeout(timeout);
        request = undefined;
      }
    }
    void heartbeat();
    const interval = setInterval(() => void heartbeat(), refreshInterval);
    const resume = () => void heartbeat();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      disposed = true;
      clearInterval(interval);
      clearTimeout(timeout);
      request?.abort();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [pathname, loading, client]);

  return null;
}

export function OnlineBadge() {
  const { data, isError } = useQuery({
    queryKey: onlineKey,
    queryFn: () => api<Online>("/analytics/online", { cache: "no-store" }),
    refetchInterval: refreshInterval,
    refetchOnWindowFocus: true,
  });
  const available = data !== undefined && !isError;
  const totalVisitors = data?.totalVisitors;
  return (
    <span className="visitor-counts">
      <span
        className={`online-badge ${available ? "is-live" : ""}`}
        title={
          available
            ? `Browsers active in the last ${data.activeWindowSeconds} seconds. Updates every 30 seconds.`
            : "Live visitor count is temporarily unavailable."
        }
      >
        <i aria-hidden="true" />
        {available
          ? `${data.online.toLocaleString()} online`
          : isError
            ? "Online unavailable"
            : "Checking online…"}
      </span>
      {available && typeof totalVisitors === "number" && (
        <span
          className="total-visitors"
          title={visitorTotalTitle(totalVisitors)}
        >
          {formatVisitorTotal(totalVisitors)} total visitors
        </span>
      )}
    </span>
  );
}

export function SidebarTotalVisitors() {
  // The header and heartbeat keep this query fresh; this observer adds no polling.
  const { data, isError, isPending } = useQuery<Online>({
    queryKey: onlineKey,
    queryFn: () => api<Online>("/analytics/online", { cache: "no-store" }),
    enabled: false,
  });
  const totalVisitors = isError ? undefined : data?.totalVisitors;
  const available = typeof totalVisitors === "number";
  return (
    <div
      className="sidebar-visitors"
      title={
        available
          ? visitorTotalTitle(totalVisitors)
          : isPending
            ? "Checking total visitors…"
            : "Total visitor count is temporarily unavailable."
      }
    >
      <Users size={19} strokeWidth={1.7} aria-hidden="true" />
      <div>
        <span>Total visitors</span>
        <strong>
          {available ? formatVisitorTotal(totalVisitors) : isPending ? "…" : "—"}
        </strong>
      </div>
    </div>
  );
}

function locationName(location: Location) {
  return (
    [
      ...new Set(
        [location.city, location.region, location.country].filter(Boolean),
      ),
    ].join(", ") || "Location unavailable"
  );
}

export function VisitorAnalytics() {
  const result = useQuery({
    queryKey: ["admin", "analytics"],
    queryFn: () => api<Analytics>("/admin/analytics", { cache: "no-store" }),
    refetchInterval: refreshInterval,
    refetchOnWindowFocus: true,
  });
  if (result.isPending)
    return (
      <p className="analytics-loading" role="status">
        Loading visitor activity…
      </p>
    );
  if (result.error)
    return (
      <ErrorState error={result.error} retry={() => void result.refetch()} />
    );

  const data = result.data;
  const highest = Math.max(
    1,
    ...data.topLocations.map((location) => location.visitors),
  );
  return (
    <section className="visitor-analytics" aria-labelledby="analytics-title">
      <div className="analytics-heading">
        <div>
          <span className="eyebrow">
            <Users size={16} /> VISITOR ACTIVITY
          </span>
          <h2 id="analytics-title">Who’s at the table?</h2>
          <p>Live activity and the places your visitors come from.</p>
        </div>
        <button
          className="button secondary"
          type="button"
          disabled={result.isFetching}
          onClick={() => void result.refetch()}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {result.isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <dl className="analytics-metrics">
        <div>
          <dt>
            <i className="analytics-live-dot" aria-hidden="true" /> Online now
          </dt>
          <dd>
            {data.online.toLocaleString()}
            <span>
              Active in the last {data.activeWindowSeconds / 60} minutes
            </span>
          </dd>
        </div>
        <div>
          <dt>Total visitors</dt>
          <dd>
            {data.totalVisitors?.toLocaleString() ?? "Total unavailable"}
            <span>Browsers recorded since tracking began</span>
          </dd>
        </div>
        <div>
          <dt>Visitors today</dt>
          <dd>
            {data.visitorsToday.toLocaleString()}
            <span>Unique browsers seen today (UTC)</span>
          </dd>
        </div>
        <div>
          <dt>Visitors in {data.windowDays} days</dt>
          <dd>
            {data.visitors30d.toLocaleString()}
            <span>Unique browsers, including returning visitors</span>
          </dd>
        </div>
      </dl>
      <div className="analytics-locations">
        <div className="analytics-section-heading">
          <h3>
            <Globe2 size={19} aria-hidden="true" /> Top visitor locations
          </h3>
          <span>Last {data.windowDays} days · unique browsers</span>
        </div>
        {data.topLocations.length ? (
          <ol className="analytics-location-list">
            {data.topLocations.map((location, index) => (
              <li
                key={`${location.countryCode}-${location.region}-${location.city}-${index}`}
              >
                <div>
                  <span>{locationName(location)}</span>
                  <strong>
                    {location.visitors.toLocaleString()}{" "}
                    <small>
                      {location.visitors === 1 ? "visitor" : "visitors"}
                    </small>
                  </strong>
                </div>
                <div className="analytics-location-track" aria-hidden="true">
                  <div
                    style={{ width: `${(location.visitors / highest) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="analytics-empty">
            No visitor locations yet. They’ll appear as people visit your site.
          </p>
        )}
      </div>
      <div className="analytics-section-heading">
        <h3>Recent visitors</h3>
        <span>
          Latest {data.recentVisitors.length} browsers · visible only to
          moderators
        </span>
      </div>
      {data.recentVisitors.length ? (
        <div
          className="analytics-table-scroll"
          role="region"
          aria-label="Recent visitor details"
          tabIndex={0}
        >
          <table className="analytics-table">
            <caption className="sr-only">
              Recently active browsers and their last recorded IP address and
              approximate location
            </caption>
            <thead>
              <tr>
                <th scope="col">IP address</th>
                <th scope="col">Location</th>
                <th scope="col">Last page</th>
                <th scope="col">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {data.recentVisitors.map((visitor) => (
                <tr key={visitor.id}>
                  <td>
                    <code>{visitor.ip || "Unavailable"}</code>
                  </td>
                  <td>{locationName(visitor)}</td>
                  <td>
                    <code>{visitor.path}</code>
                  </td>
                  <td>
                    <time dateTime={visitor.lastSeenAt}>
                      {new Date(visitor.lastSeenAt).toLocaleString("en", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="analytics-empty">
          No visitors recorded yet. Open the site in another browser to get
          started.
        </p>
      )}
      <p className="analytics-note">
        Updates every 30 seconds. Each browser counts once across tabs;
        different devices count separately. IP-based locations are approximate
        and may reflect a VPN or network provider. Unresolved locations appear
        as unavailable. Activity records are kept for {data.windowDays} days;
        the anonymous total remains. Cleared or expired cookies can count as a
        new visitor.
      </p>
    </section>
  );
}
