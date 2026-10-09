# kind: motion

Pure motion graphics: the animation is the content. Kinetic typography, logo/brand stings, data stories, abstract loops, intros/outros, animated quotes. Default format `tiktok`; stings and intros 3–10 s, pieces 15–60 s. Narration is **optional** (`checks.narration` is false): voice it only if the user wants words spoken; otherwise the text on screen is the message, so pace it for reading (≥ 0.3 s per word on screen).

- Design first: in `story.md` fix the grid, palette (3–5 colors), type scale (1 display + 1 support font), and a motion language from `direction.motion` (easing curve, overshoot amount, transition type). Reuse them in every scene — consistency is the craft.
- Build everything in HTML/CSS/SVG on the stage, driven from `t` in `draw`/`background`: SVG `stroke-dashoffset` line draws, `clip-path` wipes and masks, transforms for morphs, gradients shifting by `t`, `seeded` for pseudo-random scatters. Generated images only as textures or backdrops.
- Choreography: every scene has a lead element, secondary elements staggered 1–2 frames per item, and an exit that hands off to the next scene (match cut, zoom-through, wipe in the same direction). Nothing pops in without easing; nothing sits fully still for more than ~1 s.
- Rhythm: cuts and hits on the `direction.bpm` grid; with music, the key reveal lands on the drop.
- Data stories: numbers from the user or a cited source only; count-ups computed from `t`; label axes; source line on screen.
- Logo stings: use only a logo file the user gave (put it in `assets/`); never generate a brand's logo.
- Loops: last frame must match frame 0 — check by rendering stills at 0 and at duration − 1/30.
- Frame 0 still shows the title/hook statement (thumbnail); set `post.json` `hook` to it. For a pure sting with no words, put the brand name as the frame-0 text.
