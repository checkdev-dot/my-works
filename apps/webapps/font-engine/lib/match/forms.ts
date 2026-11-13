// Letter forms: structural choices a person can declare ("this a is one-storey") and that the library measures at build.
// A declared form is a fact. Hard facts gate (a family with the other known form ranks after every family that agrees); soft facts are a distance penalty.
// A form that is not declared is "either": it never gates and never penalises. Unknown on the library side is never penalised either.

export type FormKind = 'hard' | 'soft';
export type FormDef = {
  /** Key used in FindOptions.forms. */
  key: string;
  /** The letter the picture is drawn on. */
  letter: string;
  kind: FormKind;
  /** Values in code order. The first listed is not special. */
  values: readonly string[];
  /** Plain words for each value, for chips, ghost hints and reasons ("its a has two storeys"). */
  words: Readonly<Record<string, string>>;
  /** Short sentence used when the font differs: "its {a}" */
  noun: string;
};

export const FORM_KEYS = [
  { key: 'a', letter: 'a', kind: 'hard', values: ['one', 'two'], noun: 'a', words: { one: 'its a has one storey', two: 'its a has two storeys' } },
  { key: 'aTail', letter: 'a', kind: 'hard', values: ['none', 'tail'], noun: 'a', words: { none: 'its a has no tail', tail: 'its a has a tail at the foot' } },
  { key: 'g', letter: 'g', kind: 'hard', values: ['one', 'two'], noun: 'g', words: { one: 'its g has one loop', two: 'its g has two loops' } },
  { key: 'bJoin', letter: 'b', kind: 'soft', values: ['smooth', 'notch', 'high'], noun: 'b', words: { smooth: 'its b joins the stem low and smooth', notch: 'its b joins the stem with a small notch', high: 'its b joins the stem high' } },
  { key: 'tTop', letter: 't', kind: 'hard', values: ['flat', 'cut'], noun: 't', words: { flat: 'its t has a flat top', cut: 'its t has a cut or slanted top' } },
  { key: 'lTail', letter: 'l', kind: 'hard', values: ['plain', 'tail'], noun: 'l', words: { plain: 'its l is plain', tail: 'its l has a tail' } },
  { key: 'dot', letter: 'i', kind: 'soft', values: ['round', 'square'], noun: 'i dot', words: { round: 'its i has a round dot', square: 'its i has a square dot' } },
  { key: 'G', letter: 'G', kind: 'hard', values: ['plain', 'spur'], noun: 'G', words: { plain: 'its G has no spur', spur: 'its G has a spur' } },
  { key: 'R', letter: 'R', kind: 'hard', values: ['straight', 'curved'], noun: 'R', words: { straight: 'its R has a straight leg', curved: 'its R has a curved leg' } },
  { key: 'Q', letter: 'Q', kind: 'soft', values: ['down', 'swash', 'short'], noun: 'Q', words: { down: 'its Q tail runs down to the right', swash: 'its Q has a long swash tail', short: 'its Q has a short tail' } },
  { key: 'J', letter: 'J', kind: 'hard', values: ['baseline', 'below'], noun: 'J', words: { baseline: 'its J sits on the line', below: 'its J drops below the line' } },
  { key: 'one', letter: '1', kind: 'hard', values: ['plain', 'base'], noun: '1', words: { plain: 'its 1 has no base', base: 'its 1 has a base' } },
  { key: 'four', letter: '4', kind: 'hard', values: ['closed', 'open'], noun: '4', words: { closed: 'its 4 is closed at the top', open: 'its 4 is open at the top' } }
] as const satisfies readonly FormDef[];

export type FormKey = (typeof FORM_KEYS)[number]['key'];
/** Declared form facts. Any key left out is "either". */
export type FormFacts = { [K in FormKey]?: Extract<(typeof FORM_KEYS)[number], { key: K }>['values'][number] };
export const NF = FORM_KEYS.length;
export const FORM_INDEX: Record<string, number> = Object.fromEntries(FORM_KEYS.map((f, i) => [f.key, i]));
/** Forms from the survey that are not measured because the classifier is not robust (agreement across weights of one family: e bar 60%, y tail 79%). They are not accepted in FindOptions.forms. */
export const FORMS_NOT_MEASURED = ['eBar', 'yTail'] as const;
export const UNKNOWN_FORM = 255;

/** The clay tiles' own forms at home, read from the survey. Pass these as declared facts when the person has chosen the tile's form; they never gate on their own. */
export const CLAY_FORMS: Record<'plain' | 'squarish' | 'rounded' | 'feet', FormFacts> = {
  plain: { a: 'two', g: 'one' },
  squarish: { a: 'two', g: 'one' },
  rounded: { a: 'two', g: 'one' },
  feet: { a: 'two', g: 'two' }
};

/** Library family survey values -> code (index into FORM_KEYS[k].values) or UNKNOWN_FORM. Used by the index builder. */
export function codeFromSurvey(key: FormKey, v: string | undefined): number {
  const vals = (FORM_KEYS[FORM_INDEX[key]].values as readonly string[]);
  const map: Record<string, Record<string, string>> = {
    a: { single: 'one', double: 'two' }, aTail: { none: 'none', tail: 'tail' }, g: { single: 'one', double: 'two', 'double-open': 'two' },
    bJoin: { smooth: 'smooth', notch: 'notch', 'high-join': 'high' }, tTop: { flat: 'flat', slanted: 'cut' },
    lTail: { plain: 'plain', serif: 'plain', 'left-foot': 'plain', tail: 'tail' }, dot: { round: 'round', square: 'square' },
    G: { none: 'plain', spur: 'spur' }, R: { straight: 'straight', curved: 'curved' }, Q: { 'right-down': 'down', 'centre-down': 'down', swash: 'swash', inside: 'short', 'right-side': 'short' },
    J: { baseline: 'baseline', descends: 'below' }, one: { none: 'plain', base: 'base' }, four: { closed: 'closed', open: 'open' }
  };
  const s = v === undefined ? undefined : map[key]?.[v];
  const k = s === undefined ? -1 : vals.indexOf(s);
  return k < 0 ? UNKNOWN_FORM : k;
}
export const SURVEY_FIELD: Record<FormKey, string> = { a: 'a_storey', aTail: 'a_tail', g: 'g_storey', bJoin: 'b_spur', tTop: 't_top', lTail: 'l_bottom', dot: 'i_dot', G: 'G_spur', R: 'R_leg', Q: 'Q_tail', J: 'J_desc', one: 'one_base', four: 'four_top' };

/** Soft penalty (added to the distance multiplier) for a known mismatch of a soft form. Ordered forms (b join) cost by steps. */
export function softCost(key: FormKey, declared: number, font: number): number {
  if (font === UNKNOWN_FORM || declared === font) return 0;
  if (key === 'bJoin') return 0.2 * Math.abs(declared - font); // smooth, notch, high
  return 0.35;
}

/** The stroke-end shape a clay tile declares by name. Pass as FindOptions.ends; the other tiles do not declare an end shape. */
export const CLAY_ENDS: Record<'rounded', 'round'> = { rounded: 'round' };
