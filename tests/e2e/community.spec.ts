import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
async function captureAtWidths(page: Page, name: string) {
  await mkdir(".data/qa", { recursive: true });
  for (const width of [390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({
      path: `.data/qa/${name}-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}
test.beforeEach(async ({ page }) => {
  page.on("console", (message) => {
    if (message.type() === "error")
      console.error("BROWSER CONSOLE:", message.text().slice(0, 1000));
  });
  page.on("pageerror", (error) =>
    console.error("BROWSER ERROR:", error.message),
  );
});

test("a visitor can explore, filter, and use the mobile table", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".featured-idea")).toBeVisible();
  await expect(page.locator(".idea-post").first()).toBeVisible();
  await page
    .getByRole("link", { name: "Explore the roasts", exact: true })
    .click();
  await expect(page).toHaveURL(/\/feed/);
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await expect(page.locator(".idea-post")).toHaveCount(1);
  await expect(page.locator(".idea-post h2")).toContainText("Fieldnotes");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Saved", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Worth coming back to/ }),
  ).toBeVisible();
});

test("publish without signup, roast, reply, improve, save, and link creator support", async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const title = `A community repair shelf ${suffix}`;
  await page.goto("/new");
  await page.getByLabel("Your name").fill("Browser Maker");
  await expect(
    page.locator("input[type=email],input[type=password]"),
  ).toHaveCount(0);
  await page
    .getByLabel("Your Buy Me a Coffee link")
    .fill("https://buymeacoffee.com/BeyondTheSyntax");
  const signup = page.getByRole("link", {
    name: "Create a Buy Me a Coffee account",
  });
  await expect(signup).toHaveAttribute(
    "href",
    "https://buymeacoffee.com/signup",
  );
  await expect(signup).toHaveAttribute("target", "_blank");
  await page.getByLabel("Give it a good title.").fill(title);
  await page
    .getByLabel("The short version.")
    .fill(
      "Neighbors share tools and learn repair skills at a small supervised shelf in the building lobby.",
    );
  await page
    .getByLabel("What’s the problem?")
    .fill(
      "People throw away useful items because a tiny repair feels too difficult.",
    );
  await page
    .getByLabel("How would your idea help?")
    .fill(
      "A weekly repair session, a shared tool shelf, and a calendar for borrowing.",
    );
  await page
    .getByLabel("Who’s it for?")
    .fill("Residents in one apartment building.");
  await captureAtWidths(page, "publishing");
  const createdResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/ideas",
  );
  await page
    .getByRole("button", { name: "Put it on the table", exact: true })
    .click();
  const created = await createdResponse;
  expect(created.status()).toBe(201);
  const published = await created.json();
  expect(published.buyMeACoffeeUrl).toBe(
    "https://buymeacoffee.com/BeyondTheSyntax",
  );
  await expect(page).toHaveURL(/\/ideas\/[a-f0-9]{24}$/);
  const url = page.url();
  const detailResponse = await page.request.get(
    `/api/v1/ideas/${published.id}`,
  );
  expect(detailResponse.status()).toBe(200);
  expect((await detailResponse.json()).idea.buyMeACoffeeUrl).toBe(
    "https://buymeacoffee.com/BeyondTheSyntax",
  );
  await page
    .getByRole("button", { name: "Roast this idea", exact: true })
    .click();
  await page
    .getByLabel("What’s the weak spot?")
    .fill(
      "You are assuming someone will supervise the shelf every week without a clear incentive.",
    );
  await page
    .getByLabel("Give them a way forward.")
    .fill(
      "Run one repair afternoon with a volunteer group before buying equipment.",
    );
  await page
    .getByLabel("The punchline")
    .fill("Start with one screwdriver and a calendar.");
  await captureAtWidths(page, "roast-composer");
  await page.getByRole("button", { name: "Serve the roast" }).click();
  await expect(page.locator(".roast-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your reply" })
    .fill("That is the right first test. I will start with one afternoon.");
  await page.getByRole("button", { name: "Post reply" }).click();
  await expect(page.locator(".reply")).toHaveCount(1);
  await page.getByRole("button", { name: "Acknowledge", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Acknowledged", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Suggest an improvement", exact: true })
    .click();
  await page
    .getByLabel("What would you change?")
    .fill(
      "Create a condition checklist and photograph tools before and after each session.",
    );
  await page.getByRole("button", { name: "Put it on the record" }).click();
  await page.getByRole("tab", { name: "Improvements", exact: true }).click();
  await expect(page.locator(".suggestion")).toHaveCount(1);
  await page.getByLabel("Suggestion status").selectOption("Exploring");
  await page.getByRole("button", { name: "Save idea", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unsave idea", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "I’d use this", exact: false })
    .click();
  await expect(
    page.getByRole("button", { name: "I’d use this", exact: false }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: "Build journey", exact: true }).click();
  await page.getByRole("button", { name: "Post an update" }).click();
  await page
    .getByLabel("Update title")
    .fill("The first repair afternoon is on the calendar");
  await page
    .getByLabel("What did you learn or build?")
    .fill(
      "We have a room and two volunteers. Next step is inviting five neighbors.",
    );
  await page.getByLabel("Current stage").selectOption("Validating");
  await page.getByRole("button", { name: "Put it on the record" }).click();
  await expect(page.locator(".journey-timeline")).toContainText(
    "The first repair afternoon",
  );
  await page.getByRole("tab", { name: "Support", exact: true }).click();
  await expect(page.locator(".external-support")).toBeVisible();
  await captureAtWidths(page, "creator-support");
  const coffee = page
    .locator(".external-support")
    .getByRole("link", { name: /Buy a coffee/ });
  await expect(coffee).toHaveAttribute(
    "href",
    "https://buymeacoffee.com/BeyondTheSyntax",
  );
  await expect(coffee).toHaveAttribute("target", "_blank");
  await expect(coffee).toHaveAttribute("rel", "noopener noreferrer");
  // Stub only the external navigation: no donation or provider checkout is performed.
  await page
    .context()
    .route("https://buymeacoffee.com/BeyondTheSyntax", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<h1>External navigation test</h1>",
      }),
    );
  const popupPromise = page.waitForEvent("popup");
  await coffee.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL("https://buymeacoffee.com/BeyondTheSyntax");
  await popup.close();
  await page.goto("/saved");
  await expect(page.locator(".idea-post h2")).toContainText(title);
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(
    page.getByRole("link", { name: "Edit idea", exact: true }),
  ).toHaveAttribute("href", `${new URL(url).pathname}/edit`);
  await page.getByRole("link", { name: "Edit idea", exact: true }).click();
  await expect(page).toHaveURL(/\/ideas\/[a-f0-9]{24}\/edit$/);
  await page.getByLabel("Give it a good title.").fill(title + " revised");
  await page.getByRole("button", { name: "Publish revision" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    title + " revised",
  );
  const revisedResponse = await page.request.get(
    `/api/v1/ideas/${published.id}`,
  );
  expect(revisedResponse.status()).toBe(200);
  expect((await revisedResponse.json()).idea.buyMeACoffeeUrl).toBe(
    "https://buymeacoffee.com/BeyondTheSyntax",
  );
});

test("responsive visual review and accessibility at required widths", async ({
  page,
}) => {
  await mkdir(".data/qa", { recursive: true });
  for (const width of [390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(page.locator(".featured-idea")).toBeVisible();
    await expect(page.locator(".idea-post").first()).toBeVisible();
    await page.screenshot({
      path: `.data/qa/landing-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.goto("/feed");
    await expect(page.locator(".idea-post").first()).toBeVisible();
    await page.screenshot({
      path: `.data/qa/feed-${width}.png`,
      fullPage: true,
    });
    await page.goto("/ideas/000000000000000000000101");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "tool library",
    );
    await page.screenshot({
      path: `.data/qa/detail-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.goto("/people/buildwithsam");
    await expect(
      page.getByRole("heading", { name: "Sam Parker", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `.data/qa/profile-${width}.png`,
      fullPage: true,
    });
  }
  await page.goto("/");
  await expect(page.locator(".idea-post").first()).toBeVisible();
  // The route's tab strip also supports the expected keyboard interaction.
  await page.goto("/ideas/000000000000000000000101");
  await page.getByRole("tab", { name: "The idea", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Roast arena/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("tab", { name: "The idea", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.goto("/");
  await expect(page.locator(".idea-post").first()).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.goto("/ideas/000000000000000000000101");
  await page
    .getByRole("button", { name: "Suggest an improvement", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.locator('input:not([type="checkbox"]), textarea, select').first(),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
