export type Kind = "promo" | "tutorial" | "narration" | "motion";
export const KINDS: Kind[] = ["promo", "tutorial", "narration", "motion"];

export type Direction = {
  seed: number;
  kind?: Kind;
  structure: string;
  hook: string;
  motion: string;
  bpm: number;
};

type Lists = { structures: string[]; hooks: string[]; motions: string[]; bpm: { min: number; max: number } };

const SHORT_MOTIONS = [
  "word-by-word pops with blur, bouncy overshoot",
  "hard cuts on every beat, slams and screen shakes",
  "smooth masked wipes and sliding panels",
  "sticker-style tilted cards dropping in with shadows",
  "typewriter and terminal feel, cursor-driven reveals",
  "zoom-through transitions between scenes, depth and scale",
];

const LISTS: Record<Kind, Lists> = {
  tutorial: {
    structures: [
      "goal-first: show the finished result, then rewind and walk the steps that get there",
      "step-by-step: a numbered walkthrough with a progress rail, one screen per step",
      "problem-first: the painful manual way, then the same job done in the app",
      "quick tips: 3–5 things most users miss in the app, one full-screen card each",
      "challenge: 'can you <task> in 1 minute?' then prove it click by click",
      "day-in-the-life: one user's task from start to finish inside the app",
    ],
    // Cover-title patterns; each names the app or task and opens a curiosity gap.
    hooks: [
      "how-to question: 'How to <task> in <app>?'",
      "speed promise: '<task> in 3 Clicks'",
      "beginner promise: '<app> for Beginners'",
      "hidden feature: 'The <app> Feature Nobody Uses'",
      "warning: 'Stop Doing <task> by Hand'",
    ],
    motions: SHORT_MOTIONS,
    bpm: { min: 96, max: 150 },
  },
  promo: {
    structures: [
      "pain → product → payoff: name the frustration, reveal the product, show the win",
      "feature rapid-fire: 3–4 features, one punchy full-screen card each, then CTA",
      "before / after: split or wipe between the old way and life with the product",
      "launch teaser: build mystery with fragments, reveal the product on the drop",
      "social proof: a real stat or quote from the brief, then why it holds",
      "one big benefit: a single promise dramatised three ways",
    ],
    hooks: [
      "bold claim: '<product> Does <benefit>'",
      "question: 'Still <pain>?'",
      "announcement: 'Meet <product>'",
      "number: '<n> Reasons to Try <product>'",
      "contrast: '<old way> vs <product>'",
    ],
    motions: SHORT_MOTIONS,
    bpm: { min: 100, max: 150 },
  },
  narration: {
    structures: [
      "chronological: open on the most striking moment, then tell it in order",
      "mystery: pose the question, unfold clues, answer at the end",
      "chapters: 3–6 titled chapters with a title card each",
      "explainer: the idea in one line, then why, how, and what it means",
      "countdown: ranked list building to number one",
      "myth vs fact: a common belief, then what is actually true",
    ],
    hooks: [
      "question: 'Why Did <thing> Happen?'",
      "statement: 'The Story of <subject>'",
      "secret: 'What Nobody Tells You About <subject>'",
      "stakes: 'How <subject> Changed <thing>'",
      "number: '<n> Facts About <subject>'",
    ],
    motions: [
      "slow Ken Burns pans and zooms over illustrations, soft crossfades",
      "parallax layers: foreground, subject and background drifting at different speeds",
      "documentary: archival-style frames, lower-third labels, map and timeline inserts",
      "paper cut-out: layered shapes sliding in with soft shadows",
      "minimal: one image per scene, slow push-in, quote-style kinetic text",
    ],
    bpm: { min: 70, max: 100 },
  },
  motion: {
    structures: [
      "kinetic typography: the message carried entirely by animated type",
      "shape story: abstract shapes morph to illustrate each idea",
      "data story: numbers and charts animate to make one point",
      "logo / brand sting: build up to a mark or name reveal",
      "loop: an ending that flows back into the first frame",
      "icon journey: a line or object travels through scenes connecting them",
    ],
    hooks: [
      "single word: one huge word that sets the theme",
      "statement: a short bold sentence",
      "number: one big stat",
      "question: a one-line question",
      "brand: the name or mark itself",
    ],
    motions: [
      ...SHORT_MOTIONS,
      "geometric: lines draw on, shapes snap to a grid",
      "liquid: blobs and gradients morphing between scenes",
      "flat 2D: bouncy squash-and-stretch characters and props",
    ],
    bpm: { min: 90, max: 140 },
  },
};

function pick<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = Math.imul(state ^ (state >>> 15), 1 | state);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One random creative direction per job, from the lists of its kind. `avoid` holds the
 * directions of recent jobs; a pick that repeats a recent structure, hook or motion is re-rolled.
 */
export function pickDirection(seed: number, avoid: Partial<Direction>[] = [], kind: Kind = "tutorial"): Direction {
  const lists = LISTS[kind];
  const random = mulberry32(seed);
  const fresh = <T>(items: T[], used: Set<unknown>) => {
    const unused = items.filter((item) => !used.has(item));
    return pick(unused.length > 0 ? unused : items, random);
  };
  return {
    seed,
    kind,
    structure: fresh(lists.structures, new Set(avoid.map((d) => d.structure))),
    hook: fresh(lists.hooks, new Set(avoid.map((d) => d.hook))),
    motion: fresh(lists.motions, new Set(avoid.map((d) => d.motion))),
    bpm: Math.round(lists.bpm.min + random() * (lists.bpm.max - lists.bpm.min)),
  };
}
