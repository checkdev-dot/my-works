"use client";
import { LibraryCard, LeftOutFold } from "@/components/LibraryCard";
import { BookOpen, Eye, FileText, Headphones, Play } from "@/components/icons";
import type { LeftOut, Pick, PickScore } from "@/lib/types";

// Dev fixture: proves the Library card in every state. Not the person's data. Never written anywhere.
const sc = (o: Partial<PickScore>): PickScore => ({ fit: 9, gain: 8, time: 8, substance: 9, fresh: 9, best: 8, total: 86, verdict: "read_now", why: "It shows how a real team ran the same usability test you have to run this week.", compared: ["Nielsen Norman: Usability testing 101", "Maze guide"], scored: "2026-10-12", ...o });
const base = { week_of: "2026-10-12", status: "new" as const, url: "https://example.com", checked: "2026-10-12" };
const P: Pick[] = [
  { ...base, id: "f1", kind: "video", title: "Running a five person usability test in one afternoon", by: "Figma, Config talk", minutes: 14, published: "2026-03", why: "legacy line", thumb: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", score: sc({}) },
  { ...base, id: "f2", kind: "book", title: "The Design of Everyday Things, Revised Edition", by: "Don Norman", minutes: 540, published: "2013", why: "legacy", thumb: "https://covers.openlibrary.org/b/isbn/9780465050659-M.jpg", score: sc({ total: 72, verdict: "worth_it", substance: 7, fresh: 6, best: 6, better: "A shorter piece covers the same ground this week; the book is the deeper read for later.", why: "It gives you the words for why a screen confuses people, which your case study is missing." }) },
  { ...base, id: "f3", kind: "article", title: "A long essay on the future of design systems and tokens", by: "A design blog", minutes: 25, published: "2024-06", why: "legacy", score: sc({ total: 58, verdict: "skim", fit: 6, gain: 5, time: 5, substance: 5, fresh: 6, best: 5, why: "Skim the middle section on naming; the rest is vocabulary you already have.", better: "Nothing better found." }) },
  { ...base, id: "f4", kind: "visual", title: "Onboarding flows from ten fintech apps", by: "Page Flows", minutes: 20, why: "Study how each one asks for the least on the first screen, then compare with your own." },
  { ...base, id: "f5", kind: "podcast", title: "How a staff designer reads a portfolio in ninety seconds", by: "Design Details", minutes: 70, published: "2026-09", why: "legacy", thumb: "https://example.invalid/missing.jpg", score: sc({ total: 81, verdict: "read_now", why: "It tells you what a reviewer looks at first, which is what your portfolio needs." }) },
];
const L: LeftOut[] = [
  { title: "50 UX buzzwords every designer should know", kind: "article", why_not: "Mostly vocabulary, no examples.", total: 41, checked: "2026-10-12" },
  { title: "Figma 2023 plugins roundup", kind: "video", why_not: "Out of date since the 2025 rebuild.", checked: "2026-10-12" },
];
const I = { video: Play, book: BookOpen, article: FileText, visual: Eye, podcast: Headphones, news: FileText } as const;
const V = { video: "Watch", book: "See the book", article: "Read", visual: "Look", podcast: "Listen", news: "Read" } as const;
const N = { video: "Video", book: "Book", article: "Article", visual: "Flows to study", podcast: "Podcast", news: "New in design" } as const;

export default function Page() {
  return (
    <main className="world" style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
      <h1>Library card fixture</h1>
      <p className="muted">Dev fixture only. Scored read now with a video thumbnail, worth it book with a cover, skim, not scored, a podcast with a broken picture.</p>
      <ul className="pick-list">
        {P.map((p, i) => (
          <LibraryCard key={p.id} p={p} Icon={I[p.kind]} kindLabel={N[p.kind]} tone={i === 0 ? "skill" : i === 3 ? "reach" : undefined}
            meta={[p.published ? `From ${p.published.slice(0, 4)}` : "", "Usability testing"].filter(Boolean)} closes={i < 2 ? "Run a usability test with a real person" : null} feeds={i === 0 ? "Usability test script" : null}>
            <div className="pick-actions">
              <a className="btn btn-sm" href="#">{(() => { const K = I[p.kind]; return <K aria-hidden />; })()} {V[p.kind]}</a>
              <button className="btn btn-sm btn-quiet">Finished it</button>
              <button className="btn btn-sm btn-quiet pick-skip">Skip this week</button>
            </div>
          </LibraryCard>
        ))}
      </ul>
      <LeftOutFold items={L} />
    </main>
  );
}
