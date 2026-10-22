import { notFound } from "next/navigation";
import { readLock, readState } from "@/lib/store";
import { Fixtures } from "./Fixtures";

export const dynamic = "force-dynamic";

/** Dev only: the A to B gap map in three states, built from a read-only copy of the real data. Nothing here can write. */
export default async function Page({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const s = { ...(await readState()), lock: await readLock() };
  return <Fixtures initial={s} only={(await searchParams).s} />;
}
