// The one place money is turned into text. Pure: no node built-ins, so the app, the scripts and the validator can all import it.
// Rule: a money field is a number plus the currency (profile.situation.currency) and period it was asked in. A symbol is never
// assumed: a rupee sign appears only for INR, and the lakh and crore units only for INR with the `compact` option.
//
//   formatMoney(value, currency, period = "month", locale?, opts?)  ->  "USD 5,167 a month" style text, locale aware
//   monthlyOf(value, period)                                         ->  value per month from value per period
//   hasCurrency(profile)                                             ->  true when situation.currency is a valid code

const PERIOD_TEXT = { month: "a month", year: "a year", week: "a week", day: "a day", hour: "an hour" };
// Only INR groups digits its own way (1,50,000); every other code is shown as "CODE 78,000" so a reader never has to guess a locale.
const LOCALE_OF = { INR: "en-IN" };
const NO_DECIMALS = new Set(["JPY", "KRW", "VND", "IDR", "CLP", "HUF", "ISK"]);

/** True for a three letter currency code. */
export const isCurrency = (c) => typeof c === "string" && /^[A-Za-z]{3}$/.test(c.trim());

/** Value per month, from a value per `period` (month, year, week). Unknown periods return the value unchanged. */
export function monthlyOf(value, period = "month") {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (period === "year") return n / 12;
  if (period === "week") return (n * 52) / 12;
  return n;
}

/** Whether a profile carries the currency its money fields are in. */
export function hasCurrency(profile) {
  return !!(profile && profile.situation && isCurrency(profile.situation.currency));
}

/**
 * Text for one money value. `currency` is the code the value is in; `period` month (default), year, week, day, hour, or null/"none"
 * for a plain amount. `locale` defaults to the usual locale of the currency. opts.compact: INR only, 1.2L and 1.2Cr.
 * opts.display "code" | "symbol": the code (USD 5,167) is the default for every currency but INR, which shows its own sign.
 * Never throws: a missing or invalid currency is said out loud instead of being guessed.
 */
export function formatMoney(value, currency, period = "month", locale, opts = {}) {
  const n = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(n)) return "";
  const cur = isCurrency(currency) ? String(currency).trim().toUpperCase() : "";
  const suffix = period && period !== "none" && PERIOD_TEXT[period] ? ` ${PERIOD_TEXT[period]}` : "";
  const loc = locale || LOCALE_OF[cur] || "en-US";
  const digits = NO_DECIMALS.has(cur) ? 0 : Math.abs(n) < 1000 && Math.round(n) !== n ? 2 : 0;
  let body;
  if (!cur) body = `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })} (currency not set)`;
  else if (cur === "INR" && opts.compact === true && Math.abs(n) >= 100000) {
    const abs = Math.abs(n);
    const v = abs >= 10000000 ? `${(abs / 10000000).toFixed(abs % 10000000 === 0 ? 0 : 1)}Cr` : `${(abs / 100000).toFixed(abs % 100000 === 0 ? 0 : 1)}L`;
    body = `${n < 0 ? "-" : ""}₹${v}`;
  } else {
    try { body = new Intl.NumberFormat(loc, { style: "currency", currency: cur, currencyDisplay: (opts.display || (cur === "INR" ? "symbol" : "code")) === "symbol" ? "symbol" : "code", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n); }
    catch { body = `${cur} ${n.toLocaleString("en-US", { maximumFractionDigits: digits })}`; }
    // "USD 5,167" with a plain space, whatever the locale puts between code and number.
    body = body.replace(/ /g, " ");
  }
  return `${body}${suffix}`;
}
