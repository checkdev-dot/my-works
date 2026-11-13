// Turn the clay letter at its current axis settings into outlines for the matcher, using fontkit in the browser.
import type { FormFacts, PathCmd, QueryGlyph } from "@/lib/match";
import { axes, type DialState, type Family, type FamilyId } from "@/lib/clay";
import { featsFor } from "@/lib/forms-ui";

export const QUERY_LETTERS = ["a", "e", "g", "n", "o", "H", "O", "l", "p"];

type Fontkit = typeof import("fontkit");
type FKFont = import("fontkit").Font;
let fk: Promise<Fontkit> | null = null;
const buffers = new Map<string, Promise<Uint8Array>>();
const fonts = new Map<string, FKFont>();

export async function queryFor(f: Family, st: DialState, forms: FormFacts = {}): Promise<{ glyphs: QueryGlyph[]; xHeight: number }> {
  fk ??= import("fontkit");
  const mod = await fk;
  let buf = buffers.get(f.file);
  if (!buf) {
    buf = fetch(f.file).then(async (r) => {
      if (!r.ok) throw new Error("font file " + r.status);
      return new Uint8Array(await r.arrayBuffer());
    });
    buffers.set(f.file, buf);
  }
  if (!fonts.has(f.file)) fonts.set(f.file, mod.create(await buf as never) as FKFont);
  const font = fonts.get(f.file)!.getVariation(axes(f, st)) as FKFont;
  const upm = font.unitsPerEm;
  // the letters are shaped with the chosen forms on, so the matcher measures the letter that is declared
  const shape = (ch: string) => font.layout(ch, ["liga", "rvrn", "locl", ...featsFor(f.id as FamilyId, forms, ch)]).glyphs[0];
  const glyphs: QueryGlyph[] = QUERY_LETTERS.map((char) => {
    const commands: PathCmd[] = [];
    for (const c of shape(char).path.commands) {
      const a = c.args.map((n: number) => n / upm);
      if (c.command === "moveTo") commands.push({ type: "M", x: a[0], y: a[1] });
      else if (c.command === "lineTo") commands.push({ type: "L", x: a[0], y: a[1] });
      else if (c.command === "quadraticCurveTo") commands.push({ type: "Q", x1: a[0], y1: a[1], x: a[2], y: a[3] });
      else if (c.command === "bezierCurveTo") commands.push({ type: "C", x1: a[0], y1: a[1], x2: a[2], y2: a[3], x: a[4], y: a[5] });
      else if (c.command === "closePath") commands.push({ type: "Z" });
    }
    return { char, commands, advance: shape(char).advanceWidth / upm };
  });
  const xHeight = shape("x").bbox.maxY / upm;
  return { glyphs, xHeight };
}
