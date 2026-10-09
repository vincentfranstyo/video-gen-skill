import type { Page } from "playwright";
import { spawn } from "child_process";
import { mkdirSync, realpathSync } from "fs";
import { basename } from "path";
import { buildSoundtrack, type MusicTrack, type VoiceClip } from "./audio";
import { launchBrowser } from "./lib/browser";
import { checkTimes, croppedTextAt, hasContentAt, foreignFonts, screenTextAt, type StageScene } from "./lib/layout-check";
import { existsSync } from "fs";
import type { Direction } from "./directions";

const ENGINE_DIR = realpathSync(new URL("./engine", import.meta.url).pathname);
const FPS = 30;
const JPEG_QUALITY = 95;
// A voiced scene keeps this much room after its last word before the cut.
const VOICE_TAIL_SECONDS = 0.2;
// Longer silence between two narration lines reads as dead air.
const MAX_NARRATION_GAP_SECONDS = 0.9;
// A cut must land on something: the next scene shows content this soon after it starts.
const FIRST_CONTENT_SECONDS = 0.4;

const FORMATS = {
  youtube: { query: "yt", viewport: { width: 1280, height: 720 }, scale: 2 },
  tiktok: { query: "tt", viewport: { width: 540, height: 960 }, scale: 2 },
} as const;
type FormatName = keyof typeof FORMATS;

// `look` is written by the agent from the app it films: its colors and the Google Fonts the video uses.
type Look = { colors: Record<string, string>; fonts: string[] };
// `checks` loosens gates per kind: long narration allows longer pauses, pure motion pieces may be unvoiced.
type Checks = { maxGapSeconds?: number; narration?: boolean };
type Job = { music: MusicTrack | null; direction?: Direction; look?: Look | null; checks?: Checks };
type StageVoice = VoiceClip & { scene: string; durationSec: number; words: { start: number; end: number }[] };
type Stage = { BEAT: number; duration: number; scenes?: StageScene[]; voice?: StageVoice[]; seek: (t: number) => void; ready: Promise<void> };
declare global { interface Window { stage: Stage } }

// The job folder is the web root and `/engine/*` the shared stage engine, so a job can live anywhere.
function serveJob() {
  return Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: async (request) => {
      const path = decodeURIComponent(new URL(request.url).pathname);
      if (path.includes("..")) return new Response(null, { status: 400 });
      const file = Bun.file(
        path.startsWith("/engine/") ? ENGINE_DIR + path.slice("/engine".length) : JOB_DIR + path,
      );
      return (await file.exists()) ? new Response(file) : new Response(null, { status: 404 });
    },
  });
}

async function openStage(format: FormatName, baseUrl: string) {
  const { query, viewport, scale } = FORMATS[format];
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale });
  page.on("pageerror", (error) => { throw error; });
  await page.goto(`${baseUrl}/stage/index.html?format=${query}`);
  await page.evaluate(() => window.stage.ready);
  return { browser, page };
}

async function frameAt(page: Page, t: number) {
  await page.evaluate((time) => window.stage.seek(time), t);
  return page.screenshot({ type: "jpeg", quality: JPEG_QUALITY });
}

async function renderStills(format: FormatName, baseUrl: string, times: number[]) {
  const { browser, page } = await openStage(format, baseUrl);
  mkdirSync(`${OUT_DIR}stills`, { recursive: true });
  for (const t of times) await Bun.write(`${OUT_DIR}stills/${format}-${t.toFixed(2)}.jpg`, await frameAt(page, t));
  await browser.close();
}

async function renderVideo(format: FormatName, baseUrl: string) {
  const { browser, page } = await openStage(format, baseUrl);
  const { duration, voice } = await page.evaluate(() => ({ duration: window.stage.duration, voice: window.stage.voice ?? [] }));
  const silent = `${OUT_DIR}${format}-silent.mp4`;
  const encoder = spawn("ffmpeg", [
    "-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-pix_fmt", "yuv420p", "-movflags", "+faststart", silent,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const encoded = new Promise<void>((resolve, reject) =>
    encoder.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))));

  const frames = Math.round(duration * FPS);
  for (let i = 0; i < frames; i++) {
    const frame = await frameAt(page, i / FPS);
    if (!encoder.stdin.write(frame)) await new Promise((resolve) => encoder.stdin.once("drain", resolve));
    if (i % FPS === 0) process.stdout.write(`\r${format} ${i}/${frames}`);
  }
  encoder.stdin.end();
  await encoded;
  await browser.close();
  console.log(`\r${format} ${frames}/${frames} frames`);
  return { silent, duration, voice: voice.map(({ file, at }) => ({ file: `${JOB_DIR}/${file}`, at })) };
}

