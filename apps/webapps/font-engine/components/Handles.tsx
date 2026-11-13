"use client";

import { useRef, useState } from "react";
import { DIALS, fromTrack, trackPos, type DialId, type DialState, type Family } from "@/lib/clay";
import { edgeAt, extent, invert, isVertical, pointerTable, sweep, type Handle as Spec } from "@/lib/handles";

type Props = {
  fam: Family;
  st: DialState;
  ch: string;
  /** Stylistic sets on for this letter, so the squares sit on the glyph that is drawn */
  feat?: string[];
  specs: Spec[];
  /** How far right the letter can reach, em, so the callouts stay put while Wide moves */
  reach: number;
  /** Pen origin and baseline of the zoomed letter, in sheet pixels, and its font size */
  ox: number;
  base: number;
  Z: number;
  /** Lowest y a callout may take */
  maxY: number;
  sheet: React.RefObject<HTMLDivElement | null>;
  onBegin: (id: DialId, viaKey: boolean) => void;
  onSet: (id: DialId, u: number, dragging: boolean) => void;
  onEnd: () => void;
};

const STEP = 1 / 24;
const LABEL_H = 26;
const labelW = (t: string) => t.length * 7.6 + 12;

type Place = { ax: number; ay: number; side: "left" | "right" | "top"; lx: number; ly: number };

/** Anchors come from the shaped outline each render; callouts are spread so none overlap and each leader runs straight to its margin. */
export function Handles(props: Props) {
  const { fam, st, ch, specs, reach, ox, base, Z, maxY, feat } = props;
  const items = specs
    .map((s) => ({ s, e: edgeAt(fam, st, ch, s.kind, feat) }))
    .filter((i): i is { s: Spec; e: NonNullable<ReturnType<typeof edgeAt>> } => !!i.e)
    .map(({ s, e }) => {
      const v = isVertical(s.kind);
      return { s, e, ax: v ? ox + e.along * Z : ox + e.c * Z, ay: v ? base - e.c * Z : base - e.along * Z };
    });
  const ex = extent(fam, st, ch, feat);
  const mid = ox + (ex ? (ex.minX + ex.maxX) / 2 : 0.3) * Z;
  const leftEnd = Math.min(ox, ox + (ex?.minX ?? 0) * Z) - 36;
  const rightStart = ox + Math.max(reach, ex?.maxX ?? 0) * Z + 44;

  const place = new Map<DialId, Place>();
  const col = (side: "left" | "right") => {
    const g = items.filter((i) => !isVertical(i.s.kind) && (i.ax < mid ? "left" : "right") === side).sort((a, b) => a.ay - b.ay);
    let prev = -Infinity;
    for (const i of g) {
      const ly = Math.max(i.ay, prev + LABEL_H + 6);
      prev = ly;
      place.set(i.s.dial, { ax: i.ax, ay: i.ay, side, lx: side === "left" ? leftEnd : rightStart, ly });
    }
    // if the stack ran past the floor, pull it back up
    let over = prev - maxY;
    for (const i of [...g].reverse()) {
      if (over <= 0) break;
      const p = place.get(i.s.dial)!;
      const lo = Math.max(i.ay - 40, 20);
      const ny = Math.max(lo, p.ly - over);
      over -= p.ly - ny;
      p.ly = ny;
    }
  };
  col("left");
  col("right");
  const tops = items.filter((i) => isVertical(i.s.kind) && i.s.kind !== "bottom").sort((a, b) => a.ax - b.ax);
  let prevR = -Infinity;
  for (const i of tops) {
    const w = labelW(i.s.verb);
    const lx = Math.max(i.ax, prevR + w / 2 + 10);
    prevR = lx + w / 2;
    place.set(i.s.dial, { ax: i.ax, ay: i.ay, side: "top", lx, ly: i.ay - 44 });
  }
  // a tail hangs down: its callout goes to the right margin, level with it
  for (const i of items.filter((x) => x.s.kind === "bottom")) {
    place.set(i.s.dial, { ax: i.ax, ay: i.ay, side: "right", lx: rightStart, ly: Math.min(i.ay + 6, maxY) });
  }

  return (
    <div className="handles">
      <svg className="h-svg" aria-hidden>
        {Array.from(place.values()).map((p, i) => {
          const tx = p.side === "left" ? p.lx + 4 : p.side === "right" ? p.lx - 4 : p.lx;
          const ty = p.side === "top" ? p.ly + LABEL_H / 2 : p.ly;
          return (
            <g key={i}>
              <line x1={p.ax} y1={p.ay} x2={tx} y2={ty} className="h-halo" />
              <line x1={p.ax} y1={p.ay} x2={tx} y2={ty} className="h-line" />
            </g>
          );
        })}
      </svg>
      {items.map(({ s, e }) => {
        const p = place.get(s.dial);
        return p ? <Handle key={s.dial} spec={s} e={e} at={p} {...props} /> : null;
      })}
    </div>
  );
}

