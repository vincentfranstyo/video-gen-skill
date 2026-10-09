import type { Browser, Page } from "playwright";
import { mkdirSync } from "fs";
import { launchBrowser } from "../lib/browser";

const job: { appUrl: string } = await Bun.file(new URL("./job.json", import.meta.url).pathname).json();
const APP_URL = new URL(job.appUrl);
const OUT_DIR = new URL("./assets/shots/", import.meta.url).pathname;
const SETTLE_MS = 3000;

const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

const HIDE_SCROLLBARS = "::-webkit-scrollbar{display:none!important} *{scrollbar-width:none!important}";

// Selectors differ per app: find the real ones by opening the login page first.
async function signIn(page: Page) {
  const { APP_USERNAME, APP_PASSWORD } = process.env;
  if (!APP_USERNAME || !APP_PASSWORD) return;
  await page.goto(APP_URL.href);
  await page.locator('input[type=email], input[name*=user i], input[name*=email i]').first().fill(APP_USERNAME);
  await page.locator("input[type=password]").first().fill(APP_PASSWORD);
  await page.locator("input[type=password]").first().press("Enter");
  await page.waitForLoadState("networkidle");
}

// Scroll-triggered reveal animations leave off-screen content faded in a still.
async function finishRevealAnimations(page: Page) {
  await page.evaluate(async () => {
    const step = window.innerHeight / 2;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1000);
}

async function shoot(page: Page, path: string, name: string, fullPage = false) {
  await page.goto(new URL(path, APP_URL).href);
  await page.addStyleTag({ content: HIDE_SCROLLBARS });
  await page.waitForTimeout(SETTLE_MS);
  await finishRevealAnimations(page);
  await page.screenshot({ path: `${OUT_DIR}${name}.png`, fullPage });
}

async function capture(browser: Browser, options: typeof DESKTOP | typeof MOBILE, prefix: string) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await signIn(page);
  await shoot(page, "/", `${prefix}-home`);
  await context.close();
}

mkdirSync(OUT_DIR, { recursive: true });
const browser = await launchBrowser();
await Promise.all([capture(browser, DESKTOP, "d"), capture(browser, MOBILE, "m")]);
await browser.close();
