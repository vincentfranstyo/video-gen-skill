import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { z } from "zod";
import { DEFAULT_VOICE, createEdgeTtsProvider } from "./lib/tts";

/**
 * Speaks `<job>/voiceover.json` (voice: `PROMO_VOICE`, default US English male) and writes one MP3 per
 * line plus `assets/voice/voice.json` (durations and word timings). The stage
 * engine reads that file to place each line at its scene and draw captions.
 */
const voiceoverSchema = z.array(z.object({ scene: z.string().trim().min(1), text: z.string().trim().min(1).max(400) })).min(1);

export type VoiceLine = {
  scene: string;
  text: string;
  file: string;
  durationSec: number;
  words: { text: string; start: number; end: number }[];
};

// Edge reports bare words; captions show them as written, with the punctuation that follows.
function withPunctuation(text: string, words: { text: string }[]): string[] {
  let cursor = 0;
  return words.map((word) => {
    const start = text.indexOf(word.text, cursor);
    if (start < 0) return word.text;
    const nextSpace = text.slice(start).search(/\s/);
    const end = nextSpace < 0 ? text.length : start + nextSpace;
    cursor = end;
    return text.slice(start, end);
  });
}

function mp3Seconds(path: string): number {
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], { encoding: "utf8" });
  if (probe.status !== 0) throw new Error(`ffprobe failed on ${path}: ${probe.stderr}`);
  return Number(probe.stdout.trim());
}

const [jobArg] = process.argv.slice(2);
if (!jobArg) throw new Error("usage: bun voice.ts <job-dir>");
const jobDir = realpathSync(jobArg);
const lines = voiceoverSchema.parse(JSON.parse(readFileSync(`${jobDir}/voiceover.json`, "utf8")));
const voiceDir = `${jobDir}/assets/voice`;
mkdirSync(voiceDir, { recursive: true });

const tts = createEdgeTtsProvider({ voice: process.env.PROMO_VOICE || DEFAULT_VOICE });
const spoken: VoiceLine[] = [];
for (const [index, line] of lines.entries()) {
  const speech = await tts.synthesize(line.text);
  const file = `${index}.mp3`;
  const written = withPunctuation(line.text, speech.words);
  writeFileSync(`${voiceDir}/${file}`, speech.mp3);
  spoken.push({
    scene: line.scene,
    text: line.text,
    file,
    durationSec: Number(Math.max(speech.durationMs / 1000, mp3Seconds(`${voiceDir}/${file}`)).toFixed(2)),
    words: speech.words.map((word, wordIndex) => ({
      text: written[wordIndex],
      start: Number((word.offsetMs / 1000).toFixed(3)),
      end: Number(((word.offsetMs + word.durationMs) / 1000).toFixed(3)),
    })),
  });
  const lastWordEnd = spoken.at(-1)!.words.at(-1)?.end ?? spoken.at(-1)!.durationSec;
  console.log(`${line.scene}: last word ends at ${lastWordEnd}s (clip ${spoken.at(-1)!.durationSec}s) — ${line.text.slice(0, 60)}`);
}
writeFileSync(`${voiceDir}/voice.json`, JSON.stringify(spoken, null, 2));
console.log(`total ${spoken.reduce((sum, line) => sum + line.durationSec, 0).toFixed(1)}s of narration → ${voiceDir}/voice.json`);
