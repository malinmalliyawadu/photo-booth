import { describe, expect, it } from "vitest";
import {
  POSES,
  POSE_IDS,
  POSE_READING_SECONDS,
  countdownWith,
  energyLadder,
  isPoseId,
  isPosePlan,
  planPoses,
  poseById,
  poseFits,
} from "./poses";

/** A deterministic stand-in for Math.random: a fixed sequence, cycled. */
function dice(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe("the catalogue", () => {
  it("has unique ids and titles", () => {
    expect(new Set(POSE_IDS).size).toBe(POSES.length);
    expect(new Set(POSES.map((p) => p.title)).size).toBe(POSES.length);
  });

  it("keeps every title short enough to read in a second, with a hint that is a sentence", () => {
    for (const { id, title, hint } of POSES) {
      expect(title.split(" ").length, id).toBeLessThanOrEqual(4);
      expect(title.length, id).toBeLessThanOrEqual(20);
      expect(hint, id).toMatch(/[.!]$/);
    }
  });

  it("has enough for anyone on every rung, so a solo guest never runs out", () => {
    for (const energy of [1, 2, 3] as const) {
      expect(POSES.filter((p) => p.energy === energy && p.people === 1).length, `energy ${energy}`).toBeGreaterThanOrEqual(4);
    }
  });

  it("recognises its ids and nothing else", () => {
    expect(isPoseId("jump")).toBe(true);
    expect(isPoseId("handstand")).toBe(false);
    expect(isPoseId(3)).toBe(false);
    expect(poseById("backs").title).toBe("Back to back");
    expect(() => poseById("handstand" as never)).toThrow(/Unknown pose/);
  });
});

describe("countdownWith", () => {
  it("adds reading time only when there is something to read", () => {
    expect(countdownWith(5, false)).toBe(5);
    expect(countdownWith(5, true)).toBe(5 + POSE_READING_SECONDS);
  });
});

describe("energyLadder", () => {
  it("starts with a classic and ends wild, climbing evenly", () => {
    expect(energyLadder(1)).toEqual([1]);
    expect(energyLadder(2)).toEqual([1, 3]);
    expect(energyLadder(3)).toEqual([1, 2, 3]);
    expect(energyLadder(4)).toEqual([1, 2, 2, 3]);
    expect(energyLadder(6)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it("refuses a layout with no shots", () => {
    expect(() => energyLadder(0)).toThrow(/at least one shot/);
  });
});

describe("poseFits", () => {
  it("offers a group everything, a pair all but the group ideas, and anyone only what one can do", () => {
    expect(POSES.filter((p) => poseFits(p, 3))).toEqual(POSES);
    expect(POSES.filter((p) => poseFits(p, 2)).every((p) => p.people <= 2)).toBe(true);
    expect(POSES.filter((p) => poseFits(p, 2)).some((p) => p.people === 2)).toBe(true);
    expect(POSES.filter((p) => poseFits(p, 1)).every((p) => p.people === 1)).toBe(true);
    expect(POSES.filter((p) => poseFits(p, null))).toEqual(POSES.filter((p) => poseFits(p, 1)));
  });
});

describe("planPoses", () => {
  it("gives one idea per shot, no two the same, climbing the ladder", () => {
    for (const shots of [1, 2, 3, 4, 6]) {
      const plan = planPoses(shots, 3, Math.random);
      expect(plan).toHaveLength(shots);
      expect(new Set(plan).size).toBe(shots);
      expect(plan.map((id) => poseById(id).energy)).toEqual(energyLadder(shots));
    }
  });

  it("suggests nothing a solo guest cannot do, nor a pair", () => {
    for (let i = 0; i < 50; i++) {
      for (const id of planPoses(6, 1, Math.random)) expect(poseById(id).people).toBe(1);
      for (const id of planPoses(6, 2, Math.random)) expect(poseById(id).people).toBeLessThanOrEqual(2);
      for (const id of planPoses(6, null, Math.random)) expect(poseById(id).people).toBe(1);
    }
  });

  it("is the same plan for the same rolls", () => {
    expect(planPoses(4, 2, dice(0.1, 0.5, 0.9, 0.3))).toEqual(planPoses(4, 2, dice(0.1, 0.5, 0.9, 0.3)));
    expect(planPoses(4, 2, dice(0.1, 0.5, 0.9, 0.3))).not.toEqual(planPoses(4, 2, dice(0.9, 0.1, 0.3, 0.5)));
  });

  it("draws the first of a rung at 0 and the last just under 1", () => {
    const classics = POSES.filter((p) => p.energy === 1 && p.people === 1);
    expect(planPoses(1, 1, () => 0)).toEqual([classics[0]!.id]);
    expect(planPoses(1, 1, () => 0.999999)).toEqual([classics.at(-1)!.id]);
  });

  it("borrows from the rest of the catalogue when a rung runs dry, and repeats only when it all has", () => {
    const solo = POSES.filter((p) => p.people === 1);
    const whole = planPoses(solo.length, 1, Math.random);
    expect(new Set(whole).size).toBe(solo.length);
    for (const id of whole) expect(poseById(id).people).toBe(1);
    const more = planPoses(solo.length + 2, 1, Math.random);
    expect(more).toHaveLength(solo.length + 2);
    expect(new Set(more).size).toBe(solo.length);
  });
});

describe("isPosePlan", () => {
  it("takes one known idea per shot and nothing else", () => {
    expect(isPosePlan(["smile", "jump"], 2)).toBe(true);
    expect(isPosePlan(["smile", "jump"], 3)).toBe(false);
    expect(isPosePlan(["smile", "handstand"], 2)).toBe(false);
    expect(isPosePlan("smile", 1)).toBe(false);
    expect(isPosePlan(null, 1)).toBe(false);
  });
});

describe("the pictures", () => {
  it("has one for every idea, a square SVG in the subset both renderers draw", async () => {
    const { POSE_ART, poseImageUrl } = await import("./pose-art");
    for (const { id } of POSES) {
      const art = POSE_ART[id];
      expect(art.svg, id).toContain('viewBox="0 0 200 200"');
      expect(art.svg, id).not.toMatch(/<text|<filter|<image|font-family|NaN/);
      expect(poseImageUrl(id)).toMatch(/^data:image\/svg\+xml,/);
    }
    expect(new Set(POSES.map((p) => POSE_ART[p.id].svg)).size).toBe(POSES.length);
  });
});
