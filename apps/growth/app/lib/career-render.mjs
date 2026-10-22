// Renders one CV version to a single HTML page that looks like cv/CV.html: A4, one page aimed, ATS friendly
// (real text, standard section names, no images). Pure: no node built-ins, no clock. The same function feeds the app preview
// (app/api/cv), the print css and the PDF export, so what the person sees is what is saved.
// Placeholders [NEEDS ...] show as <span class="need">. A draft (placeholders left) carries a footer stamp "Draft: N facts still needed".
// Every text is escaped first; only then are the placeholders wrapped.

const PLACEHOLDER = /\[NEEDS(?: REAL NUMBER)?:[^\]]*\]/g;

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// On screen a placeholder shows in full; in print (and so in the PDF) it shrinks to "[NEEDS REAL NUMBER]" / "[NEEDS]" so the page stays one page.
const shortNeed = (m) => (m.startsWith("[NEEDS REAL NUMBER") ? "[NEEDS REAL NUMBER]" : "[NEEDS]");
// Only the short form is real text, so a copy or a PDF text extract never doubles it. The full note shows on screen from data-full.
const need = (s) => esc(s).replace(PLACEHOLDER, (m) => `<span class="need" data-full="${m}"><span class="n-short">${shortNeed(m)}</span></span>`);
const isGap = (s) => { PLACEHOLDER.lastIndex = 0; const r = PLACEHOLDER.test(String(s ?? "")); PLACEHOLDER.lastIndex = 0; return r; };
/** Real entries first, placeholders last. Render order only: the data keeps its own order. */
const gapsLast = (xs, text) => [...xs.filter((x) => !isGap(text(x))), ...xs.filter((x) => isGap(text(x)))];
const safeUrl = (u) => {
  const t = String(u || "").trim();
  if (/^https?:\/\//i.test(t)) return t;
  return /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(t) ? `https://${t}` : "";
};
/** Text that is itself a web address becomes a real link; anything else is plain text (placeholders still marked). */
const linked = (text) => { const u = safeUrl(text); return u ? `<a href="${esc(u)}" rel="noopener">${esc(text)}</a>` : need(text); };
const bare = (u) => String(u || "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");

export const CV_CSS = `
  @page { size: A4; margin: 12mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #1d1d1b; font-size: 10pt; line-height: 1.3; background: #fff; }
  .page { max-width: 180mm; margin: 0 auto; }
  header { display: grid; grid-template-columns: 1fr auto; align-items: end; border-bottom: 1.5px solid #1d1d1b; padding-bottom: 6px; margin-bottom: 8px; }
  h1 { font-size: 22pt; margin: 0; letter-spacing: -0.01em; font-weight: 700; }
  .role { font-size: 11pt; color: #2f6b4f; font-weight: 700; margin-top: 1px; }
  .contact { text-align: right; font-size: 9.5pt; color: #444; line-height: 1.5; }
  .contact a, .links a { color: inherit; text-decoration: underline; text-decoration-color: #b9b9b2; text-underline-offset: 2px; }
  .summary { margin: 0 0 6px; font-size: 10pt; }
  h2 { font-size: 9.5pt; text-transform: uppercase; letter-spacing: .1em; color: #2f6b4f; margin: 9px 0 4px; font-weight: 700; }
  .job { margin-bottom: 6px; break-inside: avoid; }
  .job-head { display: flex; justify-content: space-between; gap: 12px; }
  .job-title { font-weight: 700; font-size: 10.5pt; }
  .job-co { font-weight: 400; color: #444; font-size: 10pt; }
  .job-meta { color: #555; font-size: 9.5pt; white-space: nowrap; }
  .job-sub { color: #555; font-size: 9.5pt; margin-bottom: 3px; }
  ul { margin: 3px 0 0; padding-left: 14px; }
  li { margin: 0; }
  li::marker { color: #2f6b4f; }
  .early { display: grid; grid-template-columns: auto 1fr auto; gap: 2px 10px; font-size: 10pt; }
  .early .d { color: #555; white-space: nowrap; }
  .skills { display: grid; grid-template-columns: 88px 1fr; gap: 2px 10px; font-size: 10pt; }
  .skills b { font-weight: 700; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; }
  .links { font-size: 10pt; }
  .links div { margin: 1px 0; }
  .muted { color: #555; }
  .small { font-size: 9.5pt; margin-top: 4px; }
  /* Same yellow as the app's mark.need (--t-yellow, --t-yellow-ink, light values; the page is always white paper), plus a thin underline so it still shows in print. */
  .need { background: #fef7d6; color: #5c4209; border-radius: 4px; padding: 0 4px; box-shadow: inset 0 -1px 0 #e9d27a; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
  .stamp { margin-top: 6px; padding-top: 4px; border-top: 1px solid #e9d27a; text-align: center; font-size: 9pt; color: #7a5a00; letter-spacing: .04em; break-inside: avoid; }
  /* Density: a long CV steps down in size and spacing so it stays on one page. Chosen at render time from the text length (no script). */
  .dense1 { font-size: 9.5pt; line-height: 1.2; }
  .dense1 .contact, .dense1 .job-meta, .dense1 .job-sub, .dense1 .small, .dense1 .links, .dense1 h2 { font-size: 9pt; }
  .dense1 .summary, .dense1 .job-co, .dense1 .early, .dense1 .skills, .dense1 .links { font-size: 9.5pt; }
  .dense1 .job-title { font-size: 10pt; }
  .dense1 h2 { margin: 7px 0 3px; } .dense1 .job { margin-bottom: 4px; } .dense1 header { margin-bottom: 6px; padding-bottom: 4px; } .dense1 ul { margin-top: 2px; }
  .dense2 { font-size: 9pt; line-height: 1.2; }
  .dense2 .contact, .dense2 .job-meta, .dense2 .job-sub, .dense2 .small, .dense2 .links, .dense2 h2, .dense2 .summary, .dense2 .job-co, .dense2 .early, .dense2 .skills { font-size: 9pt; }
  .dense2 .job-title { font-size: 9.5pt; } .dense2 h1 { font-size: 20pt; } .dense2 .role { font-size: 10pt; }
  .dense2 h2 { margin: 5px 0 2px; } .dense2 .job { margin-bottom: 3px; } .dense2 header { margin-bottom: 4px; padding-bottom: 3px; } .dense2 ul { margin-top: 1px; padding-left: 12px; }
  .need-sub { display: block; margin-top: 1px; font-size: 9pt; }
  .need-sub .need { display: inline-block; }
  .n-short { display: none; }
  .need[data-full]::after { content: attr(data-full); }
  /* Screen only: the A4 page grows to ~816px in a wide window so the text is readable. Frames narrower than 860px (the app's preview and reader) stay true size. Print stays exactly A4. */
  @media screen and (min-width: 860px) { .page { zoom: 1.2; } body { padding-top: 12px; } }
  @media print { .page { zoom: 1; } }
  @media print { .need { background: #fef7d6; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .need[data-full]::after { content: none; } .n-short { display: inline; } }
`;

const countNeeds = (v) => {
  let n = 0;
  const walk = (x) => {
    if (typeof x === "string") n += (x.match(PLACEHOLDER) || []).length;
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") for (const [k, y] of Object.entries(x)) if (k !== "sources" && k !== "checks" && k !== "target") walk(y);
  };
  walk(v.header); walk(v.sections);
  return n;
};

/** A bullet that ends in [NEEDS ...] reads complete: the line is the text, and each trailing placeholder is its own highlighted sub-line under it. Placeholders in the middle of a sentence stay where they are. */
const TRAIL = /(?:\s*\[NEEDS(?: REAL NUMBER)?:[^\]]*\])+\s*[.;,]?\s*$/;
function bulletHtml(text) {
  const t = String(text ?? "");
  const m = TRAIL.exec(t);
  const head = m ? t.slice(0, m.index).replace(/\s+$/, "") : t;
  if (!m || !head.replace(PLACEHOLDER, "").trim()) return `<li>${need(t)}</li>`;
  const tail = (m[0].match(PLACEHOLDER) || []).map((x) => need(x)).join(" ");
  return `<li>${need(head)}<span class="need-sub">${tail}</span></li>`;
}

