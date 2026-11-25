// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  path: "/feed",
  loading: false,
  me: { user: { id: "visitor-1" }, profile: { role: "admin" } },
}));
vi.mock("../apps/web/src/lib/api", () => ({
  api: mocks.api,
}));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.path }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: ReactNode }) =>
    createElement("a", props, children),
}));
vi.mock("../apps/web/src/components/providers", () => ({
  useApp: () => ({ me: mocks.me, loading: mocks.loading }),
}));
import {
  OnlineBadge,
  VisitorAnalytics,
  VisitorTracker,
} from "../apps/web/src/components/visitor-analytics";

let client: QueryClient;
beforeEach(() => {
  mocks.api.mockReset().mockResolvedValue({
    online: 1,
    totalVisitors: 123,
    activeWindowSeconds: 120,
  });
  mocks.loading = false;
  mocks.path = "/feed";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  window.history.replaceState(null, "", "/feed");
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
});
function show(component: ReactNode) {
  return render(createElement(QueryClientProvider, { client }, component));
}
function visibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
  fireEvent(document, new Event("visibilitychange"));
}

const analytics = {
  online: 3,
  totalVisitors: 123,
  visitorsToday: 8,
  visitors30d: 21,
  windowDays: 30,
  activeWindowSeconds: 120,
  topLocations: [
    {
      city: "Mumbai",
      region: "Maharashtra",
      country: "India",
      countryCode: "IN",
      visitors: 13,
    },
  ],
  recentVisitors: [
    {
      id: "visitor-1",
      ip: "203.0.113.4",
      city: "Mumbai",
      region: "Maharashtra",
      country: "India",
      countryCode: "IN",
      path: "/explore",
      lastSeenAt: "2026-11-25T12:00:00.000Z",
    },
  ],
};

it("waits for identity, heartbeats only while visible, and stops after unmount", async () => {
  vi.useFakeTimers();
  mocks.loading = true;
  const view = show(createElement(VisitorTracker));
  expect(mocks.api).not.toHaveBeenCalled();
  mocks.loading = false;
  await act(async () => {
    view.rerender(
      createElement(
        QueryClientProvider,
        { client },
        createElement(VisitorTracker),
      ),
    );
  });
  expect(mocks.api).toHaveBeenCalledTimes(1);
  expect(mocks.api).toHaveBeenLastCalledWith(
    "/analytics/heartbeat",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ path: "/feed" }),
    }),
  );

  visibility("hidden");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60000);
  });
  expect(mocks.api).toHaveBeenCalledTimes(1);
  await act(async () => visibility("visible"));
  expect(mocks.api).toHaveBeenCalledTimes(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30000);
  });
  expect(mocks.api).toHaveBeenCalledTimes(3);

  view.unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60000);
    visibility("hidden");
    visibility("visible");
  });
  expect(mocks.api).toHaveBeenCalledTimes(3);
});

it("tracks navigation with the pathname and excludes search terms and fragments", async () => {
  mocks.path = "/explore";
  window.history.replaceState(
    null,
    "",
    "/explore?q=private-search#private-anchor",
  );
  const view = show(createElement(VisitorTracker));
  await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
  expect(mocks.api).toHaveBeenLastCalledWith(
    "/analytics/heartbeat",
    expect.objectContaining({
      body: JSON.stringify({ path: "/explore" }),
    }),
  );

  mocks.path = "/saved";
  view.rerender(
    createElement(
      QueryClientProvider,
      { client },
      createElement(VisitorTracker),
    ),
  );
  await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
  expect(mocks.api).toHaveBeenLastCalledWith(
    "/analytics/heartbeat",
    expect.objectContaining({
      body: JSON.stringify({ path: "/saved" }),
    }),
  );
  expect(JSON.stringify(mocks.api.mock.calls)).not.toContain("private-search");
  expect(JSON.stringify(mocks.api.mock.calls)).not.toContain("private-anchor");
});

it("shows an unavailable count after an error instead of inventing zero visitors", async () => {
  mocks.api.mockRejectedValue(new Error("Offline"));
  show(createElement(OnlineBadge));
  expect(screen.getByText("Checking online…")).toBeTruthy();
  await waitFor(() =>
    expect(screen.getByText("Online unavailable")).toBeTruthy(),
  );
  expect(screen.queryByText("0 online")).toBeNull();
  expect(screen.queryByText(/total visitors/i)).toBeNull();
});

it("displays current online and all-time visitor counts without requesting private analytics", async () => {
  mocks.api.mockResolvedValue({
    online: 7,
    totalVisitors: 123,
    activeWindowSeconds: 120,
  });
  show(createElement(OnlineBadge));
  await waitFor(() => expect(screen.getByText("7 online")).toBeTruthy());
  expect(screen.getByText("123 total visitors")).toBeTruthy();
  expect(mocks.api.mock.calls.map(([path]) => path)).toEqual([
    "/analytics/online",
  ]);
  expect(screen.getByText("7 online").title).toContain("120 seconds");
});

