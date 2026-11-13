"use client";

import { useEffect, useState } from "react";
import type { FormFacts } from "@/lib/match";
import { variationCss, type DialState, type Family, type FamilyId } from "@/lib/clay";
import { ffs, formsForLetter, loadRep, repFamily, sourceOf, type FormDef } from "@/lib/forms-ui";

type Props = {
  fam: Family;
  st: DialState;
  ch: string;
  forms: FormFacts;
  /** value null means Either: no preference, so nothing is passed to the matcher */
  onPick: (def: FormDef, value: string | null) => void;
};

/** One row of small pictures per form the open letter has: the letter drawn in each real alternate. Either is first and the default. */
export function Forms({ fam, st, ch, forms, onPick }: Props) {
  const defs = formsForLetter(ch);
  const [ready, setReady] = useState(0);
  const famId = fam.id as FamilyId;

  // the real fonts behind the pictures the tile cannot draw, fetched only for the letter that is open
  useEffect(() => {
    let alive = true;
    const ids = new Set<string>();
    for (const d of defs) for (const v of d.values) {
      const s = sourceOf(famId, d.key, v);
      if (s.kind === "lib") ids.add(s.id);
    }
    Promise.all([...ids].map(loadRep)).then(() => alive && setReady((n) => n + 1));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ch, famId]);

  if (!defs.length) return null;
  const tileVs = variationCss(fam, { thick: st.thick, wide: st.wide });
  return (
    <div className="zforms" role="group" aria-label={`Forms of the letter ${ch}`} data-ready={ready}>
      <p className="zforms-note">
        Pick a picture to search for that {ch}. Either leaves it open.
      </p>
      <div className="zforms-rows">
        {defs.map((d) => {
          const chosen = (forms as Record<string, string | undefined>)[d.key];
          const words = d.words as Record<string, string>;
          return (
            <div key={d.key} className="fgroup" role="group" aria-label={d.values.map((v) => words[v]).join(" or ")}>
              <button className={`fchip either ${!chosen ? "on" : ""}`} aria-pressed={!chosen} aria-label={`Either: ${d.values.map((v) => words[v]).join(" or ")}`} onClick={() => onPick(d, null)}>
                <span className="fpic" aria-hidden style={{ fontFamily: `"${fam.css}"`, fontVariationSettings: tileVs, fontFeatureSettings: "normal" }}>
                  {ch}
                </span>
                <span className="fcap" aria-hidden>either</span>
              </button>
              {d.values.map((v) => {
                const src = sourceOf(famId, d.key, v);
                const on = chosen === v;
                return (
                  <button key={v} className={`fchip ${on ? "on" : ""} ${src.kind === "lib" ? "lib" : ""}`} aria-pressed={on} aria-label={words[v]} title={words[v]} onClick={() => onPick(d, v)}>
                    <span
                      className="fpic"
                      aria-hidden
                      style={
                        src.kind === "tile"
                          ? { fontFamily: `"${fam.css}"`, fontVariationSettings: tileVs, fontFeatureSettings: ffs(src.feat ? [src.feat] : []) }
                          : { fontFamily: `"${repFamily(src.id)}", "${fam.css}"`, fontVariationSettings: "normal", fontFeatureSettings: "normal" }
                      }
                    >
                      {d.letter}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
