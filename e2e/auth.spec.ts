import { expect, test } from "@playwright/test";

test("unauthenticated visitors are sent to the sign-in screen", async ({ page }) => {
  await page.goto("/monitoring/matches");
  await expect(page).toHaveURL(/\/auth/);
  await expect(page.getByLabel(/e-?mail/i)).toBeVisible();
});