const bulletsOf = (it) => (Array.isArray(it.bullets) ? it.bullets : []).filter((b) => b && typeof b.text === "string" && b.text.trim());

/** The career file keeps a job heading as "Company · Title". The page shows the title first, then the company. */
function jobTitle(heading) {
  const h = String(heading || "");
  const at = h.indexOf(" · ");
  if (at < 0) return `<span class="job-title">${need(h)}</span>`;
  const company = h.slice(0, at).trim();
  const title = h.slice(at + 3).trim();
  return `<span class="job-title">${need(title)}</span><span class="job-co"> at ${need(company)}</span>`;
}

function job(it) {
  const bl = bulletsOf(it);
  return `  <div class="job">
    <div class="job-head"><span>${jobTitle(it.heading)}</span>${it.dates ? `<span class="job-meta">${need(it.dates)}</span>` : ""}</div>
${it.sub ? `    <div class="job-sub">${need(it.sub)}</div>\n` : ""}${bl.length ? `    <ul>\n${bl.map((b) => `      ${bulletHtml(b.text)}`).join("\n")}\n    </ul>\n` : ""}  </div>`;
}

function early(items) {
  const rows = items.map((it) => {
    const tail = [it.sub, ...bulletsOf(it).map((b) => b.text)].filter(Boolean).join(" · ");
    return `      <b>${need(it.heading)}</b><span>${need(tail)}</span><span class="d">${need(it.dates || "")}</span>`;
  });
  return `  <div class="job">
    <div class="job-head"><span class="job-title">Earlier roles and internships</span></div>
    <div class="early">
${rows.join("\n")}
    </div>
  </div>`;
}