function Handle({ spec, e, at, fam, st, ch, feat, ox, base, Z, sheet, onBegin, onSet, onEnd }: Props & { spec: Spec; e: NonNullable<ReturnType<typeof edgeAt>>; at: Place }) {
  const def = DIALS.find((d) => d.id === spec.dial)!;
  const ax = fam.dials[spec.dial]!;
  const u = st[spec.dial] ?? 0;
  const vertical = isVertical(spec.kind);
  const drag = useRef<{ T: number[]; off: number; began: boolean } | null>(null);
  const uNow = useRef(u);
  uNow.current = u;
  const [limit, setLimit] = useState(false);
  const [active, setActive] = useState(false);

  const toPx = (c: number) => (vertical ? base - c * Z : ox + c * Z);
  const pointer = (ev: React.PointerEvent) => {
    const r = sheet.current!.getBoundingClientRect();
    return vertical ? ev.clientY - r.top : ev.clientX - r.left;
  };

  const down = (ev: React.PointerEvent) => {
    if (ev.button !== 0) return;
    const table = sweep(fam, st, ch, spec.dial, spec.kind, feat);
    if (!table) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    const p0 = trackPos(ax, u);
    const T = pointerTable(spec, table, toPx, p0);
    const k = Math.min(23, Math.floor(p0 * 24));
    const E0 = T[k] + (T[k + 1] - T[k]) * (p0 * 24 - k);
    drag.current = { T, off: pointer(ev) - E0, began: false };
    setActive(true);
    (ev.currentTarget as HTMLElement).focus();
  };
  const move = (ev: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const { p, atEnd } = invert(d.T, pointer(ev) - d.off);
    setLimit(atEnd);
    const next = fromTrack(ax, p);
    if (Math.abs(next - uNow.current) < 1e-6) return;
    if (!d.began) {
      onBegin(spec.dial, false);
      d.began = true;
    }
    onSet(spec.dial, next, true);
  };
  const up = () => {
    if (!drag.current) return;
    drag.current = null;
    setActive(false);
    setLimit(false);
    onEnd();
  };
  // the arrow that points the way the square goes for more; its opposite is less. Up and Right also mean more on a rising or rightward handle.
  const more: Record<string, string[]> = { right: ["ArrowRight", "ArrowUp"], left: ["ArrowLeft", "ArrowDown"], up: ["ArrowUp", "ArrowRight"], down: ["ArrowDown", "ArrowLeft"] };
  const less: Record<string, string[]> = { right: ["ArrowLeft", "ArrowDown"], left: ["ArrowRight", "ArrowUp"], up: ["ArrowDown", "ArrowLeft"], down: ["ArrowUp", "ArrowRight"] };
  const key = (ev: React.KeyboardEvent) => {
    const k = ev.key;
    let delta = 0;
    if (more[spec.dir].includes(k)) delta = STEP;
    else if (less[spec.dir].includes(k)) delta = -STEP;
    else if (k !== "Home" && k !== "End") return;
    ev.preventDefault();
    if (ev.shiftKey) delta *= 5;
    const p0 = trackPos(ax, u);
    const next = fromTrack(ax, k === "Home" ? 0 : k === "End" ? 1 : p0 + delta);
    if (Math.abs(next - u) < 1e-6) {
      setLimit(true);
      return;
    }
    setLimit(false);
    onBegin(spec.dial, k !== "Home" && k !== "End");
    onSet(spec.dial, next, false);
  };

  const pct = Math.round(trackPos(ax, u) * 100);
  const label = limit ? "That is as far as this letter goes" : spec.verb;
  const style =
    at.side === "left"
      ? { left: at.lx, top: at.ly - LABEL_H / 2, transform: "translateX(-100%)" }
      : at.side === "right"
        ? { left: at.lx, top: at.ly - LABEL_H / 2 }
        : { left: at.lx, top: at.ly, transform: "translateX(-50%)" };
  const word = spec.dir === "down" ? "down" : spec.dir === "left" ? "left" : spec.dir === "up" ? "up" : "right";
  return (
    <>
      <span className={`h-label ${active ? "on" : ""} ${at.side}`} style={style} aria-hidden>
        {label}
      </span>
      <div
        className={`h-hit ${active ? "on" : ""}`}
        style={{ left: at.ax - 12, top: at.ay - 12 }}
        role="slider"
        tabIndex={0}
        aria-label={`${def.label}: ${spec.verb}`}
        aria-description={`${def.definition}. Drag the square ${word} for more. The ${word} arrow key also gives more.`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct} percent of the way from ${def.less} to ${def.more}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
        onBlur={up}
      >
        <i className="h-sq" />
      </div>
    </>
  );
}
