// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { defaultCommunityConfig } from "../packages/domain/src/index";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  send: vi.fn(),
  push: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("../apps/web/src/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../apps/web/src/lib/api")>()),
  api: mocks.api,
  send: mocks.send,
}));
vi.mock("../apps/web/src/components/providers", () => ({
  useApp: () => ({
    me: { user: { id: "visitor-1" } },
    loading: false,
    guard: (fn: () => void) => fn(),
    toast: mocks.toast,
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: ReactNode }) =>
    createElement("a", props, children),
}));
vi.mock("../apps/web/src/components/coffee", () => ({
  coffeeSignupUrl: "https://buymeacoffee.com/signup",
}));
vi.mock("../apps/web/src/components/ui", () => ({
  Empty: () => null,
  ErrorState: () => null,
  Modal: () => null,
  Cover: () => null,
  Loading: () => null,
}));
import { IdeaEditor } from "../apps/web/src/components/editor";
import { ApiError } from "../apps/web/src/lib/api";

let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.api.mockResolvedValue(defaultCommunityConfig);
});
afterEach(() => {
  cleanup();
  client.clear();
});

function editor() {
  render(
    createElement(QueryClientProvider, { client }, createElement(IdeaEditor)),
  );
  fireEvent.change(screen.getByLabelText(/Give it a good title/), {
    target: { value: "A useful shared repair shelf" },
  });
  fireEvent.change(screen.getByLabelText(/The short version/), {
    target: {
      value:
        "Neighbors can borrow tools and practice repairing everyday items together.",
    },
  });
}

it.each([
  "https://buymeacoffee.com/BeyondTheSyntax",
  "buymeacoffee.com/BeyondTheSyntax",
])(
  "publishes a creator link (%s) and sends restored tags",
  async (creatorLink) => {
    localStorage.setItem(
      "rt:idea:v2:visitor-1",
      JSON.stringify({ tags: ["repair", "community"] }),
    );
    mocks.send.mockResolvedValue({
      id: "000000000000000000000101",
      status: "published",
    });
    editor();
    fireEvent.change(screen.getByLabelText(/Your Buy Me a Coffee link/), {
      target: { value: creatorLink },
    });
    expect((screen.getByLabelText(/Tags/) as HTMLInputElement).value).toBe(
      "repair, community",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Put it on the table" }),
    );
    await waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith(
        "/ideas",
        expect.objectContaining({
          buyMeACoffeeUrl: "https://buymeacoffee.com/BeyondTheSyntax",
          tags: ["repair", "community"],
          status: "published",
        }),
        "POST",
      ),
    );
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        "/ideas/000000000000000000000101",
      ),
    );
  },
);

it("shows a link validation error and keeps the draft when a lookalike domain is pasted", async () => {
  editor();
  fireEvent.change(screen.getByLabelText(/Your Buy Me a Coffee link/), {
    target: { value: "https://buymeacoffee.com.evil.test/BeyondTheSyntax" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Put it on the table" }));
  await waitFor(() =>
    expect(screen.getByText(/Use your creator page/)).toBeTruthy(),
  );
  expect(mocks.send).not.toHaveBeenCalled();
  expect(localStorage.getItem("rt:idea:v2:visitor-1")).toContain(
    "A useful shared repair shelf",
  );
});

it("connects API validation errors to the coffee field and retains all entered content", async () => {
  mocks.send.mockRejectedValue(
    new ApiError(400, "Check your support link.", {
      fieldErrors: { buyMeACoffeeUrl: ["This creator page is unavailable."] },
    }),
  );
  editor();
  const link = screen.getByLabelText(
    /Your Buy Me a Coffee link/,
  ) as HTMLInputElement;
  fireEvent.change(link, {
    target: { value: "https://buymeacoffee.com/BeyondTheSyntax" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Put it on the table" }));
  await waitFor(() =>
    expect(screen.getByText("This creator page is unavailable.")).toBeTruthy(),
  );
  expect(link.getAttribute("aria-invalid")).toBe("true");
  expect(link.value).toBe("https://buymeacoffee.com/BeyondTheSyntax");
  expect(mocks.push).not.toHaveBeenCalled();
});
