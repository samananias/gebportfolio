import { test, expect, type Page } from "@playwright/test";

async function openChatModal(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  const dialog = page.getByRole("dialog", { name: "Real-time live chat room" });

  await expect(async () => {
    await page.evaluate(() => {
      (window as unknown as { __portfolio_chat_requested?: boolean }).__portfolio_chat_requested =
        true;
      window.dispatchEvent(new CustomEvent("open-portfolio-chat"));
    });
    await expect(dialog).toBeVisible();
  }).toPass({ timeout: 15_000 });
}

test.describe("Anonymous Real-Time Chatbox Onboarding & Verification", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should render navigation live chat trigger button", async ({ page }) => {
    const isMobile = await page.locator("#menu-open").isVisible();
    if (isMobile) {
      await page.locator("#menu-open").click();
      const trigger = page.locator("#mobile-menu button", { hasText: "Live Chat" });
      await expect(trigger).toBeVisible();
    } else {
      const trigger = page.locator("aside button", { hasText: "Live Chat" });
      await expect(trigger).toBeVisible();
    }
  });

  test("should require mandatory username onboarding on first visit", async ({ page }) => {
    await openChatModal(page);

    const dialog = page.getByRole("dialog", { name: "Real-time live chat room" });
    await expect(dialog).toBeVisible();

    const onboardingHeading = page.getByRole("heading", {
      name: "Enter Handle to Play Chess & Chat",
    });
    await expect(onboardingHeading).toBeVisible();

    const nameInput = page.getByPlaceholder("e.g. TacticalKnight");
    await expect(nameInput).toBeVisible();

    await nameInput.fill("TacticalTester");
    const joinBtn = page.getByRole("button", { name: "Play & Join Chat ♞" });
    await joinBtn.click();

    // After onboarding, main message input should be visible
    const messageInput = page.getByPlaceholder("say something...");
    await expect(messageInput).toBeVisible({ timeout: 10_000 });
  });

  test("should persist username in localStorage and bypass onboarding on reload", async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.localStorage.setItem("portfolio_chat_display_name_v1", "TacticalTester");
      window.sessionStorage.setItem(
        "portfolio_chat_pass_v1",
        `${Date.now() + 900000}.preview-test-pass`
      );
    });
    await page.reload();

    await openChatModal(page);

    const dialog = page.getByRole("dialog", { name: "Real-time live chat room" });
    await expect(dialog).toBeVisible();

    // Onboarding heading should NOT be visible
    const onboardingHeading = page.getByRole("heading", {
      name: "Enter Handle to Play Chess & Chat",
    });
    await expect(onboardingHeading).not.toBeVisible();

    // Main message input should be visible immediately
    const messageInput = page.getByPlaceholder("say something...");
    await expect(messageInput).toBeVisible();
  });

  test("should close chat modal when ESC key is pressed", async ({ page }) => {
    await openChatModal(page);

    const dialog = page.getByRole("dialog", { name: "Real-time live chat room" });
    await expect(dialog).toBeVisible();

    // Wait for modal focus initialization to settle
    const nameInput = page.getByPlaceholder("e.g. TacticalKnight");
    await expect(nameInput).toBeFocused();

    await expect(async () => {
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
    }).toPass({ timeout: 5000 });
  });

  test("should close chat modal when close button is clicked", async ({ page }) => {
    await openChatModal(page);

    const dialog = page.getByRole("dialog", { name: "Real-time live chat room" });
    await expect(dialog).toBeVisible();

    await expect(async () => {
      const closeBtn = page.getByRole("button", { name: "Close chat modal" }).first();
      await closeBtn.click();
      await expect(dialog).not.toBeVisible();
    }).toPass({ timeout: 5000 });
  });

  test("should reject reserved bot sender names on /api/chat/send", async ({ request }) => {
    const res = await request.post("/api/chat/send", {
      data: {
        sender: "AnthropicBot",
        text: "Hello from a simulated bot",
        avatar: "knight",
      },
    });

    expect(res.status()).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toContain("reserved");
  });

  test("should silently drop submissions that fill honeypot fields", async ({ request }) => {
    const res = await request.post("/api/chat/send", {
      data: {
        sender: "RealUser",
        text: "Spam content",
        website: "http://spamsite.com",
      },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  test("should preserve scroll position when user scrolls up and show latest messages button", async ({
    page,
  }) => {
    await page.route("**/api/chat/messages", async (route) => {
      const messages = Array.from({ length: 25 }, (_, i) => ({
        id: `msg_test_${i}`,
        sender: i % 2 === 0 ? "TacticalTester" : "OpponentKnight",
        avatar: "knight",
        text: `Test message ${i + 1} with enough content to create vertical scroll space.`,
        timestamp: Date.now() - (25 - i) * 60000,
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, messages }),
      });
    });

    await page.evaluate(() => {
      window.localStorage.setItem("portfolio_chat_display_name_v1", "TacticalTester");
      window.sessionStorage.setItem(
        "portfolio_chat_pass_v1",
        `${Date.now() + 900000}.preview-test-pass`
      );
    });
    await page.reload();

    await openChatModal(page);

    const dialog = page.getByRole("dialog", { name: "Real-time live chat room" });
    await expect(dialog).toBeVisible();

    const scrollContainer = dialog.locator(".custom-scrollbar").first();
    await expect(scrollContainer).toBeVisible();

    // Verify initial state is scrolled near bottom
    await expect(async () => {
      const scrollTop = await scrollContainer.evaluate((el) => el.scrollTop);
      expect(scrollTop).toBeGreaterThan(0);
    }).toPass();

    // User scrolls UP to the top
    await scrollContainer.evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event("scroll"));
    });

    // "Latest messages" floating button should appear
    const latestBtn = page.getByRole("button", { name: "Scroll to latest messages" });
    await expect(latestBtn).toBeVisible();

    // Wait 6 seconds (exceeding the 5-second polling interval)
    await page.waitForTimeout(6000);

    // Scroll position should NOT have been jerked down back to bottom
    const currentScrollTop = await scrollContainer.evaluate((el) => el.scrollTop);
    expect(currentScrollTop).toBeLessThan(100);

    // Clicking "Latest messages" button smoothly returns user to bottom
    await latestBtn.click();
    await expect(latestBtn).not.toBeVisible();

    await expect(async () => {
      const atBottom = await scrollContainer.evaluate(
        (el) => el.scrollHeight - el.scrollTop - el.clientHeight <= 60
      );
      expect(atBottom).toBe(true);
    }).toPass();
  });
});
