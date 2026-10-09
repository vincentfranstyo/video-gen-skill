import { spawnSync } from "child_process";

const SAMPLE_RATE = 48000;
const MUSIC_GAIN = 0.55;
const VOICE_GAIN = 1.1;
const MUSIC_FADE_IN = 0.4;
const MUSIC_FADE_OUT = 1.8;

export type MusicTrack = { file: string; offsetSeconds: number };

export type VoiceClip = { file: string; at: number };

function ffmpeg(args: string[]) {
  const result = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ")}`);
}

/** Narration over optional music (or silence), trimmed to the video length. */
export function buildSoundtrack(opts: { voice: VoiceClip[]; music: MusicTrack | null; duration: number; out: string }) {
  const voiceInputs = opts.voice.flatMap((clip) => ["-i", clip.file]);
  const voiced = opts.voice.map((clip, i) => {
    const delay = Math.round(clip.at * 1000);
    return `[${1 + i}:a]volume=${VOICE_GAIN},adelay=${delay}|${delay}[v${i}]`;
  });
  const music = opts.music
    ? `[0:a]atrim=0:${opts.duration},asetpts=PTS-STARTPTS,afade=t=in:d=${MUSIC_FADE_IN},afade=t=out:st=${opts.duration - MUSIC_FADE_OUT}:d=${MUSIC_FADE_OUT},volume=${MUSIC_GAIN}[music]`
    : `[0:a]atrim=0:${opts.duration}[music]`;
  const base = opts.music
    ? ["-ss", String(opts.music.offsetSeconds), "-i", opts.music.file]
    : ["-f", "lavfi", "-i", `anullsrc=r=${SAMPLE_RATE}:cl=stereo`];
  const layers = opts.voice.map((_, i) => `[v${i}]`);
  const mix = `[music]${layers.join("")}amix=inputs=${layers.length + 1}:normalize=0:duration=first,alimiter=limit=0.95[out]`;

  ffmpeg([
    ...base, ...voiceInputs,
    "-filter_complex", [...voiced, music, mix].join(";"),
    "-map", "[out]", "-ac", "2", "-ar", String(SAMPLE_RATE), opts.out,
  ]);
}
