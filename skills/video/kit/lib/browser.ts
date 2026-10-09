import { chromium } from "playwright";

// Empty = Playwright's own Chromium (`bunx playwright install chromium`); "chrome" uses an installed Google Chrome.
const CHANNEL = process.env.PROMO_BROWSER_CHANNEL || undefined;

export function launchBrowser() {
  return chromium.launch({ channel: CHANNEL });
}
