import { test, expect } from "@playwright/test";

test.describe("Contact Form Submission Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/contact");
    await expect(page.getByRole("heading", { level: 1, name: "Send Your Move" })).toBeVisible();
  });

  async function fillForm(page: import("@playwright/test").Page): Promise<void> {
    await page.getByLabel(/Name/).fill("Juan Dela Cruz");
    await page.getByLabel(/Email/).fill("juan@example.com");
    await page.getByLabel(/Message/).fill("Hello Sam — I would like to discuss a project.");
  }

  test("should show inline validation errors when submitting an empty form", async ({ page }) => {
    const nameError = page.locator("#name-error");
    const emailError = page.locator("#email-error");
    const messageError = page.locator("#message-error");

    await page.getByRole("button", { name: "Send Message" }).click();

    await expect(nameError).toBeVisible();
    await expect(nameError).toHaveText("Please enter your name.");
    await expect(emailError).toBeVisible();
    await expect(messageError).toBeVisible();

    await expect(page.getByLabel(/Name/)).toHaveAttribute("aria-invalid", "true");

    // The delivered panel must NOT appear
    await expect(page.locator("#contact-success-panel")).toBeHidden();

    // Errors clear as the visitor fixes the fields
    await page.getByLabel(/Name/).fill("Juan Dela Cruz");
    await expect(nameError).toBeHidden();
    await expect(page.getByLabel(/Name/)).not.toHaveAttribute("aria-invalid", "true");
  });

  test("should show the delivered panel on a successful submission", async ({ page }) => {
    await fillForm(page);

    // The character counter should be live once JS is driving it
    const counter = page.locator("#message-counter");
    await expect(counter).toBeVisible();
    await expect(counter).toHaveText(/\d+/);

    await page.getByRole("button", { name: "Send Message" }).click();

    const successPanel = page.locator("#contact-success-panel");
    await expect(successPanel).toBeVisible();
    await expect(successPanel).toContainText("Message delivered");
    await expect(successPanel).toBeFocused();
    await expect(page.locator("#contact-form-panel")).toBeHidden();

    // Compose another restores a clean form
    await page.getByRole("button", { name: "Compose another" }).click();
    await expect(page.locator("#contact-form-panel")).toBeVisible();
    await expect(page.getByLabel(/Name/)).toHaveValue("");
    await expect(counter).toHaveText("0");
  });

  test("should surface server errors in the live status region", async ({ page }) => {
    await page.route("**/api/contact", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "Simulated delivery failure." }),
      });
    });

    await fillForm(page);
    await page.getByRole("button", { name: "Send Message" }).click();

    const status = page.locator("#contact-status");
    await expect(status).toBeVisible();
    await expect(status).toContainText("Simulated delivery failure.");

    // The form stays intact so the message is not lost
    await expect(page.getByLabel(/Message/)).toHaveValue(
      "Hello Sam — I would like to discuss a project."
    );
    await expect(page.getByRole("button", { name: "Send Message" })).toBeVisible();
  });
});
