/**
 * Pose ideas, for the guests who freeze when the countdown starts.
 *
 * A step before posing asks whether they want one; the guests who do
 * start the countdown with an idea per photo, shown over the viewfinder
 * while the digits run. The ideas are a choice on the session like the
 * props: planned on the kiosk, where the live preview knows how many
 * people are in the frame, stored with the session when it starts, and
 * fixed from then on, so a reload mid-count or a retake shows the same
 * ones. Nothing about them reaches the files or the print.
 *
 * A plan climbs: the first photo is a classic, the last is the wild
 * one, which is how a strip from a good booth reads. Each idea is two
 * to four words, to be read in a second from across the booth, with
 * one line under it on how to do it.
 */

export type PoseId =
  | "smile"
  | "serious"
  | "shoulder"
  | "lean"
  | "hips"
  | "cheek"
  | "thumbs"
  | "glance"
  | "point"
  | "you"
  | "peace"
  | "kiss"
  | "wink"
  | "heart"
  | "secret"
  | "backs"
  | "shh"
  | "gaze"
  | "cheers"
  | "model"
  | "shocked"
  | "laugh"
  | "jump"
  | "hands"
  | "flex"
  | "silly"
  | "dance"
  | "roar"
  | "hug"
  | "pile";

/** How many people an idea needs: 1 works for anyone, 2 for pairs and groups, 3 for groups. */
export type People = 1 | 2 | 3;

/** How much an idea asks: 1 a classic, 2 playful, 3 wild. */
export type Energy = 1 | 2 | 3;

export interface Pose {
  id: PoseId;
  /** The prompt on the screen: two to four words, twenty characters at most. */
  title: string;
  /** One line under it: how to do it. */
  hint: string;
  people: People;
  energy: Energy;
}

/** Every idea the booth knows, classics first. */
export const POSES: readonly Pose[] = [
  // Classics.
  { id: "smile", title: "Big smiles", hint: "The one for the mantelpiece.", people: 1, energy: 1 },
  { id: "serious", title: "Dead serious", hint: "Not a flicker. Think passport photo.", people: 1, energy: 1 },
  { id: "hips", title: "Hands on hips", hint: "Elbows out, like you own the place.", people: 1, energy: 1 },
  { id: "thumbs", title: "Thumbs up", hint: "Both hands, right at the camera.", people: 1, energy: 1 },
  { id: "glance", title: "Over the shoulder", hint: "Turn away, then look back at the camera.", people: 1, energy: 1 },
  { id: "shoulder", title: "Shoulder to shoulder", hint: "Line up, arms around each other.", people: 2, energy: 1 },
  { id: "lean", title: "Lean in", hint: "Heads together, fill the frame.", people: 2, energy: 1 },
  { id: "cheek", title: "Cheek to cheek", hint: "As close as you can get.", people: 2, energy: 1 },
  // Playful.
  { id: "you", title: "Point at the camera", hint: "You. Yes, you.", people: 1, energy: 2 },
  { id: "peace", title: "Peace signs", hint: "Up by your eyes, nineties style.", people: 1, energy: 2 },
  { id: "kiss", title: "Blow a kiss", hint: "Hand to lips, then out to the camera.", people: 1, energy: 2 },
  { id: "wink", title: "Wink", hint: "One eye, big grin.", people: 1, energy: 2 },
  { id: "heart", title: "Make a heart", hint: "With your hands, or with a friend's.", people: 1, energy: 2 },
  { id: "shh", title: "Shh", hint: "Finger on your lips, eyes wide.", people: 1, energy: 2 },
  { id: "cheers", title: "Cheers!", hint: "Raise whatever is in your hand.", people: 1, energy: 2 },
  { id: "model", title: "Supermodel", hint: "Pout, hand on hip, chin down.", people: 1, energy: 2 },
  { id: "point", title: "Point at each other", hint: "Blame the one who dragged you here.", people: 2, energy: 2 },
  { id: "secret", title: "Whisper a secret", hint: "Hand cupped, the other one gasps.", people: 2, energy: 2 },
  { id: "backs", title: "Back to back", hint: "Arms folded, eyes on the camera.", people: 2, energy: 2 },
  { id: "gaze", title: "Look at each other", hint: "Not at the camera. At each other.", people: 2, energy: 2 },
  // Wild.
  { id: "shocked", title: "Shocked!", hint: "Hands on cheeks, mouth wide open.", people: 1, energy: 3 },
  { id: "laugh", title: "Big laugh", hint: "Head back, laugh at the ceiling.", people: 1, energy: 3 },
  { id: "jump", title: "Jump!", hint: "On the last tick. All of you.", people: 1, energy: 3 },
  { id: "hands", title: "Hands in the air", hint: "Like the band just came back on.", people: 1, energy: 3 },
  { id: "flex", title: "Flex", hint: "Biceps out, jaw set.", people: 1, energy: 3 },
  { id: "silly", title: "Silliest face", hint: "Whatever you did when you were six.", people: 1, energy: 3 },
  { id: "dance", title: "Dance", hint: "Freeze mid-move when it flashes.", people: 1, energy: 3 },
  { id: "roar", title: "Roar", hint: "Claws out, teeth bared.", people: 1, energy: 3 },
  { id: "hug", title: "Group hug", hint: "Everyone in. Squeeze.", people: 2, energy: 3 },
  { id: "pile", title: "Pile in", hint: "Tallest at the back, everyone squeezed in.", people: 3, energy: 3 },
];

