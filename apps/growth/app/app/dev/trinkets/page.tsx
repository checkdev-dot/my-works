"use client";

import { notFound } from "next/navigation";
import { TrinketCard, TrinketShelf } from "@/components/Trinket";
import type { GrowthState, Trinket } from "@/lib/types";

const mk = (n: number, over: Partial<Trinket> = {}): Trinket => ({
  id: `T-00${n}`, week_of: "2026-10-12", who: "Sample Designer", line: "Sample line for layout only.", quoted: true,
  source: { title: "Sample source title", url: "https://example.com", excerpt: "Sample sentence from the source page, placeholder text only.", found_at: "heading: Sample section" }, checked: "2026-10-13", status: "new", ...over,
});
const noop = async () => true;

export default function TrinketsFixture() {
  if (process.env.NODE_ENV === "production") notFound();
  const four = [mk(1), mk(2, { quoted: false, try: "Sample thing to try today." }), mk(3, { status: "saved" }), mk(4, { line: "Sample line for layout only, a little longer so the card wraps onto a second line and you can see the rhythm." })];
  return (
    <div className="shell comp" style={{ padding: "40px 16px", display: "grid", gap: 48 }}>
      <p className="muted">Placeholder content for layout only.</p>
      <section><h2>Quoted</h2><TrinketCard trinket={mk(1, { try: "Sample thing to try today." })} act={noop} busy={false} /></section>
      <section><h2>Paraphrase</h2><TrinketCard trinket={mk(2, { quoted: false })} act={noop} busy={false} /></section>
      <section><h2>Saved</h2><TrinketCard trinket={mk(3, { status: "saved" })} act={noop} busy={false} /></section>
      <TrinketShelf s={{ library: { trinkets: four }, week: { week_of: "2026-10-12" } } as unknown as GrowthState} act={noop} busy={false} />
      <section><h2>Tonight, compact</h2><TrinketCard trinket={mk(1)} act={noop} busy={false} compact /></section>
    </div>
  );
}
