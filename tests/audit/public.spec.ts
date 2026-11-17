import { test, expect } from '@playwright/test';

// Read-only production checks. Failure responses are injected in this browser only.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => ['GET','HEAD','OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort('blockedbyclient'));
});

test('homepage CTA, history, refresh and keyboard skip link', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', {name:'Skip to content'})).toBeFocused();
  await page.getByRole('link', {name:'Explore the roasts',exact:true}).click();
  await expect(page).toHaveURL(/\/feed$/);
  await page.reload();
  await expect(page.getByRole('heading', {name:/Ideas on the table/})).toBeVisible();
  await page.goBack(); await expect(page).toHaveURL(/\/$/);
  await page.goForward(); await expect(page).toHaveURL(/\/feed$/);
});

test('categories, feed tabs and search input edge cases', async ({ page }) => {
  await page.goto('/explore');
  for(const name of ['Tech','Local business','Design','Life & living','Wild idea','All ideas','Freshly pitched','Getting attention','Needs a roast','Being built','For you']) {
    const button=page.getByRole('button',{name,exact:true});await button.click();await expect(button).toHaveAttribute('aria-pressed','true');
  }
  const search=page.getByRole('searchbox',{name:'Search ideas'});
  for(const value of ['no-match-qa-20261116',' MiXeD words ','☕ café','<b>harmless</b>','x'.repeat(500),'']) {
    await search.fill(value);await search.press('Enter');await expect(search).toHaveValue(value.slice(0,100));
    await expect(page.getByText('No ideas at this table. Yet.',{exact:true})).toBeVisible();
  }
});

for(const status of [400,401,403,404,429,500]) test(`feed recovers from simulated HTTP ${status}`,async ({page})=>{
  await page.route('**/api/v1/ideas?**',r=>r.fulfill({status,json:{message:`QA simulated ${status}`}}));
  await page.goto('/feed');
  await expect(page.getByRole('button',{name:/Try again|Retry/}).first()).toBeVisible({timeout:20000});
  await page.unroute('**/api/v1/ideas?**');
  await page.getByRole('button',{name:/Try again|Retry/}).first().click();
  await expect(page.getByText('No ideas at this table. Yet.',{exact:true})).toBeVisible();
});

test('bookmarks session retry restores the empty saved feed',async ({page})=>{
  await page.route('**/api/v1/visitor-session',r=>r.fulfill({status:503,json:{message:'QA session unavailable'}}));
  await page.goto('/saved');
  const retry=page.getByRole('button',{name:'Retry browser session'});
  await expect(retry).toBeVisible({timeout:20000});
  await page.unroute('**/api/v1/visitor-session');await retry.click();
  await expect(retry).toBeHidden();
  await expect(page.getByText('A little empty. A lot of potential.',{exact:true})).toBeVisible();
});

test('pitch form rejects blank submission without publishing',async ({page})=>{
  let writes=0;page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/v1/ideas') writes++;});
  await page.goto('/new');
  await page.getByRole('button',{name:'Put it on the table',exact:true}).click();
  await expect(page).toHaveURL(/\/new$/);
  expect(writes).toBe(0);
  await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
  await expect(page.getByRole('alert').first()).toBeVisible();
});
