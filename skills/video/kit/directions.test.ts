import { expect, test } from "bun:test";
import { KINDS, pickDirection } from "./directions";

test("each kind picks from its own lists and avoids recent picks", () => {
  for (const kind of KINDS) {
    const first = pickDirection(1, [], kind);
    expect(first.kind).toBe(kind);
    const next = pickDirection(1, [first], kind);
    expect(next.structure).not.toBe(first.structure);
    expect(next.hook).not.toBe(first.hook);
    expect(next.motion).not.toBe(first.motion);
  }
});
