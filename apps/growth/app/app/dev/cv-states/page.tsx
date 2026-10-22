import { notFound } from "next/navigation";
import { Fixtures } from "./Fixtures";

/** Dev only: Your CV and Your case studies in every state, from made-up fixture data. Nothing here reads or writes the real data. */
export default async function Page({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  return <Fixtures only={(await searchParams).s} />;
}
