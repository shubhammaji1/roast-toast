// @vitest-environment jsdom
import { it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
const mocks = vi.hoisted(() => ({ send: vi.fn(), toast: vi.fn() }));
vi.mock("../apps/web/src/lib/api", () => ({ send: mocks.send }));
vi.mock("../apps/web/src/components/providers", () => ({
  useApp: () => ({ toast: mocks.toast }),
}));
import { useIdeaReaction } from "../apps/web/src/lib/use-idea-reaction";

it("shows interest immediately and restores all cached views if the server rejects it", async () => {
  let reject!: (error: Error) => void;
  mocks.send.mockImplementation(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const idea = {
    id: "idea-1",
    authorId: "author-1",
    title: "A useful idea",
    interested: false,
    interests: 3,
    saved: false,
  };
  client.setQueryData(["ideas", "feed"], {
    pages: [{ ideas: [idea], nextCursor: null }],
    pageParams: [""],
  });
  client.setQueryData(["idea", "idea-1"], { idea, roasts: [] });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const { result } = renderHook(() => useIdeaReaction("idea-1"), { wrapper });
  act(() => result.current.mutate({ kind: "interest", active: true }));
  await waitFor(() =>
    expect(client.getQueryData<any>(["idea", "idea-1"]).idea.interested).toBe(
      true,
    ),
  );
  expect(
    client.getQueryData<any>(["ideas", "feed"]).pages[0].ideas[0].interests,
  ).toBe(4);
  await act(async () => {
    reject(new Error("The connection dropped. Your change was not saved."));
  });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(client.getQueryData<any>(["idea", "idea-1"]).idea).toEqual(idea);
  expect(client.getQueryData<any>(["ideas", "feed"]).pages[0].ideas[0]).toEqual(
    idea,
  );
  expect(mocks.toast).toHaveBeenCalledWith(
    "The connection dropped. Your change was not saved.",
  );
  client.clear();
});
