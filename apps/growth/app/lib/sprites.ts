// A hand-pixelled character used by the app's avatar.
/**
 * Hand-pixelled sprites. Each frame is a list of rows; each character maps to
 * a palette entry ("." is transparent). The character has curly
 * black hair with a fade, clear frames, beard + goatee, off-white tee.
 */

export type Palette = Record<string, string>;
export type Frame = string[];

export const BASE: Palette = {
  k: "#1a1c2c", // outline / soles
  h: "#1f1717", // hair
  H: "#3b2c2a", // hair highlight
  s: "#b97a56", // skin
  S: "#93593b", // skin shade
  g: "#e6e1d8", // clear frames
  e: "#1a1c2c", // eyes
  b: "#2a1e1c", // beard
  m: "#7a3b33", // mouth
  w: "#efe9df", // tee
  W: "#cdc4b5", // tee shade
  p: "#2f3550", // trousers
  P: "#232842", // trousers shade
  f: "#f1efe9", // shoes
  // accessories
  L: "#c9ced6", // laptop shell
  l: "#8fd0ff", // laptop screen
  r: "#8a5a3b", // backpack
  R: "#6b4430", // backpack shade
  o: "#5c4ade", // overalls (Voltage Violet)
  O: "#4636b8", // overalls shade
  c: "#fb4903", // cap (Ember)
  C: "#c93a02", // cap shade
  t: "#9aa3ad", // wrench
  y: "#ffd731", // spark / cube
};

/* 24 × 28 canvas; the body sits at x 4..19 */
const HEAD: Frame = [
  "..........hhhhhh........",
  "........hhhHhhHhhh......",
  ".......hhHhhhhhhHhh.....",
  ".......hhhhhhHhhhhh.....",
  ".......hhssssssssHh.....",
  ".......hgggsssgggsh.....",
  ".......sgegsssgegss.....",
  ".......sgggsSsgggss.....",
  ".......ssssssSsssss.....",
  ".......bsssbbbbsssb.....",
  ".......bbbbbmmbbbbb.....",
  "........bbbbbbbbbb......",
  ".........bbbbbbbb.......",
  "..........SssssS........",
];

const TORSO: Frame = [
  "........wwwwwwwwww......",
  ".......wwwwwwwwwwww.....",
  ".......swwwwwwwwwws.....",
  ".......swwwwwwwwwws.....",
  ".......sWwwwwwwwwWs.....",
  "........WWWWWWWWWW......",
  "........pppppppppp......",
];

const LEGS_STAND: Frame = [
  "........pppp..pppp......",
  "........pppp..pppp......",
  "........PPPP..PPPP......",
  ".......ffff....ffff.....",
  ".......kkkk....kkkk.....",
];

const LEGS_STEP_A: Frame = [
  "........pppp...ppp......",
  ".......pppp.....ppp.....",
  ".......PPPP.....PPP.....",
  "......ffff......fff.....",
  "......kkkk......kkk.....",
];

const LEGS_STEP_B: Frame = [
  "........ppp...pppp......",
  ".......ppp.....pppp.....",
  ".......PPP.....PPPP.....",
  "......fff......ffff.....",
  "......kkk......kkkk.....",
];

function compose(head: Frame, torso: Frame, legs: Frame, bob = 0): Frame {
  const rows = [...head, ...torso, ...legs];
  const blank = ".".repeat(24);
  return bob ? [blank, ...rows].slice(0, 28) : [...rows, blank].slice(0, 28);
}

const TALK_HEAD = HEAD.map((r, i) => (i === 10 ? ".......bbbbbmkkbbbb....." : r));
const BLINK_HEAD = HEAD.map((r, i) => (i === 6 ? ".......sgggsssgggss....." : r));

/* right arm out toward the machine */
const POINT_TORSO: Frame = [
  "........wwwwwwwwww......",
  ".......wwwwwwwwwwwwwwss.",
  ".......swwwwwwwwwww.....",
  ".......swwwwwwwwwww.....",
  ".......sWwwwwwwwwwW.....",
  "........WWWWWWWWWW......",
  "........pppppppppp......",
];

export const FIGURE = {
  point: compose(HEAD, POINT_TORSO, LEGS_STAND),
  idle: compose(HEAD, TORSO, LEGS_STAND),
  blink: compose(BLINK_HEAD, TORSO, LEGS_STAND),
  talk: compose(TALK_HEAD, TORSO, LEGS_STAND),
  walk: [
    compose(HEAD, TORSO, LEGS_STEP_A, 1),
    compose(HEAD, TORSO, LEGS_STAND),
    compose(HEAD, TORSO, LEGS_STEP_B, 1),
    compose(HEAD, TORSO, LEGS_STAND),
  ],
};

/* Accessories are overlays on the same 24 × 28 grid. */
export type Outfit = "work" | "journey" | "make";

const LAPTOP: Frame = [
  ...Array(15).fill(".".repeat(24)),
  ".LLLLLLL................",
  ".LllllLL................",
  ".LllllLL................",
  ".LLLLLLL................",
  "LLLLLLLLL...............",
];

const BACKPACK: Frame = [
  ...Array(14).fill(".".repeat(24)),
  ".....rr.r........r......",
  ".....rRrr.........r.....",
  ".....rRr..........r.....",
  ".....rRr..........r.....",
  ".....rRr................",
  ".....rrr................",
];

const OVERALLS: Frame = [
  ...Array(14).fill(".".repeat(24)),
  ".........o......o.......",
  ".........o......o.......",
  "........oooooooooo......",
  "........oOooooooOo......",
  "........oooooooooo......",
  "........OOOOOOOOOO......",
  "........oooooooooo......",
  "........oooo..oooo......",
  "........oooo..oooo......",
  "........OOOO..OOOO......",
];

const CAP: Frame = [
  "........cccccc..........",
  ".......cccCcccc.........",
  "......ccccccccccC.......",
  ".......CCCCCCCCCCCCcc...",
];

const WRENCH: Frame = [
  ...Array(12).fill(".".repeat(24)),
  "....................t.t.",
  "....................ttt.",
  ".....................t..",
  ".....................t..",
  ".....................t..",
  ".....................t..",
  "....................ts..",
];

export const OUTFITS: Record<Outfit, Frame[]> = {
  work: [LAPTOP],
  journey: [BACKPACK],
  make: [OVERALLS, CAP, WRENCH],
};
