"use client";

import { useRef } from "react";
import { DIALS, fromTrack, isSwitch, trackPos, type DialDef, type DialId, type DialState, type Family } from "@/lib/clay";

type Props = {
  fam: Family;
  st: DialState;
  /** Which dials to draw, in order. The caller decides what is present. */
  list: DialDef[];
  /** Called before a gesture changes anything, so Undo can group it */
  onBegin: (id: DialId, viaKey: boolean) => void;
  onSet: (id: DialId, u: number, dragging: boolean) => void;
  onEnd: () => void;
  onResetOne: (id: DialId) => void;
  /** Which dial is hovered or focused, so its definition can be shown under the rows */
  onHot?: (id: DialId | null) => void;
  /** Rows laid side by side (the zoomed bottom strip) instead of stacked */
  flow?: "row";
};

const STEP = 1 / 24;

export function Dials({ fam, st, list, onBegin, onSet, onEnd, onResetOne, onHot, flow }: Props) {
  const main = list.filter((d) => d.group === "main");
  const more = list.filter((d) => d.group === "more");
  const row = (d: DialDef) => <Row key={d.id} id={d.id} fam={fam} st={st} onBegin={onBegin} onSet={onSet} onEnd={onEnd} onResetOne={onResetOne} onHot={onHot} />;
  return (
    <div className={`dials ${flow === "row" ? "flow" : ""}`}>
      {main.map(row)}
      {more.length > 0 && main.length > 0 && <h3 className="dials-more">More</h3>}
      {more.map(row)}
    </div>
  );
}

type RowProps = Omit<Props, "list"> & { id: DialId };

function Row(props: RowProps) {
  return isSwitch(props.fam.dials[props.id]) ? <Switch {...props} /> : <Slide {...props} />;
}

/** Lean on a family that ships its italics as a second file: two tiles, no in-between. */
function Switch({ id, st, onBegin, onSet, onEnd, onResetOne, onHot }: RowProps) {
  const def = DIALS.find((d) => d.id === id)!;
  const on = (st[id] ?? 0) > 0.5 ? 1 : 0;
  const pick = (v: 0 | 1) => {
    if (v === on) return;
    onBegin(id, false);
    onSet(id, v, false);
    onEnd();
  };
  return (
    <div className="row" onMouseEnter={() => onHot?.(id)} onMouseLeave={() => onHot?.(null)} onFocus={() => onHot?.(id)} onBlur={() => onHot?.(null)}>
      <div className="row-top">
        <span className="row-label">{def.label}</span>
        {on === 1 && (
          <button className="row-reset" onClick={() => onResetOne(id)} aria-label={`Put ${def.label} back to where it started`}>
            Back
          </button>
        )}
      </div>
      <div className="two" role="group" aria-label={def.label} aria-description={`${def.definition}. This family has a separate italic file.`}>
        {([0, 1] as const).map((v) => (
          <button key={v} className={`two-tile ${on === v ? "on" : ""}`} aria-pressed={on === v} onClick={() => pick(v)}>
            {v ? def.more.replace(/^./, (c) => c.toUpperCase()) : def.less.replace(/^./, (c) => c.toUpperCase())}
          </button>
        ))}
      </div>
    </div>
  );
}

function Slide({ id, fam, st, onBegin, onSet, onEnd, onResetOne, onHot }: RowProps) {
  const def = DIALS.find((d) => d.id === id)!;
  const ax = fam.dials[id]!;
  const [lessWord, moreWord] = fam.ends?.[id] ?? [def.less, def.more];
  const u = st[id] ?? 0;
  const p = trackPos(ax, u);
  const home = trackPos(ax, 0);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x0: number; off: number; began: boolean; moved: boolean } | null>(null);
  const uNow = useRef(u);
  uNow.current = u;

  const toU = (clientX: number, off: number) => {
    const r = track.current!.getBoundingClientRect();
    return fromTrack(ax, (clientX - r.left - off) / r.width);
  };
  // A gesture only becomes an undo step once it really changes something
  const change = (d: NonNullable<typeof drag.current>, next: number, dragging: boolean) => {
    if (Math.abs(next - uNow.current) < 1e-6) return;
    if (!d.began) {
      onBegin(id, false);
      d.began = true;
    }
    onSet(id, next, dragging);
  };

  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = track.current!.getBoundingClientRect();
    const px = e.clientX - r.left;
    const onThumb = Math.abs(px - p * r.width) <= 14;
    const d = { x0: e.clientX, off: onThumb ? px - p * r.width : 0, began: false, moved: false };
    drag.current = d;
    if (!onThumb) change(d, toU(e.clientX, 0), false); // a click away from the thumb jumps there, and eases
    (e.currentTarget as HTMLElement).focus();
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) < 3) return;
    d.moved = true;
    change(d, toU(e.clientX, d.off), true);
  };
  const up = () => {
    if (!drag.current) return;
    drag.current = null;
    onEnd();
  };
  const key = (e: React.KeyboardEvent) => {
    const k = e.key;
    let delta = 0;
    if (k === "ArrowRight" || k === "ArrowUp") delta = STEP;
    else if (k === "ArrowLeft" || k === "ArrowDown") delta = -STEP;
    else if (k !== "Home" && k !== "End") return;
    e.preventDefault();
    if (e.shiftKey) delta *= 5;
    const next = fromTrack(ax, k === "Home" ? 0 : k === "End" ? 1 : p + delta);
    if (Math.abs(next - u) < 1e-6) return;
    onBegin(id, k !== "Home" && k !== "End"); // Home and End are a step of their own
    onSet(id, next, false);
  };

  const pct = Math.round(p * 100);
  const lo = Math.min(p, home), hi = Math.max(p, home);
  const atHome = u === 0;
  return (
    <div className="row" onMouseEnter={() => onHot?.(id)} onMouseLeave={() => onHot?.(null)} onFocus={() => onHot?.(id)} onBlur={() => onHot?.(null)}>
      <div className="row-top">
        <span className="row-label" onDoubleClick={() => !atHome && onResetOne(id)}>
          {def.label}
        </span>
        {!atHome && (
          <button className="row-reset" onClick={() => onResetOne(id)} aria-label={`Put ${def.label} back to where it started`}>
            Back
          </button>
        )}
      </div>
      <div
        ref={track}
        className="track"
        role="slider"
        tabIndex={0}
        aria-label={def.label}
        aria-description={`${def.definition}. ${lessWord} to ${moreWord}. Right or up is more.`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct} percent of the way from ${lessWord} to ${moreWord}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
        onBlur={onEnd}
      >
        <span className="track-line" />
        <span className="track-home" style={{ left: `${home * 100}%` }} />
        <span className="track-fill" style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} />
        <span className="track-thumb" style={{ left: `${p * 100}%` }} />
      </div>
      <div className="row-ends">
        <span>{lessWord}</span>
        <span>{moreWord}</span>
      </div>
    </div>
  );
}
