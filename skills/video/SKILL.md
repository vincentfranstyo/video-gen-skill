---
name: video
description: Make a finished MP4 video directly in this session from a free-form prompt. Four kinds — promo (app/product/launch ads), tutorial (step-by-step how-to of a real web app), narration (voiced stories, history, explainers, lessons, news summaries, podcast-style essays over generated art), motion (pure motion graphics, kinetic typography, logo stings, data stories, optionally unvoiced). Vertical 1080x1920 (TikTok/Reels/Shorts) or 2560x1440 (YouTube). English narration with word-by-word captions. Use whenever the user asks to make, generate, render or edit a video, promo, ad, reel, TikTok, short, explainer, story video, faceless video, motion graphic, animation, intro or sting.
argument-hint: <what the video should be, e.g. "60s faceless story about the Titanic" or "tiktok promo for app.example.com">
---

# video

You build and render the whole video in this session. Brief: `$ARGUMENTS`.

Kit: `${CLAUDE_SKILL_DIR}/kit` (call it `$K`). Jobs: `~/promo-videos/<slug>/` (override `PROMO_JOBS_ROOT`).

First run: if `$K/node_modules` is missing, run `cd $K && bun install && bunx playwright install chromium`. Needs `bun`, `ffmpeg`, `jq`, `curl` on PATH.

## 0. Classify + brief

Pick the kind, then **read `${CLAUDE_SKILL_DIR}/kinds/<kind>.md`** — it overrides the defaults below.

| kind | when |
|---|---|
| `promo` | sell / announce an app, product, feature, launch, event |
| `tutorial` | teach one task in a real web app, step by step |
| `narration` | voice tells a story or explains: history, facts, lessons, news, essays, faceless channel |
| `motion` | the animation is the point: kinetic type, logo sting, data viz, abstract loop, intro |

Settle: subject, the one message, sources of truth (URL, user facts/files, web research with citations), format, length, voice yes/no, music (default none). Ask the user only what blocks you, in one question. Never invent facts, prices, features, quotes or numbers.

## 1. Job

```bash
bun $K/new.ts <slug> "<one-line brief>" --kind <kind> [--format tiktok|youtube]
```
Prints `jobDir`, `format`, `checks`, the assigned **direction** (structure, hook, motion, bpm) and recent jobs of that kind. Follow the direction; never reuse a recent job's hook wording or scene order. Glance once at `$K/refs/*-sheet.jpg` for the quality bar: motion graphics (word pops with blur, big display type, clean recreated UI, zoom-through), never a slideshow of static images or a raw screen recording.

`job.json` holds `kind`, `format`, `look`, `music`, `checks` (`maxGapSeconds`, `narration`), `direction`. Edit `checks` only with a reason the kind file gives.

## 2. Look + assets

- **Look:** brand/app computed colors and fonts if there is a brand; else a palette fitting the subject and direction. Fonts: Google Fonts only. `job.json` `"look": { "colors": { background, ink, accent, pop, card }, "fonts": [...] }`. Text contrast WCAG AA.
- **Generated art:** `$K/imggen.sh "<prompt>" <job>/assets/gen/<name>.png <size> [model]` — `1024x1536` vertical, `1536x1024` horizontal (≈30 s each). Needs `IMAGE_GEN_API_KEY`; `IMAGE_GEN_BASE_URL` / `IMAGE_GEN_MODEL` point it at any OpenAI-compatible endpoint (default OpenAI `gpt-image-1`). If the user has their own `imggen` command on PATH, prefer it. If neither works, ask the user once; never fake images. Image prompt-craft skills, if installed, help. Keep one consistent style string across all prompts of a video (medium, palette, lighting, era). Generate in parallel batches. Never generate fake app UI, real brand logos, real people's likeness, or anything passed off as real evidence (documents, photos of real events).
- **Music (only if asked):** `yt-dlp -x --audio-format wav -o <job>/assets/music.wav "ytsearch1:<query>"`, `python3 $K/beats.py <job>/assets/music.wav` (needs numpy+scipy), set `job.json` `music: { file: "assets/music.wav", title, offsetSeconds, bpm }` with offsetSeconds = drop time − payoff beat × BEAT. Say it is unlicensed. No sound effects ever.

Look at images only through contact sheets ≤1600 px wide (ffmpeg `tile`); never Read full-resolution images one by one.

