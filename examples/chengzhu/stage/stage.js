import { $$, createStage, setBpm, progress, ease, lerp, clamp, timing } from "/engine/stage-core.js";

setBpm(88);

// Scene lengths in beats, sized from voice.ts timings (lead + last word + ~0.5 s).
const LENGTHS = [
  ["s-hook", 9], ["s-words", 12], ["s-era", 12], ["s-seasons", 13], ["s-brush", 12],
  ["s-sushi", 12], ["s-meaning", 9], ["s-example", 10], ["s-usage", 10], ["s-moral", 13],
];
let at = 0;
const scenes = LENGTHS.map(([id, len]) => ({ id, from: at, to: (at += len), exit: false }));
const FADE = 0.6; // seconds of crossfade between illustrations

// Ken Burns per scene: alternate push-in / pull-out with a slow drift.
function background(t) {
  const imgs = $$("#bg img");
  scenes.forEach((scene, i) => {
    const img = imgs[i];
    const from = scene.from * timing.BEAT, to = scene.to * timing.BEAT;
    const fadeIn = i === 0 ? 1 : clamp((t - from + FADE / 2) / FADE);
    const fadeOut = i === scenes.length - 1 ? 1 : 1 - clamp((t - to + FADE / 2) / FADE);
    const o = Math.min(fadeIn, fadeOut);
    img.style.opacity = o;
    if (o <= 0) return;
    const p = clamp((t - from + FADE) / (to - from + 2 * FADE));
    if (img.classList.contains("pano")) {
      const travel = img.getBoundingClientRect().width / lerp(1.06, 1.06, p) - innerWidth;
      img.style.transform = `translateX(${-travel * ease.inOutCubic(p)}px) scale(1.06)`;
      img.style.transformOrigin = "0 50%";
      return;
    }
    const s = i % 2 ? lerp(1.14, 1.04, p) : lerp(1.04, 1.14, p);
    const dx = (i % 3 - 1) * 1.6 * timing.U * (p - 0.5);
    img.style.transform = `translate(${dx}px, ${-0.8 * timing.U * p}px) scale(${s})`;
  });
}

// Text cards fade out just before each cut so the illustration crossfade reads clean.
function textOut(t, el, scene) {
  const inner = el.querySelector(".inner");
  const q = progress(t, scene.to - 0.8, 0.8 * timing.BEAT);
  inner.style.opacity = 1 - ease.inCubic(q);
  // A card holding kinetic lines appears with its first line, never empty.
  el.querySelectorAll(".card:not([data-in])").forEach((card) => {
    const first = card.querySelector("[data-in]");
    if (first) card.style.opacity = first.style.opacity;
  });
}
// data-in in the HTML is scene-relative; the engine wants absolute beats.
scenes.forEach((scene) => $$(`#${scene.id} [data-in]`).forEach((n) => (n.dataset.in = Number(n.dataset.in) + scene.from)));
scenes.forEach((scene) => (scene.draw = (t, el) => textOut(t, el, scene)));

createStage({
  totalBeats: at,
  scenes,
  background,
  // Load the CJK subsets actually drawn, not just Latin.
  setup: () => document.fonts.load('900 40px "Noto Serif SC"', document.body.innerText).then(() => document.fonts.load('600 40px "Noto Serif SC"', document.body.innerText)),
  fonts: ['700 40px "Cormorant Garamond"', '600 40px "Cormorant Garamond"', '900 40px "Noto Serif SC"', '600 40px "Noto Serif SC"', '600 40px "Inter"', '700 40px "Inter"'],
});