/** The ids in catalogue order, typed as a non-empty tuple for schema validators. */
export const POSE_IDS = POSES.map((p) => p.id) as [PoseId, ...PoseId[]];

/**
 * Seconds added to the countdown when an idea is on the screen: time to
 * read it and get into it before the digits run out.
 */
export const POSE_READING_SECONDS = 2;

/** The countdown a session gets: the booth's, plus time to read when it has ideas. */
export function countdownWith(seconds: number, ideas: boolean): number {
  return ideas ? seconds + POSE_READING_SECONDS : seconds;
}

export function isPoseId(value: unknown): value is PoseId {
  return typeof value === "string" && POSE_IDS.includes(value as PoseId);
}

export function poseById(id: PoseId): Pose {
  const pose = POSES.find((p) => p.id === id);
  if (!pose) throw new Error(`Unknown pose "${id}"`);
  return pose;
}

/**
 * A stored plan: one known idea per shot. Anything else (the wrong
 * number, an id the catalogue does not have, not a list) is not one.
 */
export function isPosePlan(value: unknown, shotCount: number): value is PoseId[] {
  return Array.isArray(value) && value.length === shotCount && value.every(isPoseId);
}

/**
 * Whether an idea suits this many people. `null` is "nobody looked"
 * (another camera, a detector that would not load, nobody in the frame
 * yet), when only what anyone can do is safe to suggest.
 */
export function poseFits(pose: Pose, people: number | null): boolean {
  return people === null ? pose.people === 1 : pose.people <= people;
}

/**
 * The energy each of a layout's shots asks for: the first a classic,
 * the last wild, climbing evenly between. One shot gets a classic;
 * two get a classic and a wild one.
 */
export function energyLadder(shotCount: number): Energy[] {
  if (!Number.isInteger(shotCount) || shotCount < 1) throw new Error(`A plan needs at least one shot, got ${shotCount}`);
  return Array.from({ length: shotCount }, (_, i) => (1 + Math.round((i * 2) / Math.max(shotCount - 1, 1))) as Energy);
}

/**
 * One idea per shot for `people` (see `poseFits`), climbing the ladder,
 * no two the same while the catalogue lasts. Each rung is drawn from
 * the ideas of that energy; a rung with none left borrows from the
 * rest, and a layout with more shots than ideas repeats. `random` is
 * uniform on [0, 1): `Math.random` on the kiosk, something fixed in a
 * test.
 */
export function planPoses(shotCount: number, people: number | null, random: () => number): PoseId[] {
  const suited = POSES.filter((p) => poseFits(p, people));
  const used = new Set<PoseId>();
  return energyLadder(shotCount).map((energy) => {
    const fresh = suited.filter((p) => !used.has(p.id));
    const rung = fresh.filter((p) => p.energy === energy);
    const pool = rung.length ? rung : fresh.length ? fresh : suited;
    const pick = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!;
    used.add(pick.id);
    return pick.id;
  });
}
