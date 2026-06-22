/** Client mirror of lib/cert-types.mjs */
export const ALLOWED_DOC_TYPES = ["installation", "portable", "ev_charging"];

export const CERT_TYPES = {
  installation: {
    id: "installation",
    label: "אישור תקינות מתקן",
    shortLabel: "תקינות מתקן",
    pdfTitle: "אישור תקינות מתקן חשמל",
    legalRef: "חוק החשמל תשי״ד-1954, תקנותיו, ת\"י 60364 ו-IEC 60364",
  },
  portable: {
    id: "portable",
    label: "אישור תקינות צרכנים מטלטלים",
    shortLabel: "צרכנים מטלטלים",
    pdfTitle: "אישור תקינות צרכנים מטלטלים",
    legalRef: "ת\"י 900, חוק החשמל ותקנותיו — בדיקת ציוד מטלטל (PAT)",
  },
  ev_charging: {
    id: "ev_charging",
    label: "אישור תקינות עמדת טעינה",
    shortLabel: "עמדת טעינה",
    pdfTitle: "אישור תקינות עמדת טעינה לרכב חשמלי",
    legalRef: "IEC 60364-7-722, IEC 61851-1/61851-23, הנחיות רשות החשמל",
  },
};

export function isAllowedDocType(v) {
  return ALLOWED_DOC_TYPES.includes(v);
}

export function normalizeDocType(v) {
  const s = String(v || "").trim();
  return isAllowedDocType(s) ? s : "installation";
}

export function certTypeLabel(docType) {
  return CERT_TYPES[normalizeDocType(docType)]?.label ?? docType;
}

export function certTypeShortLabel(docType) {
  return CERT_TYPES[normalizeDocType(docType)]?.shortLabel ?? certTypeLabel(docType);
}

export function defaultExtraForType(docType) {
  const t = normalizeDocType(docType);
  const base = {
    docNo: "",
    workflowStatus: "draft",
    inspectionDate: "",
    legalSubtitle: "",
  };
  if (t === "installation") {
    return {
      ...base,
      clientName: "",
      installationType: "",
      inspectionPurpose: "מתקן חדש",
      connectionExisting: "",
      connectionRequested: "",
      panelMeterNo: "",
      finalStatusBanner: "תקין — המתקן מאושר לשימוש",
      techInspection: defaultTechRows(),
      visualChecklist: defaultVisualChecklist(),
    };
  }
  if (t === "portable") {
    return {
      ...base,
      siteName: "",
      employerName: "",
      markingMethod: "מדבקה עם תאריך בדיקה",
      appliances: [],
      summary: "",
    };
  }
  return {
    ...base,
    ownerName: "",
    siteKind: "פרטי",
    stationManufacturer: "",
    stationModel: "",
    stationSerial: "",
    stationPowerKw: "",
    chargeType: "AC",
    connectorType: "",
    importerDeclarationRef: "",
    importerDeclarationDate: "",
    installerName: "",
    installerLicense: "",
    iec61851Ref: "IEC 61851-1",
    checks: defaultEvChecks(),
    periodicTests: defaultEvPeriodicTests(),
    gridApprovalBanner: "מאושר לחיבור לרשת לפני הפעלה ראשונה",
  };
}

export function defaultTechRows() {
  return [
    { description: "לולאת תקלה (LT)", result: "—" },
    { description: "בידוד (L-PE)", result: "—" },
    { description: "בידוד (N-PE)", result: "—" },
    { description: "מפסק פחת — זמן ניתוק", result: "—" },
    { description: "זרם הקפצה (mA)", result: "—" },
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

export function mergeExtraForType(docType, extra) {
  const defaults = defaultExtraForType(docType);
  const src = extra && typeof extra === "object" ? extra : {};
  const merged = { ...defaults, ...src };
  if (normalizeDocType(docType) === "installation") {
    if (!Array.isArray(merged.techInspection) || merged.techInspection.length === 0) {
      merged.techInspection = defaultTechRows();
    }
    if (!Array.isArray(merged.visualChecklist) || merged.visualChecklist.length === 0) {
      merged.visualChecklist = defaultVisualChecklist();
    }
  }
  if (normalizeDocType(docType) === "portable" && !Array.isArray(merged.appliances)) {
    merged.appliances = [];
  }
  if (normalizeDocType(docType) === "ev_charging") {
    if (!Array.isArray(merged.checks) || merged.checks.length === 0) merged.checks = defaultEvChecks();
    if (!Array.isArray(merged.periodicTests) || merged.periodicTests.length === 0) {
      merged.periodicTests = defaultEvPeriodicTests();
    }
  }
  return merged;
}

export const INSPECTION_PURPOSES = [
  "מתקן חדש",
  "הגדלת חיבור",
  "בדיקה חוזרת",
  "שינוי במתקן",
  "חידוש אספקה",
];

export const SITE_KINDS = ["פרטי", "משותף", "ציבורי", "מסחרי"];
