// Everything, including distances. For build/evaluation scripts only; the app imports from './index'.
export * from './index';
export { distances, rankFamilies, rankKey, measureQuery, combine, queryFacts, calibrate, matchPercent, vetoNames, bandWord, queryClasses, WEAK_BELOW } from './findClosest';
export * from './facts';
export { SUPERFAMILY_HAND } from './superfamily';
export { STRIDE, letterOffset, modelVector, modelP, MODEL_DIM } from './library';
export { rasterise, measureRaster, RENDER, xHeightRatio, bounds } from './measure';
export * from './features';
export * from './forms';
export { buildMismatch } from './findClosest';
