import { notFound } from "next/navigation";
import { SkillScale } from "@/components/Scale";

// Development-only fixture: proves ghost needles and the low-confidence needle render. Not the person's data.
export default function ScaleFixture() {
  if (process.env.NODE_ENV === "production") notFound();
  const history = [
    { date: "2026-08-01", level: 1.5 },
    { date: "2026-09-01", level: 2 },
    { date: "2026-10-01", level: 2.5 },
  ];
  return (
    <div className="shell" style={{ paddingTop: 40, display: "grid", gap: 32, maxWidth: 640 }}>
      <p className="muted">Fixture data, not real ratings.</p>
      <div><p>Confident, history 1.5 → 2 → 2.5</p><SkillScale level={2.5} target={3} history={history} confidence={0.8} name="Fixture confident" /></div>
      <div><p>Low confidence, same history</p><SkillScale level={2.5} target={3} history={history} confidence={0.3} name="Fixture low" /></div>
    </div>
  );
}
