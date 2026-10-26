/** @typedef {"installation"|"portable"|"ev_charging"|"water_heater"} DocTypeId */

export const ALLOWED_DOC_TYPES = /** @type {const} */ (["installation", "portable", "ev_charging", "water_heater"]);

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
  water_heater: {
    id: "water_heater",
    label: "אישור ויסות טמפרטורת מים חמים",
    shortLabel: "ויסות מים חמים",
    pdfTitle: "אישור ויסות טמפרטורת מים חמים בדוד",
    legalRef: "הגבלת טמפרטורת מים חמים בנקודות הצריכה — עד 45°C",
  },
};

/** Maximum allowed hot-water temperature (°C) at the consumption points. */
export const WATER_TEMP_LIMIT_C = 45;

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

export function defaultExtraForType(docType) {
  const t = normalizeDocType(docType);
  const base = {
    docNo: "",
    workflowStatus: "draft",
    inspectionDate: "",
    issueDate: "",
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
  if (t === "water_heater") {
    return {
      ...base,
      clientName: "",
      heaterType: "חשמלי",
      heaterManufacturer: "",
      heaterModel: "",
      heaterCapacityLiters: "",
      heaterPowerKw: "",
      regulationMethod: "תרמוסטט בדוד",
      thermostatSetpoint: "",
      measurements: defaultWaterTempMeasurements(),
      checks: defaultWaterHeaterChecks(),
      finalStatusBanner: "",
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
    { item: "לחצן בדיקה (Test)", result: "תקין" },
    { item: "הגנה מפני עומס יתר", result: "תקין" },
  ];
}

/** Rows omitted from EV certificate PDF / print output. */
export function filterEvChecksForOutput(checks) {
  const omit = new Set(["תיוג וסימון", "תיווי וסימון"]);
  return (Array.isArray(checks) ? checks : []).filter(
    (c) => !omit.has(String(c.item || "").trim())
  );
}

export function defaultEvPeriodicTests() {
  return [{ test: "מערכת הארקה והגנה", frequency: "שנתי", lastDate: "", result: "—" }];
}

/** Keep only מערכת הארקה והגנה; drop rows removed from the certificate template. */
export function filterEvPeriodicTestsForOutput(tests) {
  const omit = new Set(["ניתוק מיידי של אספקת החשמל", "מפסק מגן ועומס יתר"]);
  const kept = (Array.isArray(tests) ? tests : []).filter(
    (p) => !omit.has(String(p.test || "").trim())
  );
  const grounding = kept.find((p) => String(p.test || "").trim() === "מערכת הארקה והגנה");
  if (grounding) return [grounding];
  return defaultEvPeriodicTests();
}

export function defaultWaterTempMeasurements() {
  return [
    { point: "ברז מטבח", temperature: "", result: "—" },
    { point: "מקלחת / אמבטיה", temperature: "", result: "—" },
    { point: "כיור רחצה", temperature: "", result: "—" },
  ];
}

export function defaultWaterHeaterChecks() {
  return [
    { item: "תרמוסטט / בקר טמפרטורה מכוון ופועל", result: "תקין" },
    { item: "מערבל תרמוסטטי (במידה ומותקן)", result: "—" },
    { item: "הארקת גוף הדוד", result: "תקין" },
    { item: "הגנת פחת (RCD) למעגל הדוד", result: "תקין" },
    { item: "חיווט, חיבורים ומפסק הדוד", result: "תקין" },
  ];
}

/** Parse a temperature reading such as "44", "44.5", "44,5" or "44°C"; NaN when empty / invalid. */
export function parseTemperature(v) {
  const m = /-?\d+(?:[.,]\d+)?/.exec(String(v ?? ""));
  return m ? Number(m[0].replace(",", ".")) : NaN;
}

/** "תקין" when the reading is at most the limit, "לא תקין" above it, "—" without a reading. */
export function evaluateWaterTemp(temperature, limit = WATER_TEMP_LIMIT_C) {
  const n = parseTemperature(temperature);
  if (Number.isNaN(n)) return "—";
  return n <= limit ? "תקין" : "לא תקין";
}

/** Measurement rows with the result always derived from the measured temperature. */
export function normalizeWaterTempMeasurements(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    point: String(r?.point ?? ""),
    temperature: String(r?.temperature ?? ""),
    result: evaluateWaterTemp(r?.temperature),
  }));
}

/** Overall verdict and status line for a hot-water certificate. */
export function waterTempVerdict(extra) {
  const rows = normalizeWaterTempMeasurements(extra?.measurements);
  const measured = rows.filter((r) => r.result !== "—");
  const exceeded = measured.filter((r) => r.result === "לא תקין");
  const temps = measured.map((r) => parseTemperature(r.temperature));
  const maxTemp = temps.length ? Math.max(...temps) : null;
  let status = "pending";
  let banner = "לא הוזנו מדידות טמפרטורה";
  if (exceeded.length) {
    status = "fail";
    banner = `לא תקין — נמדדה טמפרטורה של ${maxTemp}°C, מעל ${WATER_TEMP_LIMIT_C}°C`;
  } else if (measured.length) {
    status = "ok";
    banner =
      String(extra?.finalStatusBanner || "").trim() ||
      `תקין — טמפרטורת המים החמים אינה עולה על ${WATER_TEMP_LIMIT_C}°C · טמפרטורה מרבית שנמדדה: ${maxTemp}°C`;
  }
  return { status, banner, maxTemp, rows, exceeded };
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
  if (normalizeDocType(docType) === "water_heater") {
    if (!Array.isArray(merged.measurements) || merged.measurements.length === 0) {
      merged.measurements = defaultWaterTempMeasurements();
    }
    merged.measurements = normalizeWaterTempMeasurements(merged.measurements);
    if (!Array.isArray(merged.checks) || merged.checks.length === 0) merged.checks = defaultWaterHeaterChecks();
  }
  return merged;
}
