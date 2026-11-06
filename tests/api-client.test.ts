import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("better-auth/react", () => ({ createAuthClient: vi.fn(() => ({})) }));
import { ApiError, api, send } from "../apps/web/src/lib/api";

afterEach(() => vi.unstubAllGlobals());

describe("Browser API requests", () => {
  it("posts creator links to the versioned ideas API with browser ownership", async () => {
    const idea = {
      id: "000000000000000000000101",
      buyMeACoffeeUrl: "https://buymeacoffee.com/BeyondTheSyntax",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json(idea, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await send("/ideas", idea)).toEqual(idea);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/ideas");
    expect(options.credentials).toBe("same-origin");
    expect(options.headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(options.body)).toEqual(idea);
  });

  it("retains server field errors so the editor can identify rejected inputs", async () => {
    const fields = {
      fieldErrors: { buyMeACoffeeUrl: ["Use your creator page."] },
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: "Check your link.", fields }, { status: 400 }),
        ),
    );
    const failure = await send("/ideas", {}).catch((error) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      status: 400,
      message: "Check your link.",
      fields,
    });
  });

  it("rejects an HTML success response instead of navigating to an undefined idea", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<html>Unavailable</html>", { status: 200 }),
        ),
    );
    await expect(send("/ideas", {})).rejects.toMatchObject({ status: 502 });
  });

  it("allows the browser to set multipart boundaries and preserves custom headers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ id: "image-id" }));
    vi.stubGlobal("fetch", fetchMock);
    const body = new FormData();
    body.set("image", new Blob(["image"]), "cover.png");
    await api("/media", {
      method: "POST",
      body,
      headers: new Headers({ "X-Request-Id": "upload-1" }),
    });
    const options = fetchMock.mock.calls[0][1];
    expect(options.headers.has("Content-Type")).toBe(false);
    expect(options.headers.get("X-Request-Id")).toBe("upload-1");
    expect(options.body).toBe(body);
  });
});
