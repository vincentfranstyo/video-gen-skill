import type { Page } from "playwright";

export type StageScene = { id: string; from: number; to: number };

// TikTok crops and overlays the edges; readable text keeps this share of the width/height clear.
const SAFE_MARGIN = 0.04;
const MIN_VISIBLE_OPACITY = 0.5;
const TEXT_SNIPPET = 40;

/**
 * Times where every element of a scene has settled: the middle of the scene and
 * one beat before its exit zoom. Frame 0 is the cover, so it is always checked.
 */
export function checkTimes(scenes: StageScene[], beat: number): number[] {
  const times = scenes.flatMap(({ from, to }) => [from + (to - from) / 2, Math.max(from, to - beat)]);
  return [0, ...times].map((t) => Number(t.toFixed(2)));
}

// Opacity summed over the whole ancestor chain, so a faded-out scene counts as hidden.
function visibleElementsScript() {
  return `(() => {
    const opacity = (el) => { let o = 1; for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
    return [...document.querySelectorAll(".scene *")].filter((el) => {
      if (el.closest(".cc")) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 4 && rect.height > 4 && rect.bottom > 0 && rect.top < innerHeight && opacity(el) > 0.5;
    });
  })()`;
}

/** True when anything besides the captions is visible at time `t`. */
export async function hasContentAt(page: Page, t: number): Promise<boolean> {
  await page.evaluate((time) => window.stage.seek(time), t);
  return page.evaluate((script) => (eval(script) as Element[]).length > 0, visibleElementsScript());
}

/** The words on screen at time `t` outside the captions, lower-cased and whitespace-collapsed. */
export async function screenTextAt(page: Page, t: number): Promise<string> {
  await page.evaluate((time) => window.stage.seek(time), t);
  return page.evaluate((script) => {
    const visible = new Set(eval(script) as Element[]);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const texts: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement && visible.has(node.parentElement)) texts.push(node.textContent ?? "");
    }
    return texts.join(" ").replace(/\s+/g, " ").replace(/\s+([?!.,])/g, "$1").trim().toLowerCase();
  }, visibleElementsScript());
}

/** Visible text whose font is not one of `allowed`, as [family, sample text] pairs; checked at the current frame. */
export async function foreignFonts(page: Page, allowed: string[]): Promise<[string, string][]> {
  return page.evaluate(({ allowedFamilies, snippet }) => {
    const found = new Map<string, string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const element = node.parentElement;
      if (!text || !element || element.closest("script, style") || element.getClientRects().length === 0) continue;
      const family = getComputedStyle(element).fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");
      if (!allowedFamilies.includes(family) && !found.has(family)) found.set(family, text.slice(0, snippet));
    }
    return [...found];
  }, { allowedFamilies: allowed, snippet: TEXT_SNIPPET });
}

/** Visible text that leaves the safe area at time `t`, as one readable line per element. */
export async function croppedTextAt(page: Page, t: number): Promise<string[]> {
  await page.evaluate((time) => window.stage.seek(time), t);
  return page.evaluate(({ margin, minOpacity, snippet }) => {
    const width = innerWidth;
    const height = innerHeight;
    const effectiveOpacity = (element: Element | null): number => {
      let opacity = 1;
      for (let node = element; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
      return opacity;
    };
    // Text scrolled out of a box with overflow hidden is not on screen; only the part the box shows counts.
    const visiblePart = (rect: DOMRect, element: Element): { left: number; right: number; top: number; bottom: number } | null => {
      let { left, right, top, bottom } = rect;
      for (let node = element.parentElement; node; node = node.parentElement) {
        if (getComputedStyle(node).overflow === "visible") continue;
        const box = node.getBoundingClientRect();
        left = Math.max(left, box.left);
        right = Math.min(right, box.right);
        top = Math.max(top, box.top);
        bottom = Math.min(bottom, box.bottom);
      }
      return right - left > 1 && bottom - top > 1 ? { left, right, top, bottom } : null;
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const offenders = new Map<Element, string>();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const element = node.parentElement;
      if (!text || !element || element.closest("[data-bleed], script, style")) continue;
      if (effectiveOpacity(element) < minOpacity) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        const shown = visiblePart(rect, element);
        if (!shown) continue;
        const outside = shown.left < width * margin || shown.right > width * (1 - margin) || shown.top < 0 || shown.bottom > height;
        if (outside) offenders.set(element, text.slice(0, snippet));
      }
    }
    return [...offenders.values()];
  }, { margin: SAFE_MARGIN, minOpacity: MIN_VISIBLE_OPACITY, snippet: TEXT_SNIPPET });
}
