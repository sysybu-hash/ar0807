import { HDate, gematriya } from "@hebcal/core";

const WEEKDAYS_HE = [
  "יום ראשון",
  "יום שני",
  "יום שלישי",
  "יום רביעי",
  "יום חמישי",
  "יום שישי",
  "יום שבת",
];

const MONTHS_HE = [
  "ניסן",
  "אייר",
  "סיוון",
  "תמוז",
  "אב",
  "אלול",
  "תשרי",
  "חשוון",
  "כסלו",
  "טבת",
  "שבט",
  "אדר",
  "אדר ב׳",
];

/** @param {string|undefined|null} val @param {string|undefined|null} [fallbackIso] */
export function parseIsoDate(val, fallbackIso) {
  if (val && typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) {
    return new Date(`${val.trim()}T12:00:00`);
  }
  if (val && String(val).trim()) {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (fallbackIso) {
    const d = new Date(fallbackIso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/** Full Jewish Hebrew date, e.g. יום שני, ז׳ בתמוז תשפ״ו */
export function formatHebrewDateFull(val, fallbackIso) {
  const d = parseIsoDate(val, fallbackIso);
  if (!d) return "";
  const hd = new HDate(d);
  const weekday = WEEKDAYS_HE[hd.getDay()] ?? "";
  const day = gematriya(hd.getDate());
  const month = MONTHS_HE[hd.getMonth() - 1] ?? "";
  const year = gematriya(hd.getFullYear());
  if (!month) return "";
  return `${weekday}, ${day} ב${month} ${year}`;
}
