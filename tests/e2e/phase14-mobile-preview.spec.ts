import { expect, test } from "@playwright/test";

// Regression coverage for a real-browser-only layout bug: on a narrow
// (mobile-width) viewport, the portrait-aspect preview box collapsed to
// ~0x0 because an ancestor (.preview-panel, sized only by min-height +
// auto content under the mobile media query) never produced a "definite"
// size for percentage-height/aspect-ratio children to resolve against.
// jsdom cannot catch this — it doesn't run a real layout engine — so this
// must run against a real rendered page.
test.use({ viewport: { width: 390, height: 844 } });

test("the portrait preview box has a real (non-collapsed) size on a mobile-width viewport", async ({ page }) => {
  await page.goto("/demo");

  const container = page.locator("[data-preview-orientation]");
  await expect(container).toBeVisible();
  await expect(container).toHaveAttribute("data-preview-orientation", "portrait");

  const box = await container.boundingBox();
  expect(box).not.toBeNull();
  // Any non-trivial size proves percentage-height resolution succeeded;
  // the collapsed-bug value was ~2x3.5px regardless of viewport.
  expect(box!.width).toBeGreaterThan(50);
  expect(box!.height).toBeGreaterThan(50);

  const video = page.locator('[data-base-audio-policy="master"]');
  const videoBox = await video.boundingBox();
  expect(videoBox).not.toBeNull();
  expect(videoBox!.width).toBeGreaterThan(50);
  expect(videoBox!.height).toBeGreaterThan(50);
});

test("the header action row scrolls horizontally instead of clipping controls off-screen", async ({ page }) => {
  await page.goto("/demo");

  const actions = page.locator(".header-actions");
  await expect(actions).toBeVisible();

  const { scrollWidth, clientWidth } = await actions.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(scrollWidth).toBeGreaterThan(clientWidth);

  await actions.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  const approveButton = page.locator('[data-testid="approve-plan"]');
  await expect(approveButton).toBeInViewport();
});
