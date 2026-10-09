# video-gen-skill

An agent skill that makes **finished MP4 videos** from a one-line prompt, directly in your coding agent session (Claude Code, Codex, Cursor and others supported by [`skills`](https://github.com/vercel-labs/skills)).

```bash
npx skills add vincentfranstyo/video-gen-skill
```

Then ask your agent:

> make a narration video explaining the Chinese idiom 胸有成竹

## Prerequisites

Install these before you ask for your first video.

| tool | used for | check |
|---|---|---|
| [Node.js](https://nodejs.org) 18+ | `npx skills add` | `node -v` |
| [bun](https://bun.sh) 1.1+ | runs the kit scripts | `bun -v` |
| [ffmpeg](https://ffmpeg.org) (with `ffprobe`) | encoding video and audio | `ffmpeg -version` |
| `jq`, `curl` | image generation script | `jq --version` |
| Playwright Chromium | rendering frames | installed on first run |
| An agent that supports skills | Claude Code, Codex, Cursor, … | |
| Image API key | AI art for narration and promo videos | `echo $IMAGE_GEN_API_KEY` |

Install commands:

```bash
# macOS
brew install oven-sh/bun/bun ffmpeg jq

# Debian / Ubuntu
sudo apt install ffmpeg jq curl
curl -fsSL https://bun.sh/install | bash

# Windows: use WSL and follow the Ubuntu steps
```

On the first run, the agent installs the kit's dependencies inside the skill folder. You can also run it yourself:

```bash
cd <skill dir>/kit && bun install && bunx playwright install chromium
# Linux may also need system libraries: bunx playwright install-deps chromium
```

**Image generation.** Set a key for any OpenAI-compatible `/images/generations` endpoint. Image calls bill to your own API account.

```bash
export IMAGE_GEN_API_KEY=sk-...
export IMAGE_GEN_BASE_URL=https://api.openai.com/v1   # default
export IMAGE_GEN_MODEL=gpt-image-1                    # default
```

Without a key you can still make `motion` videos and `promo`/`tutorial` videos built from screenshots. The agent asks before it falls back.

**Optional:**
- Background music with beat sync: [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) and Python 3 with `numpy` and `scipy`.
- Narration voice: needs internet access to Microsoft Edge's read-aloud service. No key needed.

## Example

`examples/chengzhu/`: a 76 s narration video, made from one prompt.

![contact sheet](examples/chengzhu/sheet.jpg)

▶ [chengzhu-720p.mp4](examples/chengzhu/chengzhu-720p.mp4)

The example folder holds everything the agent wrote: `story.md`, `voiceover.json`, the `stage/` HTML/CSS/JS, and `post.json` (title, caption, hashtags, chapters).

## What it makes

| kind | for |
|---|---|
| `promo` | app / product / launch ads |
| `tutorial` | step-by-step walkthrough of a real web app |
| `narration` | voiced stories, history, explainers, lessons, news |
| `motion` | kinetic type, logo stings, data viz, intros (voice optional) |

Formats: vertical 1080×1920 (TikTok / Reels / Shorts) or 2560×1440 (YouTube). English narration with word-by-word captions.

## How it works

1. The agent writes the script, then `voice.ts` reads it aloud (Microsoft Edge read-aloud voices, free, no key) and records the timing of every word.
2. It generates one illustration per scene with an image API.
3. It builds the video as an HTML page where every frame depends only on time `t`: Ken Burns motion, kinetic text, captions.
4. `render.ts` opens that page in headless Chromium, takes a screenshot of each frame at 30 fps, checks the layout (cropped text, dead air, empty cuts), then muxes the frames with the voice using ffmpeg.

## Configuration

| env | default | |
|---|---|---|
| `PROMO_JOBS_ROOT` | `~/promo-videos` | where job folders are created |
| `PROMO_VOICE` | `en-US-AndrewNeural` | any Edge neural voice |
| `PROMO_BROWSER_CHANNEL` | Playwright Chromium | `chrome` uses your installed Chrome |

## Notes

- Voice uses Microsoft Edge's undocumented read-aloud endpoint. It is free, but it can break if Microsoft changes it.
- The skill refuses to generate fake UI, real logos, real people's likenesses, or fake documents.
- Music fetched with `yt-dlp` is not licensed. The agent will say so.

## License

MIT
