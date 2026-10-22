import { notFound } from "next/navigation";
import fs from "node:fs";
import path from "node:path";
import { Fixtures } from "./Fixtures";
import type { GrowthState } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Dev only: the six pages on the blank state an onboarding reset leaves. Pick with ?p=today|commands|hiring|you|journal|library (reach and skill still work).
 * The state is app/dev/skeleton/skeleton-state.json, made by scripts/make-skeleton-fixture.mjs from a temp copy. Nothing here can write.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const file = path.join(process.cwd(), "app", "dev", "skeleton", "skeleton-state.json");
  if (!fs.existsSync(file)) return <p style={{ padding: 24 }}>Run node scripts/make-skeleton-fixture.mjs first.</p>;
  const s = JSON.parse(fs.readFileSync(file, "utf8")) as GrowthState;
  return <Fixtures initial={s} q={(await searchParams).p} />;
}
