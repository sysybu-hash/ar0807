/** Client mirror of lib/cert-types.mjs */
export const ALLOWED_DOC_TYPES = ["installation", "portable", "ev_charging"];

export const CERT_TYPES = {
  installation: {
    id: "installation",
    label: "אישור תקינות מתקן",
    shortLabel: "תקינות מתקן",
    pdfTitle: "אישור תקינות מתקן חשמל",
  },
  portable: {
    id: "portable",
    label: "אישור תקינות צרכנים מיטלטלים",
    shortLabel: "צרכנים מיטלטלים",
    pdfTitle: "אישור תקינות צרכנים מיטלטלים",
  },
  ev_charging: {
    id: "ev_charging",
    label: "אישור תקינות עמדת טעינה",
    shortLabel: "עמדת טעינה",
    pdfTitle: "אישור תקינות עמדת טעינה לרכב חשמלי",
  },
};

export function isAllowedDocType(v) {
  return ALLOWED_DOC_TYPES.includes(v);
}

export function certTypeLabel(docType) {
  return CERT_TYPES[docType]?.label ?? docType ?? "—";
}

export function certTypeShortLabel(docType) {
  return CERT_TYPES[docType]?.shortLabel ?? certTypeLabel(docType);
}

export function defaultTechRows() {
  return [
    { description: "לולאת תקלה (LT)", result: "—" },
    { description: "בידוד (L-PE)", result: "—" },
    { description: "בידוד (N-PE)", result: "—" },
    { description: "מפסק פחת — זמן ניתוק", result: "—" },
    { description: "זרם הדלקה (mA)", result: "—" },
  ];
}

export function defaultVisualChecklist() {
  return [
    "סימון ותיוג לוחות",
    "גישה בטוחה ללוח",
    "כיסוי ומגן מגע",
    "חיווט מסודר ומבודד",
    "רציפות הארקה",
    "מפסק ראשי וניתוק חירום (במידת הצורך)",
  ];
}

export function defaultPortableApplianceRow() {
  return {
    assetId: "",
    description: "",
    location: "",
    visualOk: "תקין",
    earthContinuity: "—",
    insulation: "—",
    leakage: "—",
    result: "תקין",
    nextTestDate: "",
  };
}

export function defaultEvChecks() {
  return [
    { item: "הארקה ורציפות", result: "תקין" },
    { item: "מפסק מגן (RCD)", result: "תקין" },
    { item: "כבל ומסלול", result: "תקין" },
    { item: "תיוג וסימון", result: "תקין" },
    { item: "לחצן בדיקה (Test)", result: "תקין" },
    { item: "הגנה מפני עומס יתר", result: "תקין" },
  ];
}

export function defaultEvPeriodicTests() {
  return [
    { test: "ניתוק מיידי של אספקת החשמל", frequency: "6 חודשים", lastDate: "", result: "—" },
    { test: "מפסק מגן ועומס יתר", frequency: "3 שנים", lastDate: "", result: "—" },
    { test: "מערכת הארקה והגנה", frequency: "שנתי", lastDate: "", result: "—" },
  ];
}

export const INSPECTION_PURPOSES = [
  "מתקן חדש",
  "הגדלת חיבור",
  "בדיקה חוזרת",
  "שינוי במתקן",
  "חידוש אספקה",
];

export const SITE_KINDS = ["פרטי", "משותף", "ציבורי", "מסחרי"];

export const CHARGE_TYPES = ["AC", "DC", "AC/DC"];
