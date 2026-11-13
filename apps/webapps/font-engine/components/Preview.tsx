"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { TEMPLATES, type PreviewApi, type RoleFont, type Slot, type TplId } from "./usePreview";
import { Template, SIZES, type Ctx } from "./PreviewTemplates";
import { WEIGHT_NAMES } from "@/lib/preview/fonts";
import "./Preview.css";

const REVEALS: Record<TplId, string> = {
  dashboard: "Tests numerals at 36, 14 and 13 px · 13 px labels · weight range · button text",
  phone: "Tests 10 and 13 px labels · bold at 32 px · wrapping at 17 px",
  document: "Tests 12 px body texture · 10 to 28 px ladder · phone numbers and email",
  slide: "Tests headline rhythm at 64 px · numerals at 72 px · 18 px notes at distance",
  poster: "Tests display size · tracked caps · heaviest and lightest · numerals",
  social: "Tests a handle in lower case · 9 px legal line · the post at 120 px",
  brand: "Tests the wordmark at 18 px · 8 px ingredients · phone number · second weight",
};

/** Two short lines of a family name, cut at a word, never in one. The full name stays in the title. */
function shortName(n: string): string {
  const words = n.split(/s+/);
  const lines: string[] = [""];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (!cur) lines[lines.length - 1] = w;
    else if ((cur + " " + w).length <= 10) lines[lines.length - 1] = cur + " " + w;
    else if (lines.length < 2) lines.push(w);
    else break;
  }
  return lines.join(" ");
}

type Cut = { x: number; y: number; w: number; h: number };
type CutInfo = { cuts: Cut[]; wide: { n: number; min: number; max: number }; tall: { n: number; min: number; max: number } };
const NOCUT: CutInfo = { cuts: [], wide: { n: 0, min: 0, max: 0 }, tall: { n: 0, min: 0, max: 0 } };

