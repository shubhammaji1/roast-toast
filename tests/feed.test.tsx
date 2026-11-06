// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

const mocks = vi.hoisted(() => ({ api: vi.fn(), push: vi.fn() }));
vi.mock("../apps/web/src/lib/api", () => ({ api: mocks.api }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: ReactNode }) =>
    createElement("a", props, children),
}));
vi.mock("../apps/web/src/components/providers", () => ({
  useApp: () => ({ me: null, guard: (action: () => void) => action() }),
}));
vi.mock("../apps/web/src/components/idea-card", () => ({
  IdeaCard: () => null,
}));
vi.mock("../apps/web/src/components/ui", () => ({
  Avatar: () => null,
  Cover: ({ kind, mediaId }: { kind: string; mediaId?: string }) =>
    createElement("div", {
      "data-testid": "cover",
      "data-kind": kind,
      "data-media": mediaId,
    }),
  DemoLabel: () => createElement("span", {}, "DEMO IDEA"),
  Empty: ({ title, children }: { title: string; children: ReactNode }) =>
    createElement("div", {}, title, children),
  ErrorState: ({ error, retry }: { error: Error; retry: () => void }) =>
    createElement(
      "div",
      { role: "alert" },
      error.message,
      createElement("button", { onClick: retry }, "Try again"),
    ),
  Loading: () => createElement("div", { role: "status" }, "Loading ideas"),
  SmallLink: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
  Stage: ({ stage }: { stage: string }) => createElement("span", {}, stage),
}));
import { Landing } from "../apps/web/src/components/feed";

const idea = {
  id: "abcdefabcdefabcdefabcdef",
  title: "A real community publishing idea",
  category: "Tech",
  stage: "Building",
  demo: false,
  cover: "fieldnotes",
  coverImage: "fedcbafedcbafedcbafedcba",
  author: { name: "Real Maker", username: "realmaker" },
};
const detail = {
  idea,
  roasts: [
    {
      ideaId: idea.id,
      punchline: "Start small and learn.",
      author: { name: "Helpful Neighbor" },
    },
  ],
};
let client: QueryClient;
beforeEach(() => {
  mocks.api.mockReset();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
});
function showLanding() {
  return render(
    createElement(QueryClientProvider, { client }, createElement(Landing)),
  );
}
function serveIdeas(path: string) {
  if (path === "/ideas?limit=1") return Promise.resolve({ ideas: [idea] });
  if (path === `/ideas/${idea.id}`) return Promise.resolve(detail);
  if (path === "/ideas?tab=building&limit=3")
    return Promise.resolve({ ideas: [idea] });
  return Promise.resolve({ ideas: [], nextCursor: null });
}

it("features a returned idea ID and its real artwork without requesting a seeded demo", async () => {
  mocks.api.mockImplementation(serveIdeas);
  const { container } = showLanding();
  await waitFor(() =>
    expect(
      container.querySelector(".featured-idea h2 a")?.getAttribute("href"),
    ).toBe(`/ideas/${idea.id}`),
  );
  expect(
    container
      .querySelector(".featured-idea [data-testid=cover]")
      ?.getAttribute("data-media"),
  ).toBe(idea.coverImage);
  expect(
    container
      .querySelector(".featured-idea [data-testid=cover]")
      ?.getAttribute("data-kind"),
  ).toBe("fieldnotes");
  expect(screen.queryByText("DEMO IDEA")).toBeNull();
  expect(screen.queryByText("Demo community feedback")).toBeNull();
  expect(screen.getByText("Community feedback")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Follow the build" }).getAttribute("href"),
  ).toBe(`/ideas/${idea.id}?tab=journey`);
  expect(
    mocks.api.mock.calls.filter(([path]) => path === `/ideas/${idea.id}`),
  ).toHaveLength(1);
  expect(
    mocks.api.mock.calls.every(
      ([path]) => !String(path).includes("00000000000000000000010"),
    ),
  ).toBe(true);
});

it("shows an honest empty preview and never requests an undefined idea on an empty community", async () => {
  mocks.api.mockResolvedValue({ ideas: [], nextCursor: null });
  const { container } = showLanding();
  await screen.findByText("Be the first to put an idea on the table.");
  expect(container.querySelector(".featured-idea")).toBeNull();
  expect(
    screen
      .getByRole("link", { name: "Explore build journeys" })
      .getAttribute("href"),
  ).toBe("/building");
  expect(mocks.api.mock.calls.some(([path]) => /^\/ideas\//.test(path))).toBe(
    false,
  );
});

it("exposes a retry for a failed featured request and loads the real idea after recovery", async () => {
  let available = false;
  mocks.api.mockImplementation((path: string) => {
    if (path === "/ideas?limit=1" && !available)
      return Promise.reject(new Error("Publishing service is unavailable."));
    return serveIdeas(path);
  });
  const { container } = showLanding();
  await screen.findByRole("alert");
  expect(screen.getByText("Publishing service is unavailable.")).toBeTruthy();
  available = true;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(container.querySelector(".featured-idea h2")?.textContent).toBe(
      idea.title,
    ),
  );
  expect(screen.queryByRole("alert")).toBeNull();
});
