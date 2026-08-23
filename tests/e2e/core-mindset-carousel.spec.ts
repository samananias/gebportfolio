import { test, expect } from "@playwright/test";

test.describe("Core Mindset Carousel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    const carousel = page.getByRole("region", { name: "Core Mindset Principles" });
    await expect(carousel).toBeVisible({ timeout: 15_000 });
  });

  test("should render all 5 principles as slides", async ({ page }) => {
    const carousel = page.getByRole("region", { name: "Core Mindset Principles" });
    await expect(carousel).toBeVisible();

    const slides = carousel.getByRole("group", { name: /Slide \d of 5/ });
    await expect(slides).toHaveCount(5);
  });

  test("should mark the first slide as active on load", async ({ page }) => {
    const firstSlide = page.getByRole("group", { name: "Slide 1 of 5: Strategy Before Code" });
    await expect(firstSlide).toHaveAttribute("aria-current", "true");
  });

  test("should jump to a slide when clicking a square pagination indicator", async ({ page }) => {
    const squareTab = page.getByRole("tab", {
      name: "Go to slide 4: Evidence Over Assumptions",
    });
    const fourthSlide = page.getByRole("group", {
      name: "Slide 4 of 5: Evidence Over Assumptions",
    });

    await expect(async () => {
      await squareTab.click();
      await expect(fourthSlide).toHaveAttribute("aria-current", "true");
    }).toPass({ timeout: 15_000 });
  });

  test("should advance slides when clicking adjacent square pagination indicators", async ({
    page,
  }) => {
    const secondTab = page.getByRole("tab", { name: "Go to slide 2: Context Over Memory" });
    const firstSlide = page.getByRole("group", { name: "Slide 1 of 5: Strategy Before Code" });
    const secondSlide = page.getByRole("group", {
      name: "Slide 2 of 5: Context Over Memory",
    });

    await expect(async () => {
      await secondTab.click();
      await expect(secondSlide).toHaveAttribute("aria-current", "true");
      await expect(firstSlide).not.toHaveAttribute("aria-current", "true");
    }).toPass({ timeout: 15_000 });
  });

  test("should support keyboard navigation with arrow keys", async ({ page, isMobile }) => {
    if (isMobile) return;

    const firstTab = page.getByRole("tab", { name: /slide 1/i });
    const firstSlide = page.getByRole("group", { name: "Slide 1 of 5: Strategy Before Code" });
    const secondSlide = page.getByRole("group", {
      name: "Slide 2 of 5: Context Over Memory",
    });

    await firstTab.focus();
    await expect(async () => {
      await page.keyboard.press("ArrowRight");
      await expect(secondSlide).toHaveAttribute("aria-current", "true");
    }).toPass({ timeout: 15_000 });

    await expect(async () => {
      await page.keyboard.press("ArrowLeft");
      await expect(firstSlide).toHaveAttribute("aria-current", "true");
    }).toPass({ timeout: 15_000 });
  });

  test("should move the 3D pawn indicator when the active slide changes", async ({ page }) => {
    const pawn = page.getByTestId("mindset-pawn");
    await expect(pawn).toBeVisible();

    const initialLeft = await pawn.evaluate((el) => el.style.left);

    const fourthTab = page.getByRole("tab", { name: "Go to slide 4: Evidence Over Assumptions" });
    await expect(async () => {
      await fourthTab.click();
      const newLeft = await pawn.evaluate((el) => el.style.left);
      expect(newLeft).not.toBe(initialLeft);
    }).toPass({ timeout: 15_000 });
  });

  test("should keep the active card fully inside the viewport at a later slide", async ({
    page,
  }) => {
    const fourthTab = page.getByRole("tab", { name: "Go to slide 4: Evidence Over Assumptions" });
    const fourthSlide = page.getByRole("group", {
      name: "Slide 4 of 5: Evidence Over Assumptions",
    });

    await expect(async () => {
      await fourthTab.click();
      await expect(fourthSlide).toHaveAttribute("aria-current", "true");
    }).toPass({ timeout: 15_000 });

    // Wait for the 500ms track transform transition to settle, then assert
    // the active card lies fully inside the viewport horizontally (2px tolerance).
    const tolerance = 2;
    await expect(async () => {
      const box = (await fourthSlide.boundingBox()) as { x: number; width: number };
      const viewportWidth = page.viewportSize()?.width ?? 0;
      expect(box.x).toBeGreaterThanOrEqual(-tolerance);
      expect(box.x + box.width).toBeLessThanOrEqual(viewportWidth + tolerance);
    }).toPass({ timeout: 15_000 });
  });

  test("should advance to the next slide on a horizontal swipe", async ({ page, isMobile }) => {
    if (!isMobile) return;

    const firstSlide = page.getByRole("group", { name: "Slide 1 of 5: Strategy Before Code" });
    const secondSlide = page.getByRole("group", { name: "Slide 2 of 5: Context Over Memory" });
    const region = page.getByRole("region", { name: "Core Mindset Principles" });
    const box = (await region.boundingBox())!;

    const startX = box.x + box.width * 0.8;
    const startY = box.y + box.height / 2;
    const endX = startX - Math.max(160, box.width * 0.6);

    await expect(async () => {
      // Playwright's touchscreen API has no swipe primitive and WebKit blocks
      // TouchEvent/Touch construction ("Illegal constructor"); dispatch plain
      // events shaped like touch events — the component only reads
      // touches[0]/changedTouches[0].clientX off them.
      const fire = (
        locator: ReturnType<typeof page.getByRole>,
        type: string,
        x: number,
        y: number,
        withTouches: boolean
      ) =>
        locator.evaluate(
          (el, { type, x, y, withTouches }) => {
            const evt = document.createEvent("Event");
            evt.initEvent(type, true, true);
            const point = { clientX: x, clientY: y };
            Object.defineProperty(evt, "touches", {
              value: withTouches ? [point] : [],
            });
            Object.defineProperty(evt, "changedTouches", { value: [point] });
            el.dispatchEvent(evt);
          },
          { type, x, y, withTouches }
        );

      await fire(firstSlide, "touchstart", startX, startY, true);
      await fire(secondSlide, "touchend", endX, startY, false);
      await expect(secondSlide).toHaveAttribute("aria-current", "true");
      await expect(firstSlide).not.toHaveAttribute("aria-current", "true");
    }).toPass({ timeout: 15_000 });
  });
});
