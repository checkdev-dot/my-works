"use client";

import { CvPanel } from "@/components/CvPanel";
import { CaseStudies } from "@/components/CaseStudies";
import { renderCv } from "@/lib/career-render.mjs";
import { FIXTURES } from "./cv-data";

export function Fixtures({ only }: { only?: string }) {
  const list = only ? FIXTURES.filter((f) => f.id === only) : FIXTURES;
  return (
    <>
      {list.map((f) => (
        <section key={f.id} style={{ maxWidth: 880, margin: "0 auto", padding: "24px 16px" }}>
          <p style={{ font: "600 13px system-ui", opacity: 0.6 }}>Fixture: {f.label}</p>
          <div className="world att-hiring">
            <CvPanel career={f.career} srcDocFor={(v) => renderCv(v)} force />
            <CaseStudies career={f.career} force />
          </div>
        </section>
      ))}
    </>
  );
}