/** Every text box whose letters run past the box. Single lines are measured on the text itself, because the box clips with a margin. */
function findCuts(comp: HTMLElement, W: number): CutInfo {
  const cr = comp.getBoundingClientRect();
  const k = cr.width / W || 1;
  const out: CutInfo = { cuts: [], wide: { n: 0, min: 999, max: 0 }, tall: { n: 0, min: 999, max: 0 } };
  const one = (b: { n: number; min: number; max: number }, px: number) => {
    b.n++;
    b.min = Math.min(b.min, px);
    b.max = Math.max(b.max, px);
  };
  comp.querySelectorAll<HTMLElement>(".tx").forEach((el) => {
    if (el.closest(".pv-dep") || !el.textContent?.trim()) return;
    const cs = getComputedStyle(el);
    const px = Math.round(parseFloat(cs.fontSize));
    const r = el.getBoundingClientRect();
    if (el.classList.contains("tx-multi")) {
      if (el.scrollHeight > el.clientHeight + 1) {
        one(out.tall, px);
        out.cuts.push({ x: r.left - cr.left, y: r.bottom - cr.top, w: r.width, h: 0 });
      }
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(el);
    const t = range.getBoundingClientRect();
    const m = parseFloat(cs.fontSize) * 0.22 * k;
    if (t.right > r.right + m + 0.5) {
      one(out.wide, px);
      out.cuts.push({ x: r.right - cr.left, y: r.top - cr.top, w: 0, h: r.height });
    } else if (t.left < r.left - m - 0.5) {
      one(out.wide, px);
      out.cuts.push({ x: r.left - cr.left, y: r.top - cr.top, w: 0, h: r.height });
    }
  });
  return out;
}

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ------------------------------------------------------------------ the right column's controls */
export function PreviewLead({ pv, word }: { pv: PreviewApi; word: string }) {
  const list = TEMPLATES.filter((t) => t.side === pv.side);
  const slots: Slot[] = [0, 1, 2, 3];
  const roleWord = (s: Slot) => {
    if (pv.mode !== "pair") return "";
    const r = [pv.roleSlots.h === s && "Headings", pv.roleSlots.b === s && "Body", pv.roleSlots.a === s && "Accent"].filter(Boolean);
    return r[0] ? (r[0] as string) : "";
  };
  return (
    <div className="pv-lead">
      <div className="pv-sticky">
        <div className="pv-seg" role="group" aria-label="Kind of piece">
          {(["ui", "graphics"] as const).map((s) => (
            <button key={s} className={pv.side === s ? "on" : ""} aria-pressed={pv.side === s} onClick={() => pv.setSide(s)}>
              {s === "ui" ? "UI" : "Graphics"}
              <span className="sr">{s === "ui" ? " (U)" : " (G)"}</span>
            </button>
          ))}
        </div>
        <div className="pv-tray-head">
          <h3>Tray</h3>
          <span className="mono">0 · 1 · 2 · 3</span>
        </div>
        <div className="pv-tray" role="toolbar" aria-label="Fonts to preview">
          {slots.map((s) => {
            const k = s ? pv.tray[s - 1] : null;
            if (s && !k) {
              return (
                <div key={s} className="pv-slot is-empty" aria-label={`Slot ${s}, empty`}>
                  <span className="pv-slot-key mono">{s}</span>
                  Keep one
                </div>
              );
            }
            const rec = pv.recOf(s);
            const isPref = pv.pref === s;
            const on = pv.sel === s;
            const fam = s === 0 ? `"${rec.css}"` : `"${rec.css}", "r-${k!.font.id}"`;
            return (
              <div key={s} className={`pv-slot ${on ? "on" : ""} ${pv.pulse === s ? "pulse" : ""} ${rec.state === "failed" ? "is-failed" : ""}`}>
                <button
                  className="pv-slot-sel"
                  onClick={() => (rec.state === "failed" ? pv.retry(s) : pv.select(s))}
                  aria-pressed={on}
                  aria-label={`${s === 0 ? "Yours" : rec.name}, key ${s}${isPref ? ", preferred" : ""}${rec.state === "loading" ? ", loading" : ""}`}
                >
                  <span className="pv-slot-key mono">{s}</span>
                  <b style={{ fontFamily: fam, fontVariationSettings: rec.vs ?? "normal", fontWeight: s === 0 ? 400 : k!.font.weight, fontSynthesis: "none" as CSSProperties["fontSynthesis"] }}>{word}</b>
                  <span className="pv-slot-name" title={s === 0 ? undefined : rec.name}>{rec.state === "failed" ? "Did not load · Try again" : s === 0 ? "Yours" : shortName(rec.name)}</span>
                  {roleWord(s) && <span className="pv-slot-role">{roleWord(s)}</span>}
                  {rec.state === "loading" && <i className="pv-bar" />}
                </button>
                <button className={`pv-pref ${isPref ? "on" : ""}`} role="radio" aria-checked={isPref} onClick={() => pv.prefer(s)} title={isPref ? "Preferred" : "Prefer"}>
                  <i />
                  <span className="sr">{isPref ? "Preferred" : "Prefer this font"}</span>
                </button>
                {s !== 0 && (
                  <button className="pv-rm" onClick={() => pv.unkeep(k!.font.id)}>
                    Remove<span className="sr"> {rec.name}</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {pv.notice && (
          <p className="pv-notice" role="status">
            {pv.notice.text}{" "}
            <button className="textbtn" onClick={pv.notice.undo}>
              Undo
            </button>
          </p>
        )}
        <div className="pv-ctl">
          <button className={pv.mode === "compare" ? "on" : ""} aria-pressed={pv.mode === "compare"} onClick={() => pv.mode === "pair" && pv.togglePair()}>
            Compare
          </button>
          <button className={pv.mode === "pair" ? "on" : ""} aria-pressed={pv.mode === "pair"} disabled={pv.mode !== "pair" && !pv.pairReady} onClick={() => pv.mode !== "pair" && pv.togglePair()}>
            Pair
          </button>
          <button disabled={pv.mode !== "pair"} onClick={pv.swap}>
            Swap
          </button>
        </div>
        {pv.mode !== "pair" && pv.pairWhy && <p className="pv-why">{pv.pairWhy}</p>}
      </div>

      <section className="pv-toc-wrap">
        <h3>
          Contents <span className="mono">{list.length} pieces</span>
        </h3>
        <ol className="pv-toc">
          {list.map((t) => (
            <li key={t.id} className={pv.tpl === t.id ? "cur" : ""}>
              <button onClick={() => pv.setTpl(t.id)} aria-current={pv.tpl === t.id ? "page" : undefined}>
                <span className="n mono">{t.n}</span>
                {t.name}
                <span className="d">{t.dims}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section className="pv-extra">
        <div className="pv-paper-row">
          <span>Paper</span>
          <div className="pv-mini" role="group" aria-label="Paper">
            {(["white", "ink"] as const).map((p) => (
              <button key={p} className={pv.paper === p ? "on" : ""} aria-pressed={pv.paper === p} onClick={() => pv.setPaper(p)}>
                {p === "white" ? "White" : "Ink"}
              </button>
            ))}
          </div>
        </div>
        <label className="pv-paste">
          <span>Your own paragraph</span>
          <textarea value={pv.paste} onChange={(e) => pv.setPaste(e.target.value.slice(0, 900))} rows={3} placeholder="Paste text to set in the press release, the post and the slide" spellCheck={false} />
        </label>
        <p className="pv-tip">Press 1, 2, 3 to swap fonts. P pairs them. Hold Space to flick back to your preferred one. Hold L for a loupe.</p>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ the stage */
function vars(f: RoleFont, p: "h" | "b" | "a"): CSSProperties {
  const r = f.roles;
  return {
    [`--${p}-fam`]: `"${f.rec.css}"`,
    [`--${p}-vs`]: f.rec.vs ?? "normal",
    [`--${p}-reg`]: r.reg,
    [`--${p}-med`]: r.med,
    [`--${p}-semi`]: r.semi,
    [`--${p}-bold`]: r.bold,
    [`--${p}-light`]: r.light,
    [`--${p}-ital`]: f.rec.italic ? "italic" : "normal",
  } as CSSProperties;
}

function wname(w: number) {
  return WEIGHT_NAMES[w] ?? String(w);
}

export function PreviewStage({ pv, word }: { pv: PreviewApi; word: string }) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const compRef = useRef<HTMLDivElement>(null);
  const [fs, setFs] = useState({ w: 0, h: 0 });
  const [leaving, setLeaving] = useState<TplId | null>(null);
  const prev = useRef<TplId>(pv.tpl);
  const mouse = useRef({ x: -1, y: -1 });
  const [cutInfo, setCutInfo] = useState<CutInfo>(NOCUT);

  useLayoutEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFs({ w: el.clientWidth - 64, h: el.clientHeight - 8 }));
    ro.observe(el);
    setFs({ w: el.clientWidth - 64, h: el.clientHeight - 8 });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (prev.current === pv.tpl) return;
    const old = prev.current;
    prev.current = pv.tpl;
    if (reduced()) return;
    setLeaving(old);
    const t = setTimeout(() => setLeaving(null), 170);
    return () => clearTimeout(t);
  }, [pv.tpl]);

  useEffect(() => {
    const m = (e: PointerEvent) => (mouse.current = { x: e.clientX, y: e.clientY });
    window.addEventListener("pointermove", m);
    return () => window.removeEventListener("pointermove", m);
  }, []);

  const t = TEMPLATES.find((x) => x.id === pv.tpl)!;
  const { h, b, a } = pv.fonts;
  const pasteKey = pv.paste;
  const sigKey = [h, b, a].map((f) => `${f.slot}${f.rec.css}${f.rec.state}${f.roles.reg}${f.roles.bold}${f.roles.light}`).join("|");
  // After the fonts are in, find every box where the letters run past the edge.
  useEffect(() => {
    if (!pv.ready || leaving || fs.w <= 0) {
      setCutInfo(NOCUT);
      return;
    }
    let alive = true;
    const run = () => {
      const c = compRef.current;
      if (!alive || !c) return;
      const next = findCuts(c, SIZES[pv.tpl][0]);
      setCutInfo((o) => (JSON.stringify(o) === JSON.stringify(next) ? o : next));
    };
    document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(run)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pv.ready, pv.tpl, sigKey, pasteKey, pv.paper, fs.w, fs.h, leaving, word]);

  const brand = word.trim().split(/\s+/)[0] || "Hamburg";
  const slug = brand.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "") || "studio";
  const sig = [h, b, a].map((f) => `${f.slot}${f.rec.css}${f.rec.state}${f.roles.reg}${f.roles.bold}${f.roles.light}`).join("|") + (pv.ready ? "!" : "?");
  const ctx: Ctx = { brand, slug, word: word.trim(), sentence: /\s/.test(word.trim()), paste: pv.paste, sig, lightOk: h.roles.lightOk, italic: h.rec.italic, xh: h.rec.xh };

  const scaleFor = (id: TplId) => {
    const [W, H] = SIZES[id];
    return fs.w > 0 && fs.h > 0 ? Math.min(1, fs.w / W, fs.h / H) : 1;
  };
  const s = scaleFor(pv.tpl);

  // what the caption reports, per font in use
  const inUse = Array.from(new Map([h, b, a].map((f) => [f.slot, f])).values());
  const wlist = (f: RoleFont) => {
    if (f.rec.vs !== undefined) return "as shaped";
    const r = f.roles;
    return Array.from(new Set([r.lightOk ? r.light : null, r.reg, r.semi, r.bold].filter((x): x is number => x !== null)))
      .sort((x, y) => x - y)
      .map(wname)
      .join(", ");
  };
  const fontLine = inUse.map((f) => `${f.slot === 0 ? "Yours" : f.rec.name} ${wlist(f)}`).join(" / ");
  const errata: string[] = [];
  const add = (x: string) => errata.includes(x) || errata.push(x);
  for (const f of inUse) {
    if (f.rec.state === "failed") add("Did not load");
    if (f.rec.state !== "ready") continue;
    if (f.rec.weights.length <= 1) add(pv.tpl === "poster" ? "One weight · light line dropped" : "One weight · bold set as regular");
    if (!f.rec.italic) add(pv.tpl === "document" ? "No italic · quote set regular" : "No italic");
    if (f.rec.tabular === false) add("No tabular figures · numbers set proportional");
  }
  const span = (b: { min: number; max: number }) => (b.min === b.max ? `${b.min} px` : `${b.min} to ${b.max} px`);
  if (cutInfo.wide.n) add(`Too wide · ${cutInfo.wide.n} ${cutInfo.wide.n === 1 ? "label" : "labels"} cut at ${span(cutInfo.wide)}`);
  if (cutInfo.tall.n) add(`Too long · ${cutInfo.tall.n} ${cutInfo.tall.n === 1 ? "paragraph" : "paragraphs"} cut at ${span(cutInfo.tall)}`);
  const tab = inUse.every((f) => f.rec.tabular !== false);
  const announce = pv.mode === "pair" ? `Preview, ${t.name}, ${h.rec.name} headings, ${b.rec.name} body` : `Preview, ${t.name}, in ${h.rec.name}`;
  const rootVars: CSSProperties = { ...vars(h, "h"), ...vars(b, "b"), ...vars(a, "a") };
  const layer = (id: TplId, cls: string) => {
    const [W, H] = SIZES[id];
    const k = scaleFor(id);
    return (
      <div key={id + cls} className={`pv-layer ${cls}`} aria-hidden={cls === "out"} style={{ width: W * k, height: H * k, left: 32 + (fs.w - W * k) / 2, top: 4 + (fs.h - H * k) / 2 }}>
        <div ref={cls === "in" ? compRef : undefined} className="pv-comp" style={{ width: W, height: H, transform: `scale(${k})` }}>
          <Template id={id} ctx={ctx} />
        </div>
        {cls === "in" && cutInfo.cuts.map((c, i) => <i key={i} className="pv-cut" aria-hidden style={{ left: c.x, top: c.y, width: c.w || 1, height: c.h || 1 }} />)}
      </div>
    );
  };

  return (
    <div className={`pv-stage paper-${pv.paper} ${pv.ready ? "" : "pv-loading"}`} data-ready={pv.ready && !leaving ? "true" : "false"} data-tpl={pv.tpl} data-shown={pv.shown} style={rootVars} role="region" aria-label="Preview">
      <p className="sr" aria-live="polite">
        {announce}
      </p>
      <div className="pv-head mono">
        <span>Applications · {t.n} {t.name}</span>
        <span>
          {TEMPLATES.filter((x) => x.side === t.side).indexOf(t) + 1} / {TEMPLATES.filter((x) => x.side === t.side).length}
        </span>
      </div>
      <div className="pv-field" ref={fieldRef}>
        {fs.w > 0 && (
          <>
            {leaving && layer(leaving, "out")}
            {layer(pv.tpl, leaving ? "in" : "in")}
          </>
        )}
        {pv.loupe && fs.w > 0 && <Loupe comp={compRef} s={s} ctx={ctx} id={pv.tpl} mouse={mouse} min={t.min} />}
      </div>
      <div className="pv-cap">
        <div>
          <p>
            Shown at {Math.round(s * 100)} %. Minimum text size {t.min} px.
          </p>
          {errata.length > 0 && <p className="pv-errata">{errata.join(" · ")}</p>}
        </div>
        {pv.tpl === "brand" && (
          <div className="pv-clear">
            <i>
              <b />
            </i>
            Clear space = x-height of the wordmark
          </div>
        )}
        <p className="pv-fonts">
          {fontLine}
          {tab ? " · tabular figures" : ""}
        </p>
      </div>
      <div className="pv-foot mono">{REVEALS[pv.tpl]}</div>
    </div>
  );
}

/** Hold L: 240 px at 2x of what is on screen, around the pointer. */
function Loupe({ comp, s, ctx, id, mouse, min }: { comp: React.RefObject<HTMLDivElement | null>; s: number; ctx: Ctx; id: TplId; mouse: React.MutableRefObject<{ x: number; y: number }>; min: number }) {
  const [p, setP] = useState(mouse.current);
  useEffect(() => {
    const m = (e: PointerEvent) => setP({ x: e.clientX, y: e.clientY });
    window.addEventListener("pointermove", m);
    return () => window.removeEventListener("pointermove", m);
  }, []);
  const r = comp.current?.getBoundingClientRect();
  if (!r || p.x < r.left || p.x > r.right || p.y < r.top || p.y > r.bottom) return null;
  const [W, H] = SIZES[id];
  const px = (p.x - r.left) / s;
  const py = (p.y - r.top) / s;
  const k = s * 2;
  return (
    <div className="pv-loupe" style={{ left: p.x - 120, top: p.y - 120 }} aria-hidden>
      <div className="pv-loupe-in" style={{ width: W, height: H, transform: `translate(${120 - px * k}px, ${120 - py * k}px) scale(${k})` }}>
        <Template id={id} ctx={ctx} />
      </div>
      <span className="mono">{min} px at 2×</span>
    </div>
  );
}
