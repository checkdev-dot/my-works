// Two keys per family.
//   cutKey: families that are the same design in other cuts (SC, Display, Text, Condensed, a script's Latin set, a renamed release). Used to exclude "your own font".
//   superfamilyKey: cutKey plus derivatives (Nunito Sans under Nunito, Pretendard under Inter). Used to show one result per lineage and list the rest as "also".
// The name is read word by word: cut words, script names and numbers are dropped, the rest is the key. No first-word rule, so Source Serif and Source Sans stay apart.

const CUT_WORDS = new Set([
  'semiexpanded', 'semicondensed', 'extracondensed', 'extraexpanded', 'ultracondensed', 'sc', 'display', 'text', 'caption', 'condensed', 'extra', 'semi', 'narrow', 'expanded', 'extended', 'compressed', 'wide', 'ext', 'pro', 'std', 'variable', 'latin',
  'hebrew', 'arabic', 'thai', 'devanagari', 'bengali', 'tamil', 'telugu', 'kannada', 'malayalam', 'gujarati', 'gurmukhi', 'khmer', 'lao', 'sinhala', 'myanmar', 'georgian', 'armenian', 'ethiopic', 'tibetan', 'oriya', 'odia', 'cyrillic', 'greek', 'vietnamese',
  'jp', 'kr', 'tc', 'hk', 'looped', 'kufi', 'naskh', 'urdu', 'persian', 'math', 'symbols', 'office'
]);
const TRAILING_FILLER = new Set(['one', 'two']); // "Rubik One", "Fredoka One": the number word is a release label

/** Child cutKey -> parent cutKey: derivatives, forks and metric clones that share the Latin design. */
export const SUPERFAMILY_HAND: Record<string, string> = {
  'nunito-sans': 'nunito', 'roboto-flex': 'roboto', heebo: 'roboto', vazirmatn: 'roboto', yantramanav: 'roboto',
  'adwaita-sans': 'inter', 'inter-tight': 'inter', pretendard: 'inter', 'open-runde': 'inter', 'pretendard-gov': 'inter',
  firago: 'fira-sans', 'fira-code': 'fira-mono', 'ysabeau-office': 'ysabeau', carlito: 'lato', 'montserrat-alternates': 'montserrat', 'archivo-black': 'archivo',
  'lexend-deca': 'lexend', 'lexend-exa': 'lexend', 'lexend-giga': 'lexend', 'lexend-mega': 'lexend', 'lexend-peta': 'lexend', 'lexend-tera': 'lexend', 'lexend-zetta': 'lexend',
  'm-plus-1': 'm-plus', 'm-plus-1p': 'm-plus', 'm-plus-1-code': 'm-plus', 'm-plus-2': 'm-plus', 'm-plus-rounded-1c': 'm-plus',
  'gentium-book-basic': 'gentium', 'gentium-basic': 'gentium', 'gentium-plus': 'gentium', 'gentium-book-plus': 'gentium'
};

function words(family: string): string[] {
  return family.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}
/** Same design in other cuts or a script's Latin set. */
export function cutKey(familyId: string, family: string): string {
  let w = words(family).filter(x => !CUT_WORDS.has(x) && !/^\d+$/.test(x));
  while (w.length > 1 && TRAILING_FILLER.has(w[w.length - 1])) w = w.slice(0, -1);
  if (!w.length) return familyId;
  if (w[0] === 'playwrite') return 'playwrite';
  if (w[0] === 'edu') return 'edu';
  return w.join('-');
}
/** Lineage key: cutKey plus derivatives. */
export function superfamilyKey(familyId: string, family: string): string {
  const c = cutKey(familyId, family);
  return SUPERFAMILY_HAND[c] ?? c;
}
