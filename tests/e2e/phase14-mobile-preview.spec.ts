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

// Regression coverage for a cascade-layers bug: app/globals.css had a plain
// (unlayered) `button, input, textarea { font: inherit; }` reset. Tailwind
// v4 puts its own utilities inside `@layer utilities`, and per the CSS
// cascade-layers spec, ANY unlayered rule beats ANY layered rule regardless
// of specificity — so that reset silently overrode every `text-[Npx]`
// utility on every button/input/textarea in the app. Usually invisible
// (elements just inherited a nearby font-size close enough to look fine),
// but visibly broke long-labeled small buttons like "Suggest placements",
// which wrapped across two lines and overflowed its fixed-height pill.
test("small buttons render at their declared font-size, not an inherited one (cascade-layers regression)", async ({ page }) => {
  await page.goto("/demo");

  const button = page.locator('[data-testid="suggest-placements"]');
  await expect(button).toBeVisible();

  const style = await button.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { fontSize: cs.fontSize, height: cs.height, scrollHeight: el.scrollHeight };
  });

  // Declared via Tailwind's text-[9px] utility in components/editor/Timeline.tsx.
  expect(style.fontSize).toBe("9px");
  // Content must fit the button's fixed height — no more two-line wrap.
  expect(style.scrollHeight).toBeLessThanOrEqual(Math.ceil(parseFloat(style.height)) + 1);
});
