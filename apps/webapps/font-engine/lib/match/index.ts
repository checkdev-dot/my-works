// Public surface of the matcher. Browser-safe.
export { findClosest } from './findClosest';
export { superfamilyKey, cutKey } from './superfamily';
export { loadLibrary, fetchLibrary } from './library';
export type { LibraryIndex, Library } from './library';
export { setCanvasFactory, measureGlyph } from './measure';
export type { Measures } from './measure';
export { LETTERS } from './features';
export type { Letter } from './features';
export { FORM_KEYS, FORMS_NOT_MEASURED, CLAY_FORMS, CLAY_ENDS } from './forms';
export type { FormKey, FormFacts, FormDef, FormKind } from './forms';
export type { PathCmd, QueryGlyph, FontMeta, MatchResult, FindOptions, CanvasFactory, CanvasLike, Ctx2D } from './types';
