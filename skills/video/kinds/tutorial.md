# kind: tutorial

Teach **one real task** in a web app, step by step. Default format `tiktok`, length = as long as the steps need (usually 30–90 s), no filler scene.

- Source of truth: the live app. Explore with Playwright, find the task's real steps (every click and field, in order).
- Capture: copy `$K/examples/capture.ts` to `<job>/capture.ts`, change the import to `$K/lib/browser`, adapt selectors, `bun <job>/capture.ts`. Stills with `page.screenshot` at DPR 2–3 (desktop 1440x900, mobile 390x844), one per step plus the result. Scroll-reveal animations leave cards faded: `finishRevealAnimations`, else force opacity 1. WebGL backgrounds screenshot blank: recreate them in CSS. Heavy page hangs: `PROMO_BROWSER_CHANNEL=chrome`.
- Look = the app: `getComputedStyle` on body, header, primary buttons, links, cards; `:root` custom properties; its Google Fonts link. Too pale for full-screen text: darken the ground, keep the brand color as accent.
- Arc: cover title → why this task matters → steps on **recreated UI** (clean HTML/CSS in the app's colors, zoom into the right region of a still, `cursorAt` to the real target, highlight what to click) → result → CTA with app name + domain.
- Narration: one line per scene; each step says what to click and why.
- Desktop frame: `width: min(72vw, calc(70vh * 1440 / 900))`. Wrapper classes `shot-<device>`, never `desktop`/`phone`.
- Generated art: backgrounds/textures only. Every step shown must exist in the stills.
- Report: say the UI is recreated.
