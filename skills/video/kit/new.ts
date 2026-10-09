import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "fs";
import { parseArgs } from "util";
import { KINDS, pickDirection, type Kind } from "./directions";

// Scaffolds a video job: stage scaffold, job.json with a fresh creative direction that avoids recent jobs of the same kind.
const KIT = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const ROOT = process.env.PROMO_JOBS_ROOT || `${process.env.HOME}/promo-videos`;
const RECENT_JOBS = 5;

// Per-kind defaults; the agent may override them in job.json.
const DEFAULTS: Record<Kind, { format: string; checks: { maxGapSeconds: number; narration: boolean } }> = {
  promo: { format: "tiktok", checks: { maxGapSeconds: 0.9, narration: true } },
  tutorial: { format: "tiktok", checks: { maxGapSeconds: 0.9, narration: true } },
  narration: { format: "youtube", checks: { maxGapSeconds: 1.6, narration: true } },
  motion: { format: "tiktok", checks: { maxGapSeconds: 1.2, narration: false } },
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { kind: { type: "string", default: "promo" }, format: { type: "string" } },
});
const kind = values.kind as Kind;
const [slugArg, ...briefWords] = positionals;
if (!slugArg || !KINDS.includes(kind)) throw new Error(`usage: bun new.ts <slug> "<brief>" --kind ${KINDS.join("|")} [--format tiktok|youtube]`);
const slug = slugArg.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const jobDir = `${ROOT}/${slug}`;
if (existsSync(jobDir)) throw new Error(`job already exists: ${jobDir}`);

const recent = existsSync(ROOT)
  ? readdirSync(ROOT).filter((name) => existsSync(`${ROOT}/${name}/job.json`))
      .map((name) => ({ name, job: JSON.parse(readFileSync(`${ROOT}/${name}/job.json`, "utf8")) }))
      .filter(({ job }) => (job.direction?.kind ?? "tutorial") === kind)
      .slice(-RECENT_JOBS)
      .map(({ name, job }) => {
        const post = existsSync(`${ROOT}/${name}/out/post.json`) ? JSON.parse(readFileSync(`${ROOT}/${name}/out/post.json`, "utf8")) : null;
        return { name, direction: job.direction, hook: post?.hook ?? null, outline: post?.outline?.map((s: { text: string }) => s.text) ?? [] };
      })
  : [];

const direction = pickDirection(Date.now(), recent.map((r) => r.direction ?? {}), kind);
const { format, checks } = { ...DEFAULTS[kind], ...(values.format && { format: values.format }) };
for (const dir of ["assets/shots", "assets/gen", "out"]) mkdirSync(`${jobDir}/${dir}`, { recursive: true });
cpSync(`${KIT}/engine/scaffold/stage`, `${jobDir}/stage`, { recursive: true });
// Bun resolves `playwright` from the script's folder.
symlinkSync(`${KIT}/node_modules`, `${jobDir}/node_modules`);
const job = { kind, format, brief: briefWords.join(" "), appUrl: null, look: null, music: null, checks, direction };
writeFileSync(`${jobDir}/job.json`, JSON.stringify(job, null, 2));
console.log(JSON.stringify({ jobDir, kind, format, checks, direction, recent }, null, 2));
