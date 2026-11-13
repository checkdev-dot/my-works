"use client";

// The seven pieces. Every text is an absolutely placed box with a pixel height and line height,
// so a swap of fonts changes the letters and never a box. Colour is blocks and rules beside type.
import React, { createContext, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { TplId } from "./usePreview";

export type Ctx = {
  brand: string;
  slug: string;
  word: string;
  sentence: boolean;
  paste: string;
  /** Changes whenever the fonts on the page change, so fitted text measures again before paint */
  sig: string;
  lightOk: boolean;
  italic: boolean;
  xh: number;
};
const PvCtx = createContext<Ctx>(null as unknown as Ctx);
const useCtx = () => useContext(PvCtx);

export const SIZES: Record<TplId, [number, number]> = {
  dashboard: [1280, 800],
  phone: [804, 844],
  document: [595, 842],
  slide: [960, 1104],
  poster: [560, 840],
  social: [970, 674],
  brand: [1280, 800],
};

type R = "h" | "b" | "a";
type W = "reg" | "med" | "semi" | "bold" | "light";
type TProps = {
  r?: R;
  f?: W;
  x?: number;
  y?: number;
  w: number;
  s: number;
  lh: number;
  n?: number;
  al?: "left" | "right" | "center";
  ls?: string;
  c?: "i" | "2" | "on" | "cb";
  it?: boolean;
  u?: boolean;
  style?: CSSProperties;
  children?: ReactNode;
  rel?: boolean;
};

/** One text box: fixed width, fixed height (lines x line height), clipped, never growing. */
function T({ r = "b", f = "reg", x = 0, y = 0, w, s, lh, n = 1, al, ls, c, it, u, style, children, rel }: TProps) {
  return (
    <div
      className={`tx ${n > 1 ? "tx-multi" : ""}`}
      data-r={r}
      data-w={f}
      data-i={it ? "" : undefined}
      style={{
        position: rel ? "relative" : "absolute",
        left: x,
        top: y,
        width: w,
        height: lh * n,
        fontSize: s,
        lineHeight: `${lh}px`,
        ["--lh" as string]: `${lh}px`,
        textAlign: al,
        letterSpacing: ls,
        color: c === "2" ? "var(--p-2)" : c === "on" ? "var(--p-on)" : c === "cb" ? "var(--cobalt)" : "var(--p-ink)",
        textDecoration: u ? "underline" : undefined,
        textUnderlineOffset: u ? Math.max(2, Math.round(s * 0.18)) : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** A block: fill, rule or frame. */
function B({ x, y, w, h, bg, bd, bt, bb, br, bl, dash, cls, style, children }: { x: number; y: number; w: number; h: number; bg?: string; bd?: string; bt?: string; bb?: string; br?: string; bl?: string; dash?: boolean; cls?: string; style?: CSSProperties; children?: ReactNode }) {
  const st: CSSProperties = { position: "absolute", left: x, top: y, width: w, height: h };
  const dd = dash ? "dashed" : "solid";
  if (bg) st.background = bg;
  if (bd) { st.borderWidth = 1; st.borderStyle = dd; st.borderColor = bd; }
  const side = (k: "borderTop" | "borderBottom" | "borderRight" | "borderLeft", v?: string) => {
    if (!v) return;
    const two = v.startsWith("2:");
    st[k] = `${two ? 2 : 1}px ${dd} ${v.replace("2:", "")}`;
  };
  side("borderTop", bt);
  side("borderBottom", bb);
  side("borderRight", br);
  side("borderLeft", bl);
  return (
    <div className={cls} style={{ ...st, ...style }}>
      {children}
    </div>
  );
}

const LINE = "var(--p-line)";
const INK = "var(--p-ink)";
const CB = "var(--cobalt)";

function Paper({ w, h, x = 0, y = 0, ink, children, label }: { w: number; h: number; x?: number; y?: number; ink?: boolean; children: ReactNode; label?: string }) {
  return (
    <div className={`pv-sheet ${ink ? "is-ink" : ""}`} style={{ position: "absolute", left: x, top: y, width: w, height: h }} data-piece={label}>
      {children}
    </div>
  );
}

/** A word that fits a width: the size is measured once per font, before paint. */
function Fit({ text, max, min = 20, width, r = "h", f = "bold", x = 0, y = 0, boxH, lhK = 1.1, ls, c, sig2 }: { text: string; max: number; min?: number; width: number; r?: R; f?: W; x?: number; y?: number; boxH: number; lhK?: number; ls?: string; c?: "i" | "2"; sig2?: string }) {
  const { sig } = useCtx();
  const ref = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(max);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.fontSize = `${max}px`;
    const nat = el.offsetWidth;
    if (nat <= 0) return;
    const next = Math.max(min, Math.min(max, Math.floor(((max * width) / nat) * 10) / 10));
    setSize((v) => (Math.abs(v - next) > 0.05 ? next : v));
    el.style.fontSize = "";
  }, [text, max, min, width, sig, sig2]);
  return (
    <div className="tx" data-r={r} data-w={f} style={{ position: "absolute", left: x, top: y, width, height: boxH, fontSize: size, lineHeight: `${boxH}px`, color: c === "2" ? "var(--p-2)" : INK, letterSpacing: ls }}>
      <span ref={ref} data-fit style={{ display: "inline-block", whiteSpace: "nowrap", lineHeight: 1 }}>
        {text}
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- 7.1 Dashboard */
function Dashboard() {
  const { brand } = useCtx();
  const nav = ["Overview", "Campaigns", "Press mentions", "Audience", "Reports", "Settings"];
  const kpi = [
    ["Open rate", "42.8%", "+3.4 pts vs last week"],
    ["Press mentions", "127", "+18 vs last week"],
    ["Reach", "1,284,900", "+12.4% vs last week"],
    ["Budget left", "€18,250", "of €60,000"],
  ];
  const cols = [250, 130, 130, 120, 100, 100, 166];
  const heads = ["Campaign", "Channel", "Date", "Impressions", "Open rate", "Clicks", "Status"];
  const rows: [string, string, string, string, string, string, number][] = [
    ["Spring launch", "Email", "14 Apr 2026", "812,440", "42.8%", "31,902", 0],
    ["Harbour newsletter", "Newsletter", "21 Apr 2026", "604,118", "39.1%", "22,087", 0],
    ["Elbphilharmonie partner", "Partnership", "28 Apr 2026", "377,205", "44.6%", "15,640", 1],
    ["Retargeting, DACH", "Paid social", "2 May 2026", "288,931", "28.1%", "8,114", 0],
    ["Winter sale", "Email", "12 Dec 2025", "241,770", "38.1%", "9,203", 2],
    ["Podcast sponsorship", "Audio", "9 Mar 2026", "98,442", "23.5%", "2,310", 2],
    ["Alster summer festival", "Events", "19 Jun 2026", "36,000", "0.0%", "0", 1],
    ["Referral programme", "Email", "3 Nov 2026", "22,600", "44.6%", "1,008", 0],
  ];
  const st = [
    ["Live", CB],
    ["Scheduled", "var(--p-2)"],
    ["Ended", INK],
  ];
  const X0 = 252;
  const TY = 256;
  const RH = 38;
  const xs = cols.reduce<number[]>((a, w, i) => (a.push(i ? a[i - 1] + cols[i - 1] : X0), a), []);
  return (
    <Paper w={1280} h={800} label="dashboard">
      <B x={0} y={0} w={220} h={800} bg="var(--p-fill)" br={LINE} />
      <B x={24} y={31} w={14} h={14} bg={CB} />
      <T r="h" f="semi" x={46} y={24} w={160} s={20} lh={28}>
        {brand}
      </T>
      {nav.map((n, i) => (
        <div key={n}>
          <T x={24} y={78 + i * 40} w={172} s={14} lh={20} f={i === 0 ? "semi" : "reg"} c={i === 0 ? "i" : "2"}>
            {n}
          </T>
          {i === 0 && <B x={24} y={78 + 28} w={72} h={2} bg={CB} />}
        </div>
      ))}
      <T x={24} y={744} w={172} s={13} lh={18} c="2" r="a">
        Plan: Team · 12 seats
      </T>

      <T r="h" f="semi" x={X0} y={32} w={380} s={28} lh={36}>
        Spring launch
      </T>
      <B x={776} y={32} w={240} h={36} bg="var(--p-fill)" bd={LINE} />
      <B x={776} y={32} w={76} h={36} bg="var(--p-bg)" bd={INK} />
      {["7 days", "30 days", "Quarter"].map((t, i) => (
        <T key={t} x={[776, 852, 936][i]} y={32} w={[76, 84, 80][i]} s={14} lh={36} al="center" f={i === 0 ? "semi" : "reg"} c={i === 0 ? "i" : "2"}>
          {t}
        </T>
      ))}
      <B x={1028} y={32} w={128} h={36} bg="var(--p-btn)" bd="var(--p-btn)" />
      <T r="b" f="med" x={1028} y={32} w={128} s={14} lh={36} al="center" c="on">
        Export report
      </T>
      <B x={1164} y={32} w={84} h={36} bg="var(--p-fill)" bd={LINE} />
      <T r="b" f="med" x={1164} y={32} w={84} s={14} lh={36} al="center">
        Share
      </T>

      <B x={X0} y={104} w={996} h={120} bd={LINE} />
      {kpi.map(([l, v, d], i) => (
        <div key={l}>
          {i > 0 && <B x={X0 + i * 249} y={104} w={1} h={120} bg={LINE} />}
          <T r="a" x={X0 + i * 249 + 20} y={104 + 18} w={209} s={13} lh={18} c="2">
            {l}
          </T>
          <T r="h" f="semi" x={X0 + i * 249 + 20} y={104 + 40} w={209} s={36} lh={44}>
            {v}
          </T>
          <T r="a" x={X0 + i * 249 + 20} y={104 + 92} w={209} s={13} lh={18} c="2">
            {d}
          </T>
        </div>
      ))}

      <B x={X0} y={TY} w={996} h={36} bg="var(--p-fill)" />
      {heads.map((h, i) => (
        <T key={h} r="a" f="semi" x={xs[i] + 12} y={TY} w={cols[i] - 24} s={13} lh={36} c="2" al={i >= 3 && i <= 5 ? "right" : undefined}>
          {h}
        </T>
      ))}
      {rows.map((row, ri) => {
        const y = TY + 36 + ri * RH;
        return (
          <div key={ri}>
            <B x={X0} y={y + RH - 1} w={996} h={1} bg={LINE} />
            {row.slice(0, 6).map((cell, ci) => (
              <T key={ci} x={xs[ci] + 12} y={y} w={cols[ci] - 24} s={14} lh={RH} al={ci >= 3 ? "right" : undefined} c={ci === 1 || ci === 2 ? "2" : "i"} f={ci === 0 ? "med" : "reg"}>
                {cell}
              </T>
            ))}
            <B x={xs[6] + 12} y={y + 8} w={106} h={22} bd="rgba(128,132,140,.55)">
              <i style={{ position: "absolute", left: 8, top: 6, width: 8, height: 8, background: st[row[6]][1] }} />
            </B>
            <T r="a" x={xs[6] + 12 + 22} y={y + 8} w={80} s={13} lh={22}>
              {st[row[6]][0]}
            </T>
          </div>
        );
      })}
      <T r="a" x={X0} y={TY + 36 + 8 * RH + 14} w={500} s={13} lh={18} c="2">
        Showing 1 to 8 of 24 campaigns
      </T>
      <T r="b" f="med" x={X0 + 996 - 180} y={TY + 36 + 8 * RH + 12} w={180} s={14} lh={20} al="right">
        Previous · Next
      </T>

      <B x={X0} y={720} w={304} h={44} bg="var(--p-bg)" bd={INK} />
      <T x={X0 + 16} y={720} w={200} s={14} lh={44}>
        Report sent to 4 people
      </T>
      <T f="semi" x={X0 + 232} y={720} w={56} s={14} lh={44} u>
        Undo
      </T>
    </Paper>
  );
}

/* ---------------------------------------------------------------- 7.2 Phone */
function Status() {
  return (
    <>
      <T f="semi" x={24} y={14} w={80} s={15} lh={20}>
        9:41
      </T>
      <T f="semi" x={290} y={14} w={76} s={15} lh={20} al="right">
        100 %
      </T>
    </>
  );
}
function Phone() {
  const { brand } = useCtx();
  const items = [
    ["Track coverage", "Across 40 outlets", "01"],
    ["Draft the next post", "From what worked", "02"],
    ["Share the week", "One link for the team", "03"],
  ];
  const cards = [
    ["Nordlicht Daily", `${brand} opens a second studio and names Lena Okafor head of communications`, "2 h ago · 1,204 shares"],
    ["The Harbour Review", "Why a 38 percent lift in open rates came from shorter subject lines", "5 h ago · 862 shares"],
    ["Kontor Magazin", "Five agencies on what they will not put in a press release", "Yesterday · 2,310 shares"],
    ["Elbe Radio 2", `Morning show to broadcast live from the ${brand} launch on 18 June`, "3 d ago · 640 shares"],
  ];
  const tabs = ["Home", "Mentions", "Calendar", "Reports", "Settings"];
  return (
    <>
      <Paper w={390} h={844} label="phone-a">
        <Status />
        <B x={24} y={84} w={16} h={16} bg={CB} />
        <T r="h" f="bold" x={24} y={110} w={342} s={32} lh={40}>
          {brand}
        </T>
        <T x={24} y={164} w={330} s={17} lh={25} n={3}>
          Every press mention, every post, every number, in one place.
        </T>
        <B x={24} y={266} w={342} h={1} bg={INK} />
        {items.map(([a, b, n], i) => (
          <div key={a}>
            <T f="med" x={24} y={280 + i * 72} w={260} s={15} lh={22}>
              {a}
            </T>
            <T r="a" x={24} y={280 + i * 72 + 24} w={260} s={13} lh={18} c="2">
              {b}
            </T>
            <T r="a" x={300} y={280 + i * 72 + 12} w={66} s={13} lh={20} c="2" al="right">
              {n}
            </T>
            <B x={24} y={280 + i * 72 + 56} w={342} h={1} bg={LINE} />
          </div>
        ))}
        <B x={24} y={716} w={342} h={52} bg="var(--p-btn)" />
        <T f="semi" x={24} y={716} w={342} s={17} lh={52} al="center" c="on">
          Get started
        </T>
        <T f="med" x={24} y={780} w={342} s={15} lh={24} al="center" u>
          I already have an account
        </T>
        <B x={128} y={830} w={134} h={4} bg={INK} />
      </Paper>
      <Paper w={390} h={844} x={414} label="phone-b">
        <Status />
        <T r="h" f="semi" x={24} y={60} w={240} s={22} lh={30}>
          Mentions
        </T>
        <T r="a" x={266} y={66} w={100} s={13} lh={18} c="2" al="right">
          4 new today
        </T>
        <B x={24} y={104} w={342} h={1} bg={INK} />
        {cards.map(([o, h, m], i) => {
          const y = 104 + i * 160;
          return (
            <div key={o}>
              <T r="a" f="med" x={24} y={y + 14} w={342} s={13} lh={18} c="2">
                {o}
              </T>
              <T r="h" f="semi" x={24} y={y + 38} w={342} s={16} lh={22} n={3}>
                {h}
              </T>
              <T r="a" x={24} y={y + 114} w={342} s={13} lh={18} c="2">
                {m}
              </T>
              <B x={24} y={y + 159} w={342} h={1} bg={LINE} />
            </div>
          );
        })}
        <B x={0} y={752} w={390} h={1} bg={LINE} />
        {tabs.map((t, i) => (
          <div key={t}>
            {i === 1 && <B x={i * 78 + 19} y={752} w={40} h={2} bg={CB} />}
            <T r="a" f={i === 1 ? "semi" : "reg"} x={i * 78} y={768} w={78} s={10} lh={14} al="center" c={i === 1 ? "i" : "2"}>
              {t}
            </T>
          </div>
        ))}
        <B x={128} y={830} w={134} h={4} bg={INK} />
      </Paper>
    </>
  );
}

/* ---------------------------------------------------------------- 7.3 Document */
function Document() {
  const { brand, slug, paste } = useCtx();
  const pasted = paste.trim() ? paste.trim().split(/\n+/).slice(0, 3) : null;
  const p1 = `today opened a second studio on the Elbe and appointed Lena Okafor as head of communications. Okafor joins from a regional broadcaster, where she led press and audience work for nine years. She will build a four-person team for press, partnerships and the public programme, starting with the opening season in spring. Until then the studio will run from temporary rooms in the Speicherstadt, a short walk from the harbour.`;
  const p2 = `The new studio follows a year in which open rates on the newsletter showed a 38 percent lift, helped by shorter subject lines and a weekly rhythm readers could rely on. Okafor says the aim is to keep that discipline: fewer announcements, each with something concrete to report, and responsibilities that are clear to everyone involved. A monthly briefing for editors, written in plain language, begins in January.`;
  const p3 = `Visitors can book guided tours from 18 June, when the first exhibition opens to the public at 19:00. Tickets cost €14, reduced €9, and every first Thursday of the month is free after 17:00. Journalists are invited to a preview on 17 June; accreditation closes on 10 June. Interviews with the curators can be arranged through the press office.`;
  const LH = 17.4;
  return (
    <Paper w={595} h={842} label="document">
      <T r="h" f="semi" x={56} y={46} w={260} s={28} lh={36}>
        {brand}
      </T>
      <T x={316} y={50} w={223} s={10} lh={14} n={2} al="right" c="2">
        Deichtorstrasse 2 · 20095 Hamburg · {slug}.studio
      </T>
      <B x={56} y={96} w={483} h={2} bg={CB} />
      <T r="a" f="semi" x={56} y={114} w={483} s={11} lh={16} ls="0.08em">
        FOR IMMEDIATE RELEASE
      </T>
      <T r="h" f="bold" x={56} y={138} w={483} s={24} lh={30} n={3}>
        {brand} opens a second studio and names Lena Okafor head of communications
      </T>
      {pasted ? (
        pasted.map((p, i) => (
          <T key={i} x={56} y={246 + i * 132} w={483} s={12} lh={LH} n={7} style={{ overflow: "hidden" }}>
            {i === 0 && (
              <span data-r="a" data-w="semi">
                Hamburg, 3 November 2026 —{" "}
              </span>
            )}
            {p}
          </T>
        ))
      ) : (
        <>
          <T x={56} y={246} w={483} s={12} lh={LH} n={7}>
            <span data-r="a" data-w="semi">
              Hamburg, 3 November 2026 —{" "}
            </span>
            {brand} {p1}
          </T>
          <T x={56} y={378} w={483} s={12} lh={LH} n={7}>
            {p2}
          </T>
          <T x={56} y={510} w={483} s={12} lh={LH} n={7}>
            {p3}
          </T>
        </>
      )}
      <B x={56} y={654} w={2} h={44} bg={INK} />
      <T r="h" f="reg" it x={72} y={654} w={467} s={16} lh={22} n={2}>
        We would rather say one true thing a week than ten loud ones.
      </T>
      <B x={56} y={716} w={483} h={1} bg={LINE} />
      <T f="semi" x={56} y={726} w={483} s={11} lh={15}>
        About {brand}
      </T>
      <T x={56} y={742} w={483} s={11} lh={15} n={3} c="2">
        {brand} is an independent studio for design, press and campaigns, founded in 2019. It works with museums, small publishers and public institutions across northern Germany.
      </T>
      <T x={56} y={790} w={483} s={11} lh={15}>
        Press contact: Lena Okafor · +49 40 123 456 78 · press@{slug}.studio
      </T>
    </Paper>
  );
}

/* ---------------------------------------------------------------- 7.4 Slide */
function Slide() {
  const { brand, sentence, word, paste } = useCtx();
  const cols = [
    ["127", "Press mentions", "Up from 84 in Q1, across 40 outlets."],
    ["42.8%", "Open rate", "Shorter subject lines added 3.4 points."],
    ["€18,250", "Budget left", "Enough to carry the June festival."],
  ];
  const notes = paste.trim() ? paste.trim().split(/\n+/) : null;
  return (
    <>
      <Paper w={960} h={540} label="slide-a">
        <B x={48} y={42} w={24} h={24} bg={CB} />
        <T r="h" f="semi" x={84} y={42} w={400} s={20} lh={24}>
          {brand}
        </T>
        <T r="h" f="bold" x={48} y={130} w={864} s={64} lh={68} n={2}>
          Q2 press review
        </T>
        <T x={48} y={282} w={864} s={28} lh={36} n={2}>
          {sentence ? word : "What earned coverage, what did not, what we do next"}
        </T>
        <B x={48} y={456} w={864} h={1} bg={LINE} />
        <T r="a" x={48} y={478} w={864} s={18} lh={24} c="2">
          3 November 2026 · Presented by Lena Okafor
        </T>
      </Paper>
      <Paper w={960} h={540} y={564} label="slide-b">
        <T r="h" f="bold" x={48} y={40} w={864} s={40} lh={48} n={2}>
          Three numbers that changed the plan
        </T>
        {cols.map(([n, l, t], i) => (
          <div key={n}>
            {i > 0 && <B x={48 + i * 288} y={196} w={1} h={240} bg={LINE} />}
            <T r="h" f="bold" x={48 + i * 288 + (i ? 28 : 0)} y={206} w={260} s={72} lh={80}>
              {n}
            </T>
            <T r="a" f="med" x={48 + i * 288 + (i ? 28 : 0)} y={296} w={250} s={20} lh={26} c="2">
              {l}
            </T>
            <T x={48 + i * 288 + (i ? 28 : 0)} y={332} w={246} s={18} lh={26} n={notes ? 3 : 2}>
              {notes ? notes[i] ?? "" : t}
            </T>
          </div>
        ))}
        <B x={48} y={484} w={864} h={1} bg={LINE} />
        <T r="a" x={48} y={496} w={400} s={14} lh={20} c="2">
          {brand}
        </T>
        <T r="a" x={612} y={496} w={300} s={14} lh={20} c="2" al="right">
          12 / 24
        </T>
      </Paper>
    </>
  );
}

/* ---------------------------------------------------------------- 7.5 Poster */
function Poster() {
  const { brand, sentence, word, lightOk } = useCtx();
  return (
    <Paper w={560} h={840} label="poster">
      <Fit text={brand} max={200} min={40} width={480} x={40} y={40} boxH={170} f="bold" lhK={1} ls="-0.01em" />
      {lightOk && <Fit text={sentence ? word : brand} max={sentence ? 120 : 200} min={24} width={480} x={40} y={210} boxH={170} f="light" ls="-0.01em" />}
      <T r="a" f="semi" x={40} y={500} w={480} s={20} lh={28} ls="0.12em">
        THURSDAY 18 JUNE 2026 · 19:00
      </T>
      <T r="b" x={40} y={540} w={400} s={16} lh={22} n={2}>
        Kunsthalle, Deichtorplatz 1, 20095 Hamburg
      </T>
      <T r="b" x={40} y={600} w={400} s={16} lh={22} n={2} c="2">
        Tickets €14, reduced €9. Free after 17:00 on the first Thursday of the month.
      </T>
      <B x={40} y={664} w={480} h={1} bg={LINE} />
      {[
        ["17:00", "Doors open, free entry to the hall"],
        ["19:00", "Opening talk, 45 minutes"],
        ["20:15", "Conversation with the curators"],
      ].map(([t, d], i) => (
        <React.Fragment key={t}>
          <T r="a" f="semi" x={40} y={676 + i * 26} w={64} s={14} lh={22}>
            {t}
          </T>
          <T r="b" x={112} y={676 + i * 26} w={408} s={14} lh={22}>
            {d}
          </T>
        </React.Fragment>
      ))}
      <B x={40} y={758} w={480} h={1} bg={INK} />
      <T r="a" x={40} y={770} w={400} s={14} lh={20}>
        Hall 3 · Level 2 · 14:00 to 22:00
      </T>
      <B x={480} y={760} w={40} h={40} bg={CB} />
    </Paper>
  );
}

/* ---------------------------------------------------------------- 7.6 Social */
function PostCard() {
  const { brand, slug, paste, sentence, word } = useCtx();
  const quote = paste.trim() ? paste.trim().split(/\n+/)[0].slice(0, 110) : sentence ? word : "We stopped chasing coverage and started earning it.";
  return (
    <Paper w={400} h={400} label="post">
      <B x={32} y={34} w={12} h={12} bg={CB} />
      <T r="a" f="semi" x={52} y={30} w={200} s={14} lh={20}>
        {brand}
      </T>
      <T r="h" f="bold" x={32} y={96} w={336} s={34} lh={38} n={4} ls="-0.01em">
        {quote}
      </T>
      <B x={32} y={316} w={336} h={2} bg={CB} />
      <T r="a" f="med" x={32} y={332} w={200} s={16} lh={22}>
        @{slug}
      </T>
      <T r="a" x={232} y={332} w={136} s={16} lh={22} al="right" c="2">
        12.05.2026
      </T>
    </Paper>
  );
}
function Social() {
  const { brand, slug } = useCtx();
  return (
    <>
      <PostCard />
      <Paper w={225} h={400} x={424} label="story">
        <Fit text={brand} max={72} min={26} width={185} x={20} y={40} boxH={84} f="bold" ls="-0.01em" />
        <T x={20} y={150} w={185} s={28} lh={34} n={3}>
          One link for the whole week.
        </T>
        <B x={20} y={338} w={120} h={38} bd={INK} />
        <T r="a" f="med" x={20} y={338} w={120} s={16} lh={38} al="center">
          Swipe up
        </T>
      </Paper>
      <div className="pv-thumb" style={{ position: "absolute", left: 673, top: 0, width: 120, height: 120 }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 400, height: 400, transform: "scale(0.3)", transformOrigin: "0 0" }}>
          <PostCard />
        </div>
      </div>
      <div className="pv-note" style={{ position: "absolute", left: 673, top: 132, width: 220 }}>
        The post at 120 px, as it sits in a feed
      </div>
      <Paper w={970} h={250} y={424} label="banner">
        <B x={720} y={0} w={250} h={250} bg={CB} />
        <B x={40} y={44} w={12} h={12} bg={CB} />
        <T r="h" f="semi" x={62} y={38} w={400} s={24} lh={30}>
          {brand}
        </T>
        <T x={40} y={92} w={640} s={20} lh={28} n={2}>
          Press, posts and numbers in one place
        </T>
        <B x={40} y={158} w={128} h={40} bg="var(--p-btn)" />
        <T r="b" f="semi" x={40} y={158} w={128} s={14} lh={40} al="center" c="on">
          Start free
        </T>
        <T r="a" x={40} y={214} w={400} s={9} lh={12} c="2">
          Offer ends 30.06.2026 · {slug}.studio/start
        </T>
      </Paper>
    </>
  );
}

/* ---------------------------------------------------------------- 7.7 Brand */
function Brand() {
  const { brand, slug, xh } = useCtx();
  const lab = (t: string, y: number, x = 32) => (
    <T r="a" x={x} y={y} w={400} s={11} lh={16} c="2">
      {t}
    </T>
  );
  const pad = Math.round(xh * 48);
  return (
    <Paper w={1280} h={800} label="brand">
      <B x={500} y={0} w={1} h={640} bg={LINE} />
      <B x={880} y={0} w={1} h={640} bg={LINE} />
      <B x={0} y={640} w={1280} h={1} bg={INK} />

      {lab("Wordmark · 120 px", 28)}
      <Fit text={brand} max={120} min={36} width={436} x={32} y={48} boxH={140} f="bold" ls="-0.015em" />
      {lab("48 px", 206)}
      <Fit text={brand} max={48} min={18} width={436} x={32} y={226} boxH={60} f="bold" ls="-0.01em" />
      {lab("18 px", 304)}
      <Fit text={brand} max={18} min={14} width={436} x={32} y={324} boxH={26} f="bold" />
      {lab("Clear space = x-height of the wordmark", 392)}
      <div className="pv-dep" style={{ position: "absolute", left: 32, top: 416, border: "1px dashed var(--p-2)", padding: pad, display: "inline-block" }}>
        <div data-r="h" data-w="bold" style={{ border: "1px solid var(--p-2)", fontSize: 48, lineHeight: 1.1, whiteSpace: "nowrap", color: INK, letterSpacing: "-0.01em", maxWidth: 360 - 2 * pad, overflow: "hidden" }}>
          {brand}
        </div>
      </div>
      {lab("Minimum size 18 px", 600)}

      <B x={530} y={60} w={321} h={208} bd={INK}>
        <B x={291} y={22} w={10} h={10} bg={CB} />
      </B>
      <T r="h" f="bold" x={550} y={80} w={200} s={14} lh={20}>
        {brand}
      </T>
      <T r="h" f="semi" x={550} y={192} w={270} s={14} lh={20}>
        Lena Okafor
      </T>
      <T r="b" x={550} y={212} w={270} s={11} lh={15} c="2">
        Head of Communications
      </T>
      <T r="b" x={550} y={232} w={270} s={11} lh={14}>
        +49 40 123 456 78 · lena@{slug}.studio
      </T>
      {lab("Business card · 85 × 55 mm", 284, 530)}
      <Paper w={321} h={208} x={530} y={316} ink label="card-back">
        <B x={20} y={22} w={10} h={10} bg={CB} />
        <Fit text={brand} max={34} min={14} width={281} x={20} y={90} boxH={44} f="bold" ls="-0.01em" />
      </Paper>
      {lab("Reverse · Ink", 540, 530)}

      <B x={910} y={60} w={340} h={453} bd={INK} />
      <B x={934} y={84} w={14} h={14} bg={CB} />
      <Fit text={brand} max={30} min={14} width={250} x={958} y={74} boxH={36} f="bold" ls="-0.01em" />
      <B x={934} y={126} w={292} h={1} bg={INK} />
      <T r="h" f="semi" x={934} y={148} w={292} s={22} lh={28}>
        Morning roast
      </T>
      <T r="b" x={934} y={182} w={292} s={12} lh={16}>
        250 g · Net wt 8.8 oz
      </T>
      <T r="b" x={934} y={230} w={292} s={12} lh={18} n={3} c="2">
        Whole bean, medium roast. Notes of dark chocolate, hazelnut and orange peel.
      </T>
      <T r="b" x={934} y={366} w={292} s={8} lh={11} n={4}>
        Ingredients: 100 % Arabica coffee beans. Grown at 1,200 to 1,600 m in Huila, Colombia. Roasted in small batches in Hamburg. Store in a cool, dry place and reseal after opening.
      </T>
      <B x={934} y={424} w={292} h={1} bg={LINE} />
      <T r="a" x={934} y={436} w={292} s={10} lh={14}>
        Lot 2026-11 · Best before 03.05.2027
      </T>
      {lab("Packaging label · 90 × 120 mm", 528, 910)}

      <T r="a" f="semi" x={32} y={668} w={800} s={20} lh={28}>
        Good type, quietly everywhere.
      </T>
      <T r="a" x={32} y={716} w={800} s={11} lh={16} ls="0.1em">
        BRAND · PRESS · CAMPAIGNS
      </T>
      <T r="b" x={32} y={748} w={800} s={11} lh={16} c="2">
        Regular for reading, semibold for emphasis, bold for names.
      </T>
    </Paper>
  );
}

export function Template({ id, ctx }: { id: TplId; ctx: Ctx }) {
  return (
    <PvCtx.Provider value={ctx}>
      {id === "dashboard" && <Dashboard />}
      {id === "phone" && <Phone />}
      {id === "document" && <Document />}
      {id === "slide" && <Slide />}
      {id === "poster" && <Poster />}
      {id === "social" && <Social />}
      {id === "brand" && <Brand />}
    </PvCtx.Provider>
  );
}
