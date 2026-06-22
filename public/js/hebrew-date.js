/** Browser mirror of lib/hebrew-date.mjs (Intl Hebrew calendar + gematriya-style year). */

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

const GERSH = "\u05F3";
const GERSHAYIM = "\u05F4";

function gematriya(num) {
  const n = Math.floor(Number(num));
  if (!Number.isFinite(n) || n <= 0) return String(num ?? "");
  const ones = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
  const tens = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
  const hundreds = ["", "ק", "ר", "ש", "ת"];
  let rest = n;
  let out = "";
  while (rest >= 400) {
    out += "ת";
    rest -= 400;
  }
  if (rest >= 100) {
    out += hundreds[Math.floor(rest / 100)];
    rest %= 100;
  }
  if (rest >= 10) {
    out += tens[Math.floor(rest / 10)];
    rest %= 10;
  }
  if (rest > 0) out += ones[rest];
  if (out.length === 1) return out + GERSH;
  return out.slice(0, -1) + GERSHAYIM + out.slice(-1);
}

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

export function formatHebrewDateFull(val, fallbackIso) {
  const d = parseIsoDate(val, fallbackIso);
  if (!d) return "";
  try {
    const parts = new Intl.DateTimeFormat("he-u-ca-hebrew", {
      weekday: "long",
      day: "numeric",
      month: "numeric",
      year: "numeric",
    }).formatToParts(d);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const weekday = map.weekday || WEEKDAYS_HE[d.getDay()] || "";
    const monthIdx = Number(map.month) - 1;
    const month = MONTHS_HE[monthIdx] || map.month || "";
    const day = gematriya(Number(map.day));
    const year = gematriya(Number(map.year));
    return `${weekday}, ${day} ב${month} ${year}`;
  } catch {
    return "";
  }
}
