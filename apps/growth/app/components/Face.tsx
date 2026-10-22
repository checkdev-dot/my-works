/**
 * The person's face, drawn in Notion's avatar style: black line, flat fills, a coloured ring.
 * Taken from his own pixel character: curly black hair with a fade, clear frames, beard and goatee, off-white tee.
 * The expression is the message; the ring colour follows it.
 */
export type Mood = "focused" | "proud" | "thinking" | "resting" | "curious";

const RING: Record<Mood, string> = {
  focused: "var(--face-ring-focused)",
  proud: "var(--face-ring-proud)",
  thinking: "var(--face-ring-thinking)",
  resting: "var(--face-ring-resting)",
  curious: "var(--face-ring-curious)",
};

const INK = "#191919";
const SKIN = "#c98d66";
const LINE = { stroke: INK, strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const FINE = { ...LINE, strokeWidth: 2.4, fill: "none" };
const LIGHT = { stroke: "#ffffff", strokeWidth: 2.4, strokeLinecap: "round" as const, fill: "none" };

function Brows({ mood }: { mood: Mood }) {
  const d = {
    focused: ["M45 50 L55 52.2", "M65 52.2 L75 50"],
    proud: ["M45 50 Q50 46.5 55 49", "M65 49 Q70 46.5 75 50"],
    thinking: ["M45 51 L55 51", "M65 49.5 Q70 45.5 75 48.5"],
    resting: ["M46 51.5 Q50 50.5 54 51.5", "M66 51.5 Q70 50.5 74 51.5"],
    curious: ["M45 48.5 Q50 45 55 47.5", "M65 47.5 Q70 45 75 48.5"],
  }[mood];
  return <>{d.map((p) => <path key={p} d={p} {...FINE} strokeWidth={3} />)}</>;
}

function Eyes({ mood }: { mood: Mood }) {
  if (mood === "proud") return <><path d="M46.5 61.5 Q50 57.5 53.5 61.5" {...FINE} /><path d="M66.5 61.5 Q70 57.5 73.5 61.5" {...FINE} /></>;
  if (mood === "resting") return <><path d="M46.5 60 Q50 63.5 53.5 60" {...FINE} /><path d="M66.5 60 Q70 63.5 73.5 60" {...FINE} /></>;
  if (mood === "thinking") return <><circle cx="52" cy="59" r="2.3" fill={INK} /><circle cx="72" cy="59" r="2.3" fill={INK} /></>;
  if (mood === "curious") return <><circle cx="50" cy="60.5" r="3" fill={INK} /><circle cx="70" cy="60.5" r="3" fill={INK} /><circle cx="51" cy="59.4" r="0.9" fill="#fff" /><circle cx="71" cy="59.4" r="0.9" fill="#fff" /></>;
  return <><circle cx="50" cy="60.5" r="2.3" fill={INK} /><circle cx="70" cy="60.5" r="2.3" fill={INK} /></>;
}

function Mouth({ mood }: { mood: Mood }) {
  if (mood === "proud") return <path d="M52 79 Q60 89 68 79 Z" fill="#fff" stroke="#fff" strokeWidth={1.5} strokeLinejoin="round" />;
  if (mood === "thinking") return <ellipse cx="63.5" cy="81.5" rx="2.4" ry="2" fill="#fff" />;
  if (mood === "resting") return <path d="M55 80.5 Q60 84 65 80.5" {...LIGHT} />;
  if (mood === "curious") return <ellipse cx="60" cy="82" rx="2.6" ry="3.2" fill="#fff" />;
  return <path d="M55.5 81.5 L64.5 81.5" {...LIGHT} />;
}

export function Face({ mood = "focused", size = 48, label }: { mood?: Mood; size?: number; label?: string }) {
  const id = `face-clip-${mood}-${size}`;
  return (
    <svg className={`face face-${mood}`} width={size} height={size} viewBox="0 0 120 120" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs><clipPath id={id}><circle cx="60" cy="60" r="54" /></clipPath></defs>
      <circle cx="60" cy="60" r="56.5" fill="#ffffff" stroke={RING[mood]} strokeWidth="5" />
      <g clipPath={`url(#${id})`}>
        {/* tee and neck */}
        <path d="M14 126 C16 103 35 94 60 94 C85 94 104 103 106 126 Z" fill="#f4efe6" {...LINE} />
        <path d="M51 84 L51 96 Q60 101 69 96 L69 84" fill={SKIN} {...LINE} />
        {/* ears and head */}
        <path d="M39.5 59.5 C32 57.5 31 72.5 39.5 73.5" fill={SKIN} {...LINE} />
        <path d="M80.5 59.5 C88 57.5 89 72.5 80.5 73.5" fill={SKIN} {...LINE} />
        <path d="M39 56 C39 38 48 30 60 30 C72 30 81 38 81 56 L81 66 C81 82 71 91 60 91 C49 91 39 82 39 66 Z" fill={SKIN} {...LINE} />
        {/* beard and goatee */}
        <path d="M39.5 64 C40 80 49 91.5 60 91.5 C71 91.5 80 80 80.5 64 C78 71 75 74 71 75 C67 73.5 63 74.5 60 74.5 C57 74.5 53 73.5 49 75 C45 74 42 71 39.5 64 Z" fill={INK} />
        {/* curly hair with a fade */}
        <path d="M37 58 C34 47 36 36 43 31 C43 23 51 18 57 21 C61 15 71 15 74 21 C81 20 87 27 85 35 C89 41 88 51 83 58 C82 51 79 46 74 44 C67 47 53 47 46 44 C41 46 38.5 52 37 58 Z" fill={INK} />
        {["M46 33 q3 -3 6 0", "M55 27 q3 -3 6 0", "M64 26 q3 -3 6 0", "M73 30 q3 -3 6 0", "M51 38 q3 -3 6 0", "M61 36 q3 -3 6 0", "M71 38 q3 -3 6 0"].map((d) => <path key={d} d={d} stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.85" />)}
        <path d="M38.5 56 L39 63" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
        <path d="M81.5 56 L81 63" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
        <Brows mood={mood} />
        <Eyes mood={mood} />
        {/* clear frames */}
        <rect x="43" y="55" width="14" height="11" rx="4" fill="#ffffff" fillOpacity="0.28" stroke={INK} strokeWidth="2.4" />
        <rect x="63" y="55" width="14" height="11" rx="4" fill="#ffffff" fillOpacity="0.28" stroke={INK} strokeWidth="2.4" />
        <path d="M57 59.5 Q60 57.5 63 59.5" {...FINE} />
        <path d="M43 58.5 L39.5 57.5" {...FINE} />
        <path d="M77 58.5 L80.5 57.5" {...FINE} />
        <path d="M60 63 Q58 69 59 71 Q61 72 63 70" {...FINE} strokeWidth={2.2} />
        <Mouth mood={mood} />
      </g>
    </svg>
  );
}
