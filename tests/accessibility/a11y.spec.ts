import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Accessibility Audits (WCAG 2.2 AA Compliance)", () => {
  const routes = [
    "/",
    "/about",
    "/projects",
    "/experience",
    "/posts",
    "/experiments",
    "/contact",
    "/search",
    "/remove-background",
  ];

  for (const route of routes) {
    test(`route "${route}" should have zero accessibility violations`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("load");

      await expect(async () => {
        const accessibilityScanResults = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"])
          .analyze();
        expect(accessibilityScanResults.violations).toEqual([]);
      }).toPass({ timeout: 15_000 });
    });
  }
});
