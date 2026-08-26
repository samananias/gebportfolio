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

  test("should advance and reverse slides when driven by page scroll", async ({ page }) => {
    const region = page.getByRole("region", { name: "Core Mindset Principles" });
    const section = page.locator("section").filter({ has: region });
    const firstSlide = page.getByRole("group", { name: "Slide 1 of 5: Strategy Before Code" });
    const secondSlide = page.getByRole("group", { name: "Slide 2 of 5: Context Over Memory" });
    const thirdSlide = page.getByRole("group", {
      name: "Slide 3 of 5: AI as a Partner, Not a Crutch",
    });

    const scrollToProgress = (progress: number) =>
      section.evaluate((el, p) => {
        const rect = el.getBoundingClientRect();
        const scrollable = rect.height - window.innerHeight;
        window.scrollTo({ top: window.scrollY + rect.top + p * scrollable, behavior: "auto" });
      }, progress);

    await expect(async () => {
      await scrollToProgress(0.25);
      await expect(secondSlide).toHaveAttribute("aria-current", "true");
    }).toPass({ timeout: 15_000 });

    await expect(async () => {
      await scrollToProgress(0.5);
      await expect(thirdSlide).toHaveAttribute("aria-current", "true");
    }).toPass({ timeout: 15_000 });

    // Reverse direction: scrolling back up must scrub the carousel backwards
    await expect(async () => {
      await scrollToProgress(0.25);
      await expect(secondSlide).toHaveAttribute("aria-current", "true");
    }).toPass({ timeout: 15_000 });

    await expect(async () => {
      await scrollToProgress(0);
      await expect(firstSlide).toHaveAttribute("aria-current", "true");
    }).toPass({ timeout: 15_000 });
  });

  test("should move the pawn horizontally in sync with scroll position", async ({ page }) => {
    const region = page.getByRole("region", { name: "Core Mindset Principles" });
    const section = page.locator("section").filter({ has: region });
    const pawn = page.getByTestId("mindset-pawn");
    const fourthSlide = page.getByRole("group", {
      name: "Slide 4 of 5: Evidence Over Assumptions",
    });

    await expect(pawn).toBeVisible();
    const initialLeft = await pawn.evaluate((el) => el.style.left);

    await expect(async () => {
      await section.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const scrollable = rect.height - window.innerHeight;
        window.scrollTo({
          top: window.scrollY + rect.top + 0.75 * scrollable,
          behavior: "auto",
        });
      });
      await expect(fourthSlide).toHaveAttribute("aria-current", "true");
    }).toPass({ timeout: 15_000 });

    // The pawn's left offset must have changed and track the active card's
    // horizontal position once the eased interpolation settles.
    await expect(async () => {
      const newLeft = await pawn.evaluate((el) => el.style.left);
      expect(newLeft).not.toBe(initialLeft);

      const pawnBox = (await pawn.boundingBox())!;
      const slideBox = (await fourthSlide.boundingBox())!;
      const pawnCenter = pawnBox.x + pawnBox.width / 2;
      const slideCenter = slideBox.x + slideBox.width / 2;
      expect(Math.abs(pawnCenter - slideCenter)).toBeLessThanOrEqual(100);
    }).toPass({ timeout: 15_000 });
  });

  test("should interpolate through intermediate positions on a fast multi-slide jump", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "timing-sensitive interpolation probe");

    const reducedMotion = await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
    test.skip(reducedMotion, "reduced motion snaps instantly by design");

    const region = page.getByRole("region", { name: "Core Mindset Principles" });
    const section = page.locator("section").filter({ has: region });
    const track = page.getByTestId("mindset-track");

    // Derive the fractional slide position from the `pos * GAP_REM` rem term of
    // the track transform. Browsers merge the two percentage terms into one
    // signed value, so the gap term is the only reliably separable component.
    const readPosition = () =>
      track.evaluate((el) => {
        const match = /([\d.]+)rem/.exec(el.style.transform);
        return match ? parseFloat(match[1]) / 1.5 : 0;
      });

    // Park at slide 1 so the smoothed position starts near zero.
    await expect(async () => {
      await section.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        window.scrollTo({ top: window.scrollY + rect.top, behavior: "auto" });
      });
      const position = await readPosition();
      expect(position).toBeLessThan(0.05);
    }).toPass({ timeout: 15_000 });

    // Jump straight to slide 5's mapped position; mid-flight the track must
    // hold a fractional position strictly between slide 1 and slide 5.
    await section.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      window.scrollTo({ top: window.scrollY + rect.top + scrollable, behavior: "auto" });
    });

    await expect(async () => {
      const position = await readPosition();
      expect(position).toBeGreaterThan(0.2);
      expect(position).toBeLessThan(3.8);
    }).toPass({ timeout: 3_000 });
  });

  test("should fire exactly one pawn hop per fast multi-slide scroll gesture", async ({ page }) => {
    const region = page.getByRole("region", { name: "Core Mindset Principles" });
    const section = page.locator("section").filter({ has: region });
    const pawn = page.getByTestId("mindset-pawn");
    const hopCounter = pawn.locator("[data-hop-count]");
    const fifthSlide = page.getByRole("group", { name: "Slide 5 of 5: Continuous Refinement" });

    await expect(pawn).toBeVisible();

    // Park at slide 1; with no index change, no hop may have fired yet.
    await expect(async () => {
      await section.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        window.scrollTo({ top: window.scrollY + rect.top, behavior: "auto" });
      });
      await expect(hopCounter).toHaveAttribute("data-hop-count", "0");
    }).toPass({ timeout: 15_000 });

    // Jump straight to slide 5's mapped position in one gesture.
    await section.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      window.scrollTo({ top: window.scrollY + rect.top + scrollable, behavior: "auto" });
    });

    // Exactly one hop must fire once the eased scrub settles on the final slide
    // — not one per intermediate slide crossed along the way.
    await expect(async () => {
      await expect(fifthSlide).toHaveAttribute("aria-current", "true");
      await expect(hopCounter).toHaveAttribute("data-hop-count", "1");
    }).toPass({ timeout: 15_000 });

    // Settling must not produce any trailing extra hops.
    await page.waitForTimeout(700);
    await expect(hopCounter).toHaveAttribute("data-hop-count", "1");
  });

  test("should keep the pawn anchored to its nearest card when resting between slides", async ({
    page,
  }) => {
    const region = page.getByRole("region", { name: "Core Mindset Principles" });
    const section = page.locator("section").filter({ has: region });
    const pawn = page.getByTestId("mindset-pawn");
    const secondSlide = page.getByRole("group", { name: "Slide 2 of 5: Context Over Memory" });
    const thirdSlide = page.getByRole("group", {
      name: "Slide 3 of 5: AI as a Partner, Not a Crutch",
    });

    await expect(pawn).toBeVisible();

    // Rest exactly between slides 2 and 3 (progress 0.375 = position 1.5);
    // hysteresis keeps ownership on slide 2 since 1.5 < 1 + 0.55 never
    // crosses the hand-off threshold toward slide 3.
    await section.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      window.scrollTo({ top: window.scrollY + rect.top + 0.375 * scrollable, behavior: "auto" });
    });

    // Wait for the eased scrub and the pawn walk to settle before comparing centers.
    await expect(async () => {
      const pawnBox = (await pawn.boundingBox())!;
      const secondBox = (await secondSlide.boundingBox())!;
      const thirdBox = (await thirdSlide.boundingBox())!;
      const pawnCenter = pawnBox.x + pawnBox.width / 2;
      const secondCenter = secondBox.x + secondBox.width / 2;
      const thirdCenter = thirdBox.x + thirdBox.width / 2;
      expect(Math.abs(pawnCenter - secondCenter)).toBeLessThan(Math.abs(pawnCenter - thirdCenter));
    }).toPass({ timeout: 15_000 });
  });
});