## 3. Story + narration

`<job>/story.md`: one line per scene — what it says and why it follows the previous one. English only. Scene 1 = **cover title**, fully visible at t = 0 (it is the thumbnail; no pop-in on the title), follows `direction.hook`, held ~2 s.

`<job>/voiceover.json`: `[{ "scene": "<scene id>", "text": "..." }]`, one entry per voiced scene, ≤400 chars each (split long passages across scenes). Then `bun $K/voice.ts <job>` (voice `PROMO_VOICE`, default `en-US-AndrewNeural`; others: `en-US-BrianNeural`, `en-US-GuyNeural`, `en-US-AriaNeural`, `en-US-JennyNeural`, `en-GB-RyanNeural`). It prints each line's last-word time. Scene length = 0.25 s lead + last word + 0.3–0.6 s. Rerun after every voiceover edit.

## 4. Stage

Read `$K/engine/stage-core.js` for the API. Replace `<job>/stage/` (`index.html`, `stage.css`, `stage.js`); the scaffold is only a template.
- `stage.js`: `setBpm(direction.bpm)`, then `createStage({ totalBeats, scenes, fonts, setup, background })`. Scenes `{ id, from, to, draw?(t, el), exit?: false }` in beats; each id is a `.scene` element.
- `seek(t)` is a **pure function of time**: no CSS transitions/animations, timers or `Math.random()` (use `seeded`). Everything that moves is computed from `t` in `draw` / `background` with `progress`, `lerp`, `ease`, `place`.
- Kinetic text: `[data-in="<beat>"]` auto-animates (`data-fx` pop|rise|slam|fade|drop|stretch, `data-rot`, `data-out`); `data-manual` + `kinetic(el, t)` to drive it yourself. `cursorAt` for cursor + click ripple. `createConfetti`/`drawConfetti`, `streamText`, `exitZoom` exist.
- Sizes in `--u` (1% of the short side); vertical overrides under `body.tt`. Link `/engine/captions.css`, set `--caption-font`, `--caption-bg`, `--caption-now`; captions draw bottom-centre — keep that area free.
- Assets from `../assets/shots/` and `../assets/gen/`; a failed image throws.
- Vertical safe area: text within ~90vw; nothing key in the bottom ~15% or right edge. Size display type to fit the width. `flex: none` on blocks that must not shrink.
- Every scene shows its first element right on the cut.

## 5. Check loop

```bash
bun $K/render.ts <job> stills <format> 0,3,8.5,...   # -> <job>/out/stills/; tile into a sheet and look
bun $K/render.ts <job> check <format>                # must print nothing (exit 0)
bun $K/render.ts <job> texts <format>                # every on-screen string
```
Fix cropping, overlap, legibility, foreign fonts, dead air, empty cuts until `check` is clean. Proofread texts + narration yourself: spelling, grammar, contradictions, unsupported claims.

## 6. Post + render

`<job>/out/post.json` before rendering: `{ title, hook, caption, hashtags[], sources[], outline: [{ text, durationSec }] }`. `hook` = cover title exactly as on frame 0 (check compares). Caption ≤2200 chars; 3–8 hashtags without `#`; `sources` = every URL or document used. For YouTube also add `description` and `chapters` (`[{ at: "0:00", title }]`) when the kind file asks.

```bash
bun $K/render.ts <job> video <format>
```
Short videos: foreground with Bash timeout 600000. Longer than ~1.5 min: run it with `run_in_background` and wait for the completion notice (render speed ≈ 10–15 frames/s). Then extract frame 0 + a few frames from the MP4 into a sheet and check them.

Output: `<job>/out/promo-<slug>-<format>.mp4`.

## 7. Report

MP4 path, duration, kind + direction, caption + hashtags, look, what is staged or generated (recreated UI, AI art), sources, music license note, anything unverified.

## Edit an existing job

Text `stage/index.html`, colors/layout `stage/stage.css`, timing `stage/stage.js`, narration `voiceover.json` (+ rerun `voice.ts`). Then check → video.

## Safety

Third-party sites: read-only, never register, pay, message real people or delete data. Logins only via env `APP_USERNAME` / `APP_PASSWORD` the user set beforehand — never ask for a password in chat, never echo it, write it to a file or show it on screen. Avoid close-ups of real people's personal data.
