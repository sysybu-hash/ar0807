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

const HEB2NUM = {
  א: 1,
  ב: 2,
  ג: 3,
  ד: 4,
  ה: 5,
  ו: 6,
  ז: 7,
  ח: 8,
  ט: 9,
  י: 10,
  כ: 20,
  ל: 30,
  מ: 40,
  נ: 50,
  ס: 60,
  ע: 70,
  פ: 80,
  צ: 90,
  ק: 100,
  ר: 200,
  ש: 300,
  ת: 400,
};

const NUM2HEB = Object.fromEntries(Object.entries(HEB2NUM).map(([k, v]) => [v, k]));

function num2digits(num) {
  const digits = [];
  let rest = num;
  while (rest > 0) {
    if (rest === 15 || rest === 16) {
      digits.push(9, rest - 9);
      break;
    }
    let incr = 100;
    let i;
    for (i = 400; i > rest; i -= incr) {
      if (i === incr) incr /= 10;
    }
    digits.push(i);
    rest -= i;
  }
  return digits;
}

/** Mirrors @hebcal/core gematriya — omits thousands ה for years 5000+. */
function gematriya(num) {
  const num1 = parseInt(num, 10);
  if (!num1 || num1 < 0) return String(num ?? "");
  let str = "";
  const thousands = Math.floor(num1 / 1000);
  if (thousands > 0 && thousands !== 5) {
    for (const tdig of num2digits(thousands)) str += NUM2HEB[tdig];
    str += GERSH;
  }
  const digits = num2digits(num1 % 1000);
  if (digits.length === 0) return str;
  if (digits.length === 1) return str + NUM2HEB[digits[0]] + GERSH;
  for (let i = 0; i < digits.length; i++) {
    if (i + 1 === digits.length) str += GERSHAYIM;
    str += NUM2HEB[digits[i]];
  }
  return str;
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
