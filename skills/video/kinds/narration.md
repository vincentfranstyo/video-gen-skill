# kind: narration

A voice tells or explains; visuals illustrate. Covers: faceless story / history channel, explainer / lesson, news or topic summary, podcast-style essay. Default format `youtube` (2560x1440) for >60 s, `tiktok` for ≤60 s shorts (`--format tiktok`). `checks.maxGapSeconds` is 1.6 (room for dramatic pauses).

## Script first

1. Research when the topic is factual: WebSearch/WebFetch, prefer primary and reputable sources, note each URL in `story.md` next to the claim it supports. Dates, names, numbers must match a source. Mark disputed points as disputed. News: say the date of the information.
2. Write the full script in `<job>/script.md` before anything visual. Length: ~150 spoken words per minute. Hook in the first sentence (it is the cover title said aloud), a payoff or takeaway at the end, a reason to keep watching every ~30 s (open question, reveal, "but").
3. Split the script into scenes of one idea each (≤400 chars of narration; 4–12 s for shorts, 6–20 s for long form). `voiceover.json` = the script, scene by scene.

Subtype tone:
- **story / history:** past tense, concrete details, a protagonist, stakes, chronology from `direction.structure`.
- **explainer / lesson:** the idea in one line, then why, how, example, recap. Diagrams over decoration: build them in HTML/SVG on the stage, label them.
- **news / summary:** who/what/when/where first, then why it matters, then what's next. Neutral tone; cite sources in `post.json` `sources` and on screen as a small source line where a claim appears.
- **podcast-style essay:** conversational, first person plural, one argument developed; pull quotes as kinetic type.

## Visuals

- One **generated image per scene** (`$K/imggen.sh`, size matching the format), all from one style string fixed in `story.md` (e.g. "muted watercolor, warm sepia palette, soft light, 1900s"). Never make a real person's likeness or a fake photo/document passed off as real; for real people or events use illustration-style, symbolic or map/timeline imagery, and say so in the report.
- Motion per `direction.motion`: every image moves the whole time it is on screen (Ken Burns push/pan computed from `t`, parallax layers by masking parts of one image, slow rotate). Never a still frame for more than 1 s.
- On-screen text is sparse: chapter titles, a date/place lower-third, key numbers, a quote. The captions carry the words.
- Chapters for >90 s: a title card per chapter; list them in `post.json` `chapters`.
- Long renders: background the render (see SKILL.md §6).

## Post

`post.json`: also `description` (YouTube, 2–4 paragraphs + sources list) and `chapters`. Caption for shorts as usual.
