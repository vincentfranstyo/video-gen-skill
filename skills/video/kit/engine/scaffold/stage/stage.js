import { createStage, setBpm } from "/engine/stage-core.js";

setBpm(120);

createStage({
  totalBeats: 16,
  scenes: [
    { id: "s-hook", from: 0, to: 8 },
    { id: "s-cta", from: 8, to: 16, exit: false },
  ],
  fonts: ['700 40px "Inter"', '400 40px "Inter"'],
});
