// Every visual is a pure function of time, so the renderer can seek to any frame.
export const FORMAT = new URLSearchParams(location.search).get("format") === "tt" ? "tt" : "yt";
document.body.classList.add(FORMAT);

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
export const lerp = (a, b, p) => a + (b - a) * p;
export const ease = {
  outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inCubic: (x) => x * x * x,
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outBack: (x) => 1 + 2.9 * Math.pow(x - 1, 3) + 1.9 * Math.pow(x - 1, 2),
};

// Read `BEAT` and `U` through `timing` so imports stay live after setBpm / init.
export const timing = { BEAT: 0.5, U: 1 };

// Call first, before anything converts beats to seconds.
export function setBpm(bpm) {
  timing.BEAT = 60 / bpm;
  return timing.BEAT;
}
export const secondsAt = (beat) => beat * timing.BEAT;
export const progress = (t, beat, durationSeconds) => clamp((t - secondsAt(beat)) / durationSeconds);

export function seeded(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function place(el, { o = 1, x = 0, y = 0, s = 1, r = 0, blur = 0 }) {
  el.style.opacity = o;
  el.style.transform = `translate(${x}px, ${y}px) scale(${s}) rotate(${r}deg)`;
  el.style.filter = blur > 0.1 ? `blur(${blur}px)` : "none";
}

// Kinetic element driven by data-in / data-out / data-fx (pop|rise|slam|fade|drop|stretch) / data-rot.
export function kinetic(el, t) {
  const U = timing.U;
  const inBeat = Number(el.dataset.in);
  const kind = el.dataset.fx ?? "pop";
  const rest = Number(el.dataset.rot ?? 0);
  const p = progress(t, inBeat, kind === "slam" ? 0.4 : 0.55);
  if (p <= 0) return place(el, { o: 0 });
  const e = ease.outBack(p);
  const settle = ease.outExpo(p);
  const state = { o: clamp(p * 4), x: 0, y: 0, s: 1, r: rest, blur: (1 - settle) * 1.4 * U };
  if (kind === "pop") Object.assign(state, { y: (1 - e) * 7 * U, s: lerp(0.6, 1, e), r: rest + (1 - e) * 8 });
  if (kind === "rise") Object.assign(state, { y: (1 - settle) * 9 * U });
  if (kind === "slam") Object.assign(state, { s: lerp(2.4, 1, e), r: rest - (1 - e) * 12, blur: (1 - settle) * 2.5 * U });
  if (kind === "fade") Object.assign(state, { o: settle, blur: (1 - settle) * 3 * U });
  if (kind === "drop") Object.assign(state, { y: -(1 - e) * 14 * U });
  if (kind === "stretch") Object.assign(state, { s: lerp(0.2, 1, e), x: 0, blur: 0 });
  if (el.dataset.out) {
    const q = progress(t, Number(el.dataset.out), 0.3);
    state.o *= 1 - q;
    state.y -= ease.inCubic(q) * 6 * U;
    state.blur += q * 2 * U;
  }
  place(el, state);
}

export function exitZoom(el, t, endBeat) {
  const U = timing.U;
  const q = progress(t, endBeat - 0.9, secondsAt(0.9));
  place(el, { o: 1 - ease.inCubic(q), s: 1 + ease.inCubic(q) * 0.35, blur: ease.inCubic(q) * 3 * U });
}

export function streamText(el, text, t, startBeat, seconds) {
  const n = Math.floor(text.length * progress(t, startBeat, seconds));
  el.textContent = text.slice(0, n);
  el.style.display = n > 0 ? "block" : "none";
}

// Moves `cursor` onto `target` and ripples on click; returns the press amount (0..1) for the target's squash.
export function cursorAt(t, { cursor, ripple, target, fromBeat, toBeat, clickBeat }) {
  const U = timing.U;
  const rect = target.getBoundingClientRect();
  const tx = rect.left + rect.width * 0.55;
  const ty = rect.top + rect.height * 0.55;
  const p = ease.inOutCubic(progress(t, fromBeat, secondsAt(toBeat - fromBeat)));
  const x = lerp(innerWidth * 0.92, tx, p);
  const y = lerp(innerHeight * 1.05, ty, p) + Math.sin(p * Math.PI) * -8 * U;
  const press = progress(t, clickBeat, 0.12) - progress(t, clickBeat + 0.3, 0.12);
  cursor.style.opacity = t >= secondsAt(fromBeat) ? 1 : 0;
  cursor.style.transform = `translate(${x}px, ${y}px) scale(${1 - press * 0.2})`;
  const r = progress(t, clickBeat, 0.5);
  ripple.style.opacity = r > 0 && r < 1 ? 1 - r : 0;
  ripple.style.transform = `translate(${tx}px, ${ty}px) scale(${0.3 + r * 1.6})`;
  return press;
}

export function createConfetti(box, { colors, count = 90, seed = 7 }) {
  const random = seeded(seed);
  return Array.from({ length: count }, (_, i) => {
    const el = document.createElement("i");
    const size = 1 + random() * 1.6;
    el.style.width = `calc(${size} * var(--u))`;
    el.style.height = `calc(${size * (random() > 0.5 ? 2.2 : 1)} * var(--u))`;
    el.style.background = colors[i % colors.length];
    el.style.borderRadius = random() > 0.7 ? "50%" : "2px";
    box.append(el);
    const angle = -Math.PI / 2 + (random() - 0.5) * Math.PI * 1.3;
    return { el, angle, speed: 70 + random() * 90, spin: (random() - 0.5) * 1400, sway: random() * 6 };
  });
}

export function drawConfetti(pieces, t, burstBeat) {
  const U = timing.U;
  const local = t - secondsAt(burstBeat);
  pieces.forEach(({ el, angle, speed, spin, sway }) => {
    const x = innerWidth / 2 + Math.cos(angle) * speed * U * local * 0.6 + Math.sin(local * 5 + sway) * 2 * U;
    const y = innerHeight * 0.55 + Math.sin(angle) * speed * U * local * 0.6 + 80 * U * local * local;
    el.style.transform = `translate(${x}px, ${y}px) rotate(${spin * local}deg)`;
    el.style.opacity = local > 0 ? 1 : 0;
  });
}

// Narration starts this long after its scene cuts in, so the cut lands before the first word.
const VOICE_LEAD_SECONDS = 0.25;
const CAPTION_MAX_CHARS = 26;
// A caption stays up this long after its last word, never into the next line or across a cut into silence.
const CAPTION_HOLD_SECONDS = 0.4;

// Splits a line's words into caption chunks short enough for a phone; a sentence end always starts a new chunk.
function captionChunks(words) {
  const chunks = [];
  let sentenceEnded = true;
  for (const word of words) {
    const last = chunks.at(-1);
    const length = last ? last.reduce((sum, w) => sum + w.text.length + 1, 0) : 0;
    if (sentenceEnded || length + word.text.length > CAPTION_MAX_CHARS) chunks.push([word]);
    else last.push(word);
    sentenceEnded = /[.!?]$/.test(word.text);
  }
  return chunks;
}

function createCaptions(lines) {
  const box = document.createElement("div");
  box.className = "cc";
  document.body.append(box);
  const chunks = lines.flatMap((line) =>
    captionChunks(line.words).map((words) => ({
      from: line.at + words[0].start,
      to: line.at + words.at(-1).end,
      words: words.map((word) => ({ ...word, start: line.at + word.start, end: line.at + word.end })),
    })));
  let shown = null;
  return (t) => {
    const chunk = chunks.find((c, i) => t >= c.from && t < Math.min(chunks[i + 1]?.from ?? Infinity, c.to + CAPTION_HOLD_SECONDS));
    if (chunk !== shown) {
      box.replaceChildren(...(chunk?.words ?? []).map((word) => Object.assign(document.createElement("span"), { textContent: word.text })));
      shown = chunk;
    }
    if (!chunk) return;
    [...box.children].forEach((span, i) => {
      const word = chunk.words[i];
      span.className = t >= word.start && t < word.end ? "now" : t >= word.end ? "said" : "";
    });
  };
}

/**
 * Wires `window.stage` for render.ts. Call setBpm first.
 * Narration: if `../assets/voice/voice.json` exists (written by voice.ts), each line plays from the
 * start of its scene and the engine draws word-by-word captions; `window.stage.voice` lists the clips.
 * scenes: [{ id, from, to, draw?(t, el), exit?: false }] in beats; each id is a `.scene` element.
 * Every `[data-in]` inside the active scene animates through `kinetic` unless it carries `data-manual`.
 * Text marked `data-bleed` is decoration allowed to run off the frame; render.ts `check` skips it.
 * fonts: CSS font shorthands that must load before the first frame.
 */
export function createStage({ totalBeats, scenes, fonts = [], setup, background }) {
  const voice = [];
  let drawCaptions = null;

  function seek(t) {
    const beat = t / timing.BEAT;
    background?.(t);
    for (const scene of scenes) {
      const el = document.getElementById(scene.id);
      const active = beat >= scene.from && beat < scene.to;
      el.style.display = active ? "flex" : "none";
      if (!active) continue;
      $$("[data-in]", el).forEach((node) => {
        if (!("manual" in node.dataset)) kinetic(node, t);
      });
      scene.draw?.(t, el);
      const inner = $(".inner", el);
      if (scene.exit !== false && inner) exitZoom(inner, t, scene.to);
    }
    drawCaptions?.(t);
  }

  async function loadVoice() {
    const response = await fetch("../assets/voice/voice.json");
    if (!response.ok) return;
    const lines = await response.json();
    for (const line of lines) {
      const scene = scenes.find(({ id }) => id === line.scene);
      if (!scene) throw new Error(`voice line for unknown scene ${line.scene}`);
      voice.push({ ...line, file: `assets/voice/${line.file}`, at: secondsAt(scene.from) + VOICE_LEAD_SECONDS });
    }
    drawCaptions = createCaptions(voice);
  }

  async function init() {
    timing.U = Math.min(innerWidth, innerHeight) / 100;
    await setup?.();
    await loadVoice();
    await Promise.all(fonts.map((font) => document.fonts.load(font)));
    await document.fonts.ready;
    await Promise.all($$("img").map((img) => img.decode().catch(() => { throw new Error(`image failed: ${img.src}`); })));
    seek(0);
  }

  window.stage = {
    BEAT: timing.BEAT,
    duration: totalBeats * timing.BEAT,
    scenes: scenes.map(({ id, from, to }) => ({ id, from: secondsAt(from), to: secondsAt(to) })),
    voice,
    seek,
    ready: init(),
  };
}
