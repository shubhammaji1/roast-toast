import { test, expect } from "@playwright/test";

test("moderator sign-in loads on demand and reports rejected credentials", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Moderator sign-in", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Moderator email").fill("nonexistent-moderator@example.test");
  await dialog.getByLabel("Password", { exact: true }).fill("invalid-test-password");
  await dialog.getByRole("button", { name: "Sign in to moderation" }).click();
  await expect(dialog.getByRole("alert")).not.toBeEmpty();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("search bounds typed and deep-linked queries and recovers after clearing", async ({
  page,
}) => {
  const errors: number[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/v1/ideas?") && response.status() >= 400)
      errors.push(response.status());
  });
  await page.goto(`/explore?q=${"x".repeat(500)}`);
  const search = page.getByRole("searchbox", { name: "Search ideas" });
  await expect(search).toHaveValue("x".repeat(100));
  await expect(search).toHaveAttribute("maxlength", "100");
  await expect(
    page.getByText("No ideas at this table. Yet.", { exact: true }),
  ).toBeVisible();
  await search.fill("z".repeat(500));
  await expect(search).toHaveValue("z".repeat(100));
  await search.fill("");
  await expect(page.locator(".idea-post").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("route metadata identifies each page and canonical excludes search terms", async ({
  page,
}) => {
  for (const [route, title] of [
    ["/about", "About"],
    ["/new", "Pitch an idea"],
    ["/privacy", "Privacy"],
    ["/explore?q=test", "Explore ideas"],
  ]) {
    await page.goto(route);
    await expect(page).toHaveTitle(`${title} · Roast & Toast`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://roast-and-toast-ebon.vercel.app${route.split("?")[0]}`,
    );
  }
});
