import { notFound } from "next/navigation";
import { Fixtures } from "./Fixtures";
import { STATES } from "./states";

export const dynamic = "force-dynamic";

/** Dev only: the Commands page in four states (questions waiting, reply came back, nothing waiting, not connected). Pick with ?s=. "Not connected" shows the connect hero only on a device not yet marked as connected. */
export default async function Page({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { s } = await searchParams;
  const state = STATES.find((x) => x.key === s)?.key ?? "questions";
  return <Fixtures state={state} />;
}
