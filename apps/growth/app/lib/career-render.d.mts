import type { CvVersion } from "./types";
export const CV_CSS: string;
/** A full HTML page for one CV version. opts.stamp: true/false forces the draft footer; undefined stamps when facts are still needed. */
export function renderCv(v: CvVersion, opts?: { stamp?: boolean; title?: string }): string;
/** The text a reader sees: tags, styles and the draft stamp removed. */
export function visibleText(html: string): string;