it("displays a real zero total from the API in both the header and admin metrics", async () => {
  mocks.api.mockResolvedValue({ ...analytics, online: 0, totalVisitors: 0 });
  show(
    createElement(
      "div",
      {},
      createElement(OnlineBadge),
      createElement(VisitorAnalytics),
    ),
  );
  await waitFor(() =>
    expect(screen.getByText("0 total visitors")).toBeTruthy(),
  );
  expect(screen.getByText("0 online")).toBeTruthy();
  await waitFor(() => expect(screen.getByText("Total visitors")).toBeTruthy());
  expect(
    screen.getByText("Total visitors").nextElementSibling?.firstChild
      ?.textContent,
  ).toBe("0");
  expect(screen.queryByText("Total unavailable")).toBeNull();
});

it("keeps a large total compact while exposing its exact count in the title", async () => {
  mocks.api.mockResolvedValue({
    online: 7,
    totalVisitors: 12345,
    activeWindowSeconds: 120,
  });
  show(createElement(OnlineBadge));
  await waitFor(() =>
    expect(screen.getByText("12.3K total visitors")).toBeTruthy(),
  );
  expect(screen.getByText("12.3K total visitors").title).toContain(
    "12,345 browser visitors recorded since tracking began",
  );
  expect(screen.getByText("7 online")).toBeTruthy();
});

it("handles an older API without an all-time total without inventing zero", async () => {
  const { totalVisitors: _totalVisitors, ...legacy } = analytics;
  mocks.api.mockResolvedValue(legacy);
  show(
    createElement(
      "div",
      {},
      createElement(OnlineBadge),
      createElement(VisitorAnalytics),
    ),
  );
  await waitFor(() => expect(screen.getByText("3 online")).toBeTruthy());
  await waitFor(() =>
    expect(screen.getByText("Total unavailable")).toBeTruthy(),
  );
  expect(screen.queryByText(/\d+ total visitors/)).toBeNull();
  expect(
    screen.getByText("Total visitors").nextElementSibling?.textContent,
  ).not.toBe("0");
  expect(screen.getByText("203.0.113.4")).toBeTruthy();
});

it("renders ranked locations and the moderator-only visitor IP table", async () => {
  mocks.api.mockResolvedValue(analytics);
  show(createElement(VisitorAnalytics));
  await waitFor(() => expect(screen.getByText("203.0.113.4")).toBeTruthy());
  expect(
    screen.getByText("Total visitors").nextElementSibling?.firstChild
      ?.textContent,
  ).toBe("123");
  expect(
    screen.getByText("Browsers recorded since tracking began"),
  ).toBeTruthy();
  expect(
    screen.getByText("Visitors today").nextElementSibling?.firstChild
      ?.textContent,
  ).toBe("8");
  expect(
    screen.getByText("Visitors in 30 days").nextElementSibling?.firstChild
      ?.textContent,
  ).toBe("21");
  const ranking = screen.getByRole("list");
  expect(within(ranking).getByText("Mumbai, Maharashtra, India")).toBeTruthy();
  expect(within(ranking).getByText(/13/).textContent).toContain("13 visitors");
  const table = screen.getByRole("table");
  expect(
    within(table).getByRole("columnheader", { name: "IP address" }),
  ).toBeTruthy();
  expect(within(table).getByText("/explore")).toBeTruthy();
  expect(within(table).getByText("Mumbai, Maharashtra, India")).toBeTruthy();
  expect(table.querySelector("time")?.dateTime).toBe(
    "2026-11-25T12:00:00.000Z",
  );
  expect(mocks.api).toHaveBeenCalledWith("/admin/analytics", {
    cache: "no-store",
  });
});

it("explains empty analytics without displaying placeholder visitors", async () => {
  mocks.api.mockResolvedValue({
    ...analytics,
    online: 0,
    visitorsToday: 0,
    visitors30d: 0,
    topLocations: [],
    recentVisitors: [],
  });
  show(createElement(VisitorAnalytics));
  await waitFor(() =>
    expect(screen.getByText(/No visitor locations yet/)).toBeTruthy(),
  );
  expect(screen.getByText(/No visitors recorded yet/)).toBeTruthy();
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.queryByText("203.0.113.4")).toBeNull();
});

it("lets a moderator retry a failed analytics request", async () => {
  mocks.api.mockRejectedValueOnce(
    new Error("Visitor activity is unavailable."),
  );
  mocks.api.mockResolvedValue(analytics);
  show(createElement(VisitorAnalytics));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "Visitor activity is unavailable.",
    ),
  );
  expect(screen.queryByText("Total visitors")).toBeNull();
  expect(screen.queryByText("0 total visitors")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.getByText("203.0.113.4")).toBeTruthy());
  expect(screen.queryByRole("alert")).toBeNull();
  expect(mocks.api).toHaveBeenCalledTimes(2);
});