// Prints one line per piece of text that leaves the safe area; exits 1 when there is any.
async function checkLayout(format: FormatName, baseUrl: string): Promise<string[]> {
  const { browser, page } = await openStage(format, baseUrl);
  const { scenes, beat, voice } = await page.evaluate(() => ({ scenes: window.stage.scenes, beat: window.stage.BEAT, voice: window.stage.voice ?? [] }));
  if (!scenes) {
    await browser.close();
    return ["stage.js must build window.stage with createStage from /engine/stage-core.js"];
  }
  const problems: string[] = [];
  const maxGap = job.checks?.maxGapSeconds ?? MAX_NARRATION_GAP_SECONDS;
  if (voice.length === 0 && job.checks?.narration !== false) problems.push("no narration: write voiceover.json and run voice.ts before rendering");
  for (const line of voice) {
    const scene = scenes.find(({ id }) => id === line.scene)!;
    const needs = line.at + (line.words.at(-1)?.end ?? line.durationSec) + VOICE_TAIL_SECONDS;
    if (needs > scene.to) problems.push(`scene ${scene.id} is ${(scene.to - scene.from).toFixed(1)}s but its narration needs ${(needs - scene.from).toFixed(1)}s — lengthen the scene or shorten the line`);
  }
  const ordered = [...voice].sort((a, b) => a.at - b.at);
  // Measured from the last spoken word: the MP3 itself ends with a quiet tail.
  ordered.slice(1).forEach((next, i) => {
    const lastWordEnd = ordered[i].words.at(-1)?.end ?? ordered[i].durationSec;
    const gap = next.at + (next.words[0]?.start ?? 0) - (ordered[i].at + lastWordEnd);
    if (gap > maxGap) problems.push(`${gap.toFixed(1)}s of dead air between the narration of ${ordered[i].scene} and ${next.scene} (max ${maxGap}s) — shorten ${ordered[i].scene}`);
  });
  for (const scene of scenes.slice(1)) {
    if (!(await hasContentAt(page, scene.from + FIRST_CONTENT_SECONDS))) problems.push(`scene ${scene.id} is empty ${FIRST_CONTENT_SECONDS}s after its cut — bring its first element in right on the cut`);
  }
  const postPath = `${JOB_DIR}/out/post.json`;
  if (existsSync(postPath)) {
    const hook: string = (await Bun.file(postPath).json()).hook ?? "";
    const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
    const cover = await screenTextAt(page, 0);
    if (!cover.includes(normalize(hook))) problems.push(`frame 0 shows "${cover}" but post.json hook is "${hook}" — the cover title must read exactly the hook, punctuation included`);
  }
  const allowedFonts = job.look?.fonts ?? [];
  if (allowedFonts.length === 0) problems.push(`job.json look.fonts is empty: list the Google Fonts families the stage uses`);
  for (const family of allowedFonts) {
    const loaded = await page.evaluate((name) => document.fonts.check(`16px "${name}"`) && [...document.fonts].some((face) => face.family.replace(/["']/g, "") === name && face.status === "loaded"), family);
    if (!loaded) problems.push(`font ${family} from job.json look.fonts did not load: link it from Google Fonts and list it in createStage fonts`);
  }
  const foreign = new Map<string, string>();
  for (const t of checkTimes(scenes, beat)) {
    const scene = scenes.find(({ from, to }) => t >= from && t < to)?.id ?? "?";
    for (const text of await croppedTextAt(page, t)) problems.push(`${format} ${t}s ${scene}: "${text}" is cropped or outside the safe area`);
    for (const [family, text] of await foreignFonts(page, allowedFonts)) if (!foreign.has(family)) foreign.set(family, text);
  }
  for (const [family, text] of foreign) problems.push(`font ${family} (e.g. "${text}") is not in job.json look.fonts; allowed: ${allowedFonts.join(", ")}`);
  await browser.close();
  return problems;
}

// Every distinct piece of on-screen text, sampled each second, for the proofread gate.
async function screenTexts(format: FormatName, baseUrl: string): Promise<string[]> {
  const { browser, page } = await openStage(format, baseUrl);
  const duration = await page.evaluate(() => window.stage.duration);
  const seen = new Set<string>();
  for (let t = 0; t < duration; t += 1) {
    const text = await screenTextAt(page, t);
    if (text) seen.add(text);
  }
  await browser.close();
  // Text that builds up on screen is sampled at every stage; keep only the fullest version.
  return [...seen].filter((text) => ![...seen].some((other) => other !== text && other.includes(text)));
}

function mux(video: string, audio: string, out: string) {
  const result = Bun.spawnSync(["ffmpeg", "-v", "error", "-y", "-i", video, "-i", audio, "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest", out]);
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

const [jobArg, mode = "video", formatArg = "all", timesArg = ""] = process.argv.slice(2);
if (!jobArg) throw new Error("usage: bun render.ts <job-dir> [video|stills|check|texts] [all|youtube|tiktok] [t1,t2,...]");
const JOB_DIR = realpathSync(jobArg);
const OUT_DIR = `${JOB_DIR}/out/`;
const job: Job = await Bun.file(`${JOB_DIR}/job.json`).json();
const formats: FormatName[] = formatArg === "all" ? ["youtube", "tiktok"] : [formatArg as FormatName];
if (!formats.every((format) => format in FORMATS)) throw new Error(`unknown format: ${formatArg}`);

mkdirSync(OUT_DIR, { recursive: true });
const server = serveJob();
const baseUrl = `http://localhost:${server.port}`;

if (mode === "check") {
  const problems = (await Promise.all(formats.map((format) => checkLayout(format, baseUrl)))).flat();
  for (const problem of problems) console.log(problem);
  server.stop();
  process.exit(problems.length > 0 ? 1 : 0);
}

if (mode === "texts") {
  for (const text of await screenTexts(formats[0], baseUrl)) console.log(text);
  server.stop();
  process.exit(0);
}

if (mode === "stills") {
  const times = timesArg.split(",").map(Number);
  for (const format of formats) await renderStills(format, baseUrl, times);
} else {
  for (const format of formats) {
    const { silent, duration, voice } = await renderVideo(format, baseUrl);
    const soundtrack = `${OUT_DIR}${format}-audio.wav`;
    const music = job.music && { ...job.music, file: `${JOB_DIR}/${job.music.file}` };
    buildSoundtrack({ voice, music, duration, out: soundtrack });
    mux(silent, soundtrack, `${OUT_DIR}promo-${basename(JOB_DIR)}-${format}.mp4`);
  }
}
server.stop();
