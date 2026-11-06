import { test, expect, type Locator, type Page } from "@playwright/test";

const widths = [320, 390, 768, 1024, 1440, 1920];
const ideaId = "ffffffffffffffffffffffff";
const longTitle = "W".repeat(140);

async function expectPageToFit(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(1);
}

async function expectTextToWrap(locator: Locator) {
  await expect(locator).toBeVisible();
  expect(
    await locator.evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
}

for (const width of widths) {
  test(`long titles and author names fit the ${width}px layout`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const seedResponse = await request.get(
      "/api/v1/ideas/000000000000000000000101",
    );
    expect(seedResponse.ok()).toBe(true);
    const detail = await seedResponse.json();
    const idea = {
      ...detail.idea,
      id: ideaId,
      title: longTitle,
      cover: undefined,
      coverImage: undefined,
      demo: false,
      author: {
        ...detail.idea.author,
        name: "N".repeat(60),
        username: "u".repeat(24),
      },
    };
    const roasts = detail.roasts.map((roast: Record<string, any>) => ({
      ...roast,
      punchline: "P".repeat(240),
      author: { ...roast.author, name: "N".repeat(60) },
    }));
    await page.route("**/api/v1/ideas**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/v1/ideas")
        return route.fulfill({ json: { ideas: [idea], nextCursor: null } });
      if (path === `/api/v1/ideas/${ideaId}`)
        return route.fulfill({ json: { ...detail, idea, roasts } });
      return route.continue();
    });

    await page.goto("/");
    const featured = page.locator(".featured-idea.text-only");
    await expect(featured.locator("h2")).toHaveText(longTitle);
    await page.evaluate(() => document.fonts.ready);
    await expect(featured.locator("h2 a")).toHaveAttribute(
      "href",
      `/ideas/${ideaId}`,
    );
    await expectTextToWrap(featured.locator("h2"));
    await expectPageToFit(page);
    await expect(
      page.locator(".topbar").getByRole("link", { name: "Notifications" }),
    ).toBeVisible();

    if (width <= 700) {
      await expect(page.locator(".sidebar")).toBeHidden();
      await expect(
        page.getByRole("navigation", { name: "Mobile navigation" }),
      ).toBeVisible();
      expect(
        await featured.evaluate((element) => {
          const copy = element.querySelector(".featured-copy")!;
          return element.clientWidth - copy.getBoundingClientRect().width;
        }),
      ).toBeLessThanOrEqual(2);
    } else {
      await expect(page.locator(".sidebar")).toBeVisible();
      await page.getByRole("button", { name: "Collapse navigation" }).click();
      await expect
        .poll(() =>
          page
            .locator(".sidebar")
            .evaluate((element) =>
              Math.round(element.getBoundingClientRect().width),
            ),
        )
        .toBe(78);
      await expectPageToFit(page);
      await page.getByRole("button", { name: "Expand navigation" }).click();
      await expect(page.locator(".app-shell")).not.toHaveClass(/nav-collapsed/);
    }

    await page.goto("/feed");
    await expect(page.locator(".idea-post h2").first()).toHaveText(longTitle);
    await expectTextToWrap(page.locator(".idea-post h2").first());
    await expectPageToFit(page);

    await page.goto(`/ideas/${ideaId}`);
    await expect(page.locator(".detail-header > h1")).toHaveText(longTitle);
    await expectTextToWrap(page.locator(".detail-header > h1"));
    await expectTextToWrap(page.locator(".detail-author > div"));
    await expectPageToFit(page);
  });
}