function experience(sec) {
  const parts = [];
  let run = [];
  const flush = () => { if (run.length) { parts.push(early(run)); run = []; } };
  for (const it of sec.items || []) { if (it.compact === true) run.push(it); else { flush(); parts.push(job(it)); } }
  flush();
  return `  <h2>${need(sec.title)}</h2>\n\n${parts.join("\n\n")}`;
}

function skills(sec) {
  const rows = (sec.items || []).map((it) => `    <b>${need(it.heading)}</b><span>${need(bulletsOf(it).map((b) => b.text).join(" · "))}</span>`);
  return `  <h2>${need(sec.title)}</h2>\n  <div class="skills">\n${rows.join("\n")}\n  </div>`;
}

function education(sec) {
  const rows = (sec.items || []).map((it) => {
    const bl = bulletsOf(it).map((b) => b.text);
    if (it.compact === true) return `      <div class="muted small">${it.heading ? `<b>${need(it.heading)}</b>: ` : ""}${need(bl.join(" · "))}</div>`;
    const tail = [it.dates, ...bl].filter(Boolean).join(" · ");
    return `      <div><b>${need(it.heading)}</b>${it.sub ? `, ${need(it.sub)}` : ""}${tail ? ` <span class="muted">· ${need(tail)}</span>` : ""}</div>`;
  });
  return `    <div>\n      <h2>${need(sec.title)}</h2>\n${rows.join("\n")}\n    </div>`;
}

function links(sec) {
  const rows = gapsLast(sec.items || [], (it) => it.heading).map((it) => `      <div>${linked(it.heading)}${it.sub ? ` <span class="muted">· ${need(it.sub)}</span>` : ""}</div>`);
  return `    <div class="links">\n      <h2>${need(sec.title)}</h2>\n${rows.join("\n")}\n    </div>`;
}

/**
 * Renders a version to a full HTML document.
 * opts.stamp: true | false | undefined (undefined = stamp when facts are still needed). opts.title overrides the page title.
 */
export function renderCv(v, opts = {}) {
  const h = v.header || {};
  const needs = countNeeds(v);
  const stamp = opts.stamp === undefined ? needs > 0 : opts.stamp === true;
  const stampText = needs > 0 ? `Draft: ${needs} fact${needs === 1 ? "" : "s"} still needed` : "Draft";
  const contact = [
    h.location ? need(h.location) : "",
    h.email ? `<a href="mailto:${esc(h.email)}">${esc(h.email)}</a>` : "",
    ...gapsLast((h.links || []).filter((l) => l && l.url), (l) => l.url).map((l) => (safeUrl(l.url) ? `<a href="${esc(safeUrl(l.url))}" rel="noopener">${esc(bare(l.url))}</a>` : esc(l.url))),
  ].filter(Boolean);
  const secs = v.sections || [];
  const out = [];
  for (let i = 0; i < secs.length; i += 1) {
    const sec = secs[i];
    if (sec.kind === "summary") {
      const text = (sec.items || []).flatMap(bulletsOf).map((b) => b.text).join(" ");
      out.push(`  <p class="summary">${need(text)}</p>`);
    } else if (sec.kind === "skills") out.push(skills(sec));
    else if ((sec.kind === "education" || sec.kind === "links") && secs[i + 1] && (secs[i + 1].kind === "education" || secs[i + 1].kind === "links") && secs[i + 1].kind !== sec.kind) {
      const pair = [sec, secs[i + 1]].map((x) => (x.kind === "education" ? education(x) : links(x)));
      out.push(`  <div class="two">\n${pair.join("\n")}\n  </div>`);
      i += 1;
    } else if (sec.kind === "education") out.push(`  <div class="two">\n${education(sec)}\n  </div>`);
    else if (sec.kind === "links") out.push(`  <div class="two">\n${links(sec)}\n  </div>`);
    else out.push(experience(sec));
  }
  // Length of what a reader sees, by the same rule as visibleText.
  const len = out.join(" ").replace(/<span class="n-short">[^<]*<\/span>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").length + String(h.name || "").length + String(h.title || "").length + contact.join(" ").length;
  const density = len > 4900 ? "dense2" : len > 3700 ? "dense1" : "";
  const title = opts.title || `${h.name || "CV"}${h.title ? ` - ${h.title}` : ""} - CV`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base target="_blank">
<title>${esc(title)}</title>
<style>${CV_CSS}</style>
</head>
<body${density ? ` class="${density}"` : ""}>
<div class="page">
  <header>
    <div>
      <h1>${need(h.name || "")}</h1>
      <div class="role">${need(h.title || "")}</div>
    </div>
    <div class="contact">
      ${contact.join("<br>\n      ")}
    </div>
  </header>

${out.join("\n\n")}
${stamp ? `  <div class="stamp">${stampText}</div>\n` : ""}</div>
</body>
</html>
`;
}

/** The text of a rendered page without tags, styles or the draft stamp: what a reader (and a number check) sees. */
export function visibleText(html) {
  return String(html).replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<title>[\s\S]*?<\/title>/g, " ").replace(/<span class="n-short">[^<]*<\/span>/g, "").replace(/<div class="stamp">[\s\S]*?<\/div>/g, " ")
    .replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}
