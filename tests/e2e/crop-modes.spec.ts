import { test, expect } from "@playwright/test";

test.describe("ID Photo Studio two-mode surface", () => {
  test("defaults to Studio and rewrites the URL without navigation", async ({ page }) => {
    await page.goto("/crop");
    await expect(page.getByRole("heading", { level: 1, name: "ID Photo Studio" })).toBeVisible();
    const studioTab = page.getByRole("tab", { name: "Studio" });
    await expect(studioTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: "Studio" })).toBeVisible();
    await expect(page.getByRole("tabpanel", { name: "How it works" })).toBeHidden();
    await expect(page).toHaveURL(/\/crop\?mode=studio$/);
  });

  test("switching modes stays on the page and loses no hydration", async ({ page }) => {
    await page.goto("/crop");
    await expect(page.locator("#crop-studio")).toHaveAttribute("data-crop-hydrated", "true");
    await page.getByRole("tab", { name: "How it works" }).click();
    await expect(page.getByRole("tabpanel", { name: "How it works" })).toBeVisible();
    await expect(page.getByRole("tabpanel", { name: "Studio" })).toBeHidden();
    // No navigation: the hydrated island is still the same DOM node.
    await expect(page.locator("#crop-studio")).toHaveAttribute("data-crop-hydrated", "true");
    await expect(page).toHaveURL(/\/crop\?mode=record$/);
    await expect(page.getByRole("tab", { name: "How it works" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  test("deep link opens the record lane and the bench still hydrates", async ({ page }) => {
    await page.goto("/crop?mode=record");
    await expect(page.getByRole("tabpanel", { name: "How it works" })).toBeVisible();
    await expect(page.getByRole("tabpanel", { name: "Studio" })).toBeHidden();
    // The island must still hydrate even though its panel starts hidden.
    await expect(page.locator("#crop-studio")).toHaveAttribute("data-crop-hydrated", "true");
  });

  test("an invalid mode falls back to Studio silently", async ({ page }) => {
    await page.goto("/crop?mode=nonsense");
    await expect(page.getByRole("tabpanel", { name: "Studio" })).toBeVisible();
    await expect(page.getByRole("tabpanel", { name: "How it works" })).toBeHidden();
  });

  test("keyboard switching follows the tabs pattern", async ({ page }) => {
    await page.goto("/crop");
    const studioTab = page.getByRole("tab", { name: "Studio" });
    const recordTab = page.getByRole("tab", { name: "How it works" });
    await studioTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(recordTab).toBeFocused();
    await expect(page.getByRole("tabpanel", { name: "How it works" })).toBeVisible();
    await page.keyboard.press("Home");
    await expect(studioTab).toBeFocused();
    await expect(page.getByRole("tabpanel", { name: "Studio" })).toBeVisible();
    await page.keyboard.press("End");
    await expect(recordTab).toBeFocused();
  });

  test("the record lane reports the sourced facts", async ({ page }) => {
    await page.goto("/crop?mode=record");
    const record = page.getByRole("tabpanel", { name: "How it works" });
    await expect(record).toBeVisible();
    await expect(record.getByRole("heading", { name: "The presets" })).toBeVisible();
    await expect(record.getByRole("row", { name: /2x2/ })).toContainText("600 by 600 px");
    await expect(record.getByRole("heading", { name: "The export contract" })).toBeVisible();
    await expect(record.getByText("up to 8 MB")).toBeVisible();
    await expect(record.getByRole("heading", { name: "The privacy model" })).toBeVisible();
    await expect(record.getByText("@imgly/background-removal-js")).toBeVisible();
    await expect(record.getByRole("heading", { name: "Where the evidence lives" })).toBeVisible();
    await expect(record.getByRole("link", { name: "Read the Lab notes" })).toBeVisible();
  });

  test("without JavaScript both panels stack and every record fact is readable", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/crop");
    await expect(page.getByRole("tabpanel", { name: "Studio" })).toBeVisible();
    await expect(page.getByRole("tabpanel", { name: "How it works" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "The privacy model" })).toBeVisible();
    await context.close();
  });
});
